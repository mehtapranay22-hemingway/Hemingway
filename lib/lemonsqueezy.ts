import { createHmac, timingSafeEqual } from 'crypto'
import type { TierId } from './pricing'

// Server-only. Never import this from a 'use client' file — LEMONSQUEEZY_API_KEY
// must never reach the browser bundle.
//
// Plain fetch() against Lemon Squeezy's REST (JSON:API) endpoints rather
// than a wrapper package — matches how this app already talks to
// Seedance/HeyGen/Shotstack (see lib/seedance.ts).
//
// Lemon Squeezy is a Merchant of Record — it sells on the account holder's
// behalf, so unlike Stripe or Paystack it isn't gated by the seller's own
// country. That's the whole reason this app is on Lemon Squeezy rather than
// either of those.

const LS_BASE = 'https://api.lemonsqueezy.com/v1'

export function lemonSqueezyConfigured(): boolean {
  return !!process.env.LEMONSQUEEZY_API_KEY && !!process.env.LEMONSQUEEZY_STORE_ID
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.LEMONSQUEEZY_API_KEY || ''}`,
    'Content-Type': 'application/vnd.api+json',
    Accept: 'application/vnd.api+json',
  }
}

// One real Lemon Squeezy recurring Variant per self-serve tier, created in
// the Lemon Squeezy dashboard (test mode first) and referenced here by env
// var — never a manually-reconstructed amount. Checkout always references
// the Variant by id, so what a customer is charged is exactly whatever that
// Variant's price is configured for, not a number this app computes.
const VARIANT_ENV_VAR: Record<Exclude<TierId, 'enterprise'>, string> = {
  minimum: 'LEMONSQUEEZY_VARIANT_MINIMUM',
  growth: 'LEMONSQUEEZY_VARIANT_GROWTH',
  scale: 'LEMONSQUEEZY_VARIANT_SCALE',
}

export function getVariantId(tier: TierId): string | null {
  if (tier === 'enterprise') return null
  return process.env[VARIANT_ENV_VAR[tier]] || null
}

export async function createCheckout(params: {
  email: string
  variantId: string
  redirectUrl: string
  customData: Record<string, string>
}): Promise<{ checkoutUrl: string } | { error: string }> {
  try {
    const res = await fetch(`${LS_BASE}/checkouts`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: params.email,
              custom: params.customData,
            },
            product_options: {
              redirect_url: params.redirectUrl,
            },
          },
          relationships: {
            store: { data: { type: 'stores', id: process.env.LEMONSQUEEZY_STORE_ID } },
            variant: { data: { type: 'variants', id: params.variantId } },
          },
        },
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      const message = body?.errors?.[0]?.detail || `Lemon Squeezy error ${res.status}`
      return { error: message }
    }
    const checkoutUrl = body?.data?.attributes?.url
    if (!checkoutUrl) return { error: 'Lemon Squeezy did not return a checkout URL.' }
    return { checkoutUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Lemon Squeezy request failed' }
  }
}

// Lemon Squeezy signs webhook bodies with an HMAC-SHA256 hex digest of the
// raw payload using your signing secret, sent in the `X-Signature` header.
export function verifyLemonSqueezySignature(rawBody: string, signature: string | null): boolean {
  if (!signature || !process.env.LEMONSQUEEZY_WEBHOOK_SECRET) return false
  const expected = createHmac('sha256', process.env.LEMONSQUEEZY_WEBHOOK_SECRET).update(rawBody).digest('hex')
  const a = Buffer.from(expected)
  const b = Buffer.from(signature)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
