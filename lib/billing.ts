import { getSubscription, getSubscriptionByProviderId, upsertSubscription, getUserById, type Subscription } from './db'
import { getTier, type TierId } from './pricing'
import { paddleConfigured, getPriceId, createCheckout, verifyPaddleSignature } from './paddle'

// ── Billing (Paddle) ─────────────────────────────────────────────────────
//
// Real Paddle subscription billing when PADDLE_API_KEY is set (see
// lib/paddle.ts); a dev-simulated fallback otherwise so the gated flow
// (account -> paywall -> unlocked) can be built and tested without a real
// provider. The dev fallback is hard-blocked outside development. Nothing
// here ever fakes a successful *webhook* — only the initial "subscribe"
// action has a dev bypass.
//
// Paddle is a Merchant of Record — display prices in lib/pricing.ts are
// copy only; what a customer is actually charged is whatever each Price is
// configured for in the Paddle dashboard, referenced here only by id (see
// getPriceId), never a manually-computed amount. Paddle also bills in USD
// regardless of seller country — the reason it replaced Paystack, whose
// South African settlement is ZAR-only.

export function billingConfigured(): boolean {
  return paddleConfigured()
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
      await upsertSubscription(userId, {
        plan: tier.id,
        status: 'active',
        provider: 'dev-simulated',
        currentPeriodEnd,
        videoAllowance: tier.videoAllowance,
        videosUsedThisCycle: 0,
      })
      return { checkoutUrl: returnPath || '/billing' }
    }
    return { error: 'Billing isn’t configured yet — set PADDLE_API_KEY in .env.local.' }
  }

  const priceId = getPriceId(tier.id as TierId)
  if (!priceId) {
    return { error: `No Paddle Price configured for "${tier.name}" — create it in the Paddle dashboard and set the matching env var (see .env.local.example).` }
  }

  const user = await getUserById(userId)
  if (!user) return { error: 'Account not found.' }

  const base = appBaseUrl()
  const target = returnPath || '/billing'

  const result = await createCheckout({
    email: user.email,
    priceId,
    returnUrl: `${base}${target}`,
    customData: { userId, tier: tier.id },
  })

  if ('error' in result) return result
  return { checkoutUrl: result.checkoutUrl }
}

function mapTierByPriceId(priceId: string | undefined): ReturnType<typeof getTier> {
  if (!priceId) return undefined
  for (const t of ['minimum', 'growth', 'scale'] as const) {
    if (getPriceId(t) === priceId) return getTier(t)
  }
  return undefined
}

type PaddleWebhookPayload = {
  event_type?: string
  data?: {
    id?: string
    status?: string
    customer_id?: string
    current_billing_period?: { starts_at?: string | null; ends_at?: string | null } | null
    custom_data?: Record<string, string> | null
    items?: { price?: { id?: string } }[]
  }
}

export async function handleWebhookEvent(
  rawBody: string,
  signature: string | null
): Promise<{ handled: boolean; error?: string }> {
  if (!billingConfigured()) {
    return { handled: false, error: 'Billing isn’t configured yet.' }
  }
  if (!verifyPaddleSignature(rawBody, signature)) {
    // Never trust an unverified payload.
    return { handled: false, error: 'Invalid webhook signature' }
  }

  let payload: PaddleWebhookPayload
  try {
    payload = JSON.parse(rawBody)
  } catch {
    return { handled: false, error: 'Invalid webhook body' }
  }

  const eventName = payload.event_type
  const data = payload.data || {}
  const customData = data.custom_data || {}
  const providerCustomerId = data.customer_id
  const providerSubscriptionId = data.id
  const priceId = data.items?.[0]?.price?.id
  const periodEnd = data.current_billing_period?.ends_at ?? null

  // custom_data (set at checkout — see startCheckout above) propagates from
  // the transaction onto the subscription it creates, and onto renewals of
  // it, per Paddle's docs — reliable enough to be the primary lookup.
  // Falling back to the stored Paddle customer id covers the rare case it
  // doesn't round-trip on some later event.
  async function resolveUserId(): Promise<string | undefined> {
    if (customData.userId) return customData.userId
    if (providerCustomerId) {
      const existing = await getSubscriptionByProviderId(providerCustomerId)
      if (existing) return existing.userId
    }
    return undefined
  }

  switch (eventName) {
    case 'subscription.created': {
      const userId = await resolveUserId()
      const tier = customData.tier ? getTier(customData.tier) : mapTierByPriceId(priceId)
      if (!userId || !tier) break

      await upsertSubscription(userId, {
        plan: tier.id,
        status: 'active',
        provider: 'paddle',
        providerCustomerId,
        providerSubscriptionId,
        currentPeriodEnd: periodEnd,
        videoAllowance: tier.videoAllowance,
        videosUsedThisCycle: 0,
      })
      break
    }

    // Fires on plan changes, status changes, AND every renewal (Paddle
    // rolls current_billing_period forward on each successful renewal
    // rather than sending a separate "payment succeeded" event with its own
    // semantics). Unused videos don't roll over, so usage only resets when
    // the period end this event carries is actually later than what's
    // already stored — a same-cycle update (e.g. a status change) is
    // correctly a no-op here; only a genuine renewal advances it further.
    case 'subscription.updated':
    case 'subscription.activated': {
      const userId = await resolveUserId()
      if (!userId) break
      const existing = await getSubscription(userId)
      const tier = mapTierByPriceId(priceId)

      const isNewCycle = !existing.currentPeriodEnd
        || (!!periodEnd && new Date(periodEnd).getTime() > new Date(existing.currentPeriodEnd).getTime())

      const status = data.status === 'active' || data.status === 'trialing' ? 'active'
        : data.status === 'past_due' ? 'past_due'
        : data.status === 'canceled' || data.status === 'paused' ? 'canceled'
        : existing.status

      await upsertSubscription(userId, {
        status,
        provider: 'paddle',
        providerCustomerId: providerCustomerId || existing.providerCustomerId,
        providerSubscriptionId: providerSubscriptionId || existing.providerSubscriptionId,
        currentPeriodEnd: periodEnd ?? existing.currentPeriodEnd,
        ...(tier ? { plan: tier.id, videoAllowance: tier.videoAllowance } : {}),
        ...(isNewCycle ? { videosUsedThisCycle: 0 } : {}),
      })
      break
    }

    case 'subscription.canceled': {
      const userId = await resolveUserId()
      if (!userId) break
      await upsertSubscription(userId, { status: 'canceled' })
      break
    }

    default:
      break
  }

  return { handled: true }
}

export { upsertSubscription }
