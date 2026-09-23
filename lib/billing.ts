import { getSubscription, getSubscriptionByProviderId, upsertSubscription, getUserById, type Subscription } from './db'
import { getTier, type TierId } from './pricing'
import { lemonSqueezyConfigured, getVariantId, createCheckout, verifyLemonSqueezySignature } from './lemonsqueezy'

// ── Billing (Lemon Squeezy) ──────────────────────────────────────────────
//
// Real Lemon Squeezy subscription billing when LEMONSQUEEZY_API_KEY and
// LEMONSQUEEZY_STORE_ID are set (see lib/lemonsqueezy.ts); a dev-simulated
// fallback otherwise so the gated flow (account -> paywall -> unlocked) can
// be built and tested without a real provider. The dev fallback is
// hard-blocked outside development. Nothing here ever fakes a successful
// *webhook* — only the initial "subscribe" action has a dev bypass.
//
// Lemon Squeezy is a Merchant of Record — display prices in lib/pricing.ts
// are copy only; what a customer is actually charged is whatever each
// Variant is priced at in the Lemon Squeezy dashboard, referenced here only
// by id (see getVariantId), never a manually-computed amount.

export function billingConfigured(): boolean {
  return lemonSqueezyConfigured()
}

export async function getBillingStatus(userId: string): Promise<Subscription> {
  return getSubscription(userId)
}

const DEV_SIMULATED_PLAN_DAYS = 30

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

export async function startCheckout(
  userId: string,
  tierId: string,
  returnPath?: string
): Promise<{ checkoutUrl: string } | { error: string }> {
  const tier = getTier(tierId)
  if (!tier) return { error: `Unknown plan "${tierId}".` }
  if (tier.enterprise) return { error: 'Enterprise plans are set up directly — use the contact link, not checkout.' }

  if (!billingConfigured()) {
    // Dev-only bypass — see module comment above.
    if (process.env.NODE_ENV !== 'production') {
      const currentPeriodEnd = new Date(Date.now() + DEV_SIMULATED_PLAN_DAYS * 24 * 60 * 60 * 1000).toISOString()
      upsertSubscription(userId, {
        plan: tier.id,
        status: 'active',
        provider: 'dev-simulated',
        currentPeriodEnd,
        videoAllowance: tier.videoAllowance,
        videosUsedThisCycle: 0,
      })
      return { checkoutUrl: returnPath || '/billing' }
    }
    return { error: 'Billing isn’t configured yet — set LEMONSQUEEZY_API_KEY and LEMONSQUEEZY_STORE_ID in .env.local.' }
  }

  const variantId = getVariantId(tier.id as TierId)
  if (!variantId) {
    return { error: `No Lemon Squeezy Variant configured for "${tier.name}" — create it in the Lemon Squeezy dashboard and set the matching env var (see .env.local.example).` }
  }

  const user = getUserById(userId)
  if (!user) return { error: 'Account not found.' }

  const base = appBaseUrl()
  const target = returnPath || '/billing'

  const result = await createCheckout({
    email: user.email,
    variantId,
    redirectUrl: `${base}${target}`,
    customData: { userId, tier: tier.id },
  })

  if ('error' in result) return result
  return { checkoutUrl: result.checkoutUrl }
}

function mapTierByVariant(variantId: string | number | undefined): ReturnType<typeof getTier> {
  if (variantId == null) return undefined
  const id = String(variantId)
  for (const t of ['minimum', 'growth', 'scale'] as const) {
    if (getVariantId(t) === id) return getTier(t)
  }
  return undefined
}

type LemonSqueezyWebhookPayload = {
  meta?: { event_name?: string; custom_data?: Record<string, string> }
  data?: {
    id?: string
    attributes?: {
      status?: string
      renews_at?: string | null
      ends_at?: string | null
      customer_id?: number
      variant_id?: number
    }
  }
}

export async function handleWebhookEvent(
  rawBody: string,
  signature: string | null,
  eventNameHeader?: string | null
): Promise<{ handled: boolean; error?: string }> {
  if (!billingConfigured()) {
    return { handled: false, error: 'Billing isn’t configured yet.' }
  }
  if (!verifyLemonSqueezySignature(rawBody, signature)) {
    // Never trust an unverified payload.
    return { handled: false, error: 'Invalid webhook signature' }
  }

  let payload: LemonSqueezyWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { handled: false, error: 'Invalid webhook body' }
  }

  // Lemon Squeezy sends the event name both as the X-Event-Name header and
  // in the body's meta.event_name — the header is authoritative (cheaper to
  // read, and confirmed by their docs to always carry the same value),
  // body meta.event_name is the fallback if the header is ever missing.
  const eventName = eventNameHeader || payload.meta?.event_name
  const customData = payload.meta?.custom_data || {}
  const attrs = payload.data?.attributes || {}
  const providerCustomerId = attrs.customer_id != null ? String(attrs.customer_id) : undefined
  const providerSubscriptionId = payload.data?.id

  // custom_data (set at checkout — see startCheckout above) is echoed back
  // on every Order/Subscription/License event tied to that checkout, per
  // Lemon Squeezy's own docs — reliable enough to be the primary lookup.
  // Falling back to the stored Lemon Squeezy customer id covers the rare
  // case it doesn't round-trip on some later event.
  function resolveUserId(): string | undefined {
    if (customData.userId) return customData.userId
    if (providerCustomerId) {
      const existing = getSubscriptionByProviderId(providerCustomerId)
      if (existing) return existing.userId
    }
    return undefined
  }

  switch (eventName) {
    case 'subscription_created': {
      const userId = resolveUserId()
      const tier = customData.tier ? getTier(customData.tier) : mapTierByVariant(attrs.variant_id)
      if (!userId || !tier) break

      upsertSubscription(userId, {
        plan: tier.id,
        status: 'active',
        provider: 'lemonsqueezy',
        providerCustomerId,
        providerSubscriptionId,
        currentPeriodEnd: attrs.renews_at || null,
        videoAllowance: tier.videoAllowance,
        videosUsedThisCycle: 0,
      })
      break
    }

    // Fires for both the very first subscription payment and every
    // automatic renewal (Lemon Squeezy changed this to include first
    // payments too — there's no separate "renewal only" event anymore).
    // Unused videos don't roll over, so usage only resets when the
    // renewal date this event carries is actually later than what's
    // already stored — the first payment's renews_at is the same value
    // subscription_created just set moments earlier, so it's correctly a
    // no-op here; only a genuine renewal advances it further.
    case 'subscription_payment_success': {
      const userId = resolveUserId()
      if (!userId) break

      const existing = getSubscription(userId)
      const newRenewsAt = attrs.renews_at || null
      const isNewCycle = !existing.currentPeriodEnd
        || (!!newRenewsAt && new Date(newRenewsAt).getTime() > new Date(existing.currentPeriodEnd).getTime())

      upsertSubscription(userId, {
        status: 'active',
        provider: 'lemonsqueezy',
        providerCustomerId: providerCustomerId || existing.providerCustomerId,
        providerSubscriptionId: providerSubscriptionId || existing.providerSubscriptionId,
        currentPeriodEnd: newRenewsAt || existing.currentPeriodEnd,
        ...(isNewCycle ? { videosUsedThisCycle: 0 } : {}),
      })
      break
    }

    case 'subscription_updated': {
      const userId = resolveUserId()
      if (!userId) break
      const existing = getSubscription(userId)
      const tier = mapTierByVariant(attrs.variant_id)

      const status = attrs.status === 'active' || attrs.status === 'on_trial' ? 'active'
        : attrs.status === 'past_due' || attrs.status === 'unpaid' ? 'past_due'
        : attrs.status === 'cancelled' || attrs.status === 'expired' ? 'canceled'
        : existing.status

      upsertSubscription(userId, {
        status,
        currentPeriodEnd: attrs.renews_at ?? existing.currentPeriodEnd,
        ...(tier ? { plan: tier.id, videoAllowance: tier.videoAllowance } : {}),
      })
      break
    }

    case 'subscription_cancelled':
    case 'subscription_expired': {
      const userId = resolveUserId()
      if (!userId) break
      upsertSubscription(userId, { status: 'canceled' })
      break
    }

    default:
      break
  }

  return { handled: true }
}

export { upsertSubscription }
