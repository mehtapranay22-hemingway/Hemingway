import { createHmac, timingSafeEqual } from 'crypto'
import type { TierId } from './pricing'

// Server-only. Never import this from a 'use client' file — PADDLE_API_KEY
// must never reach the browser bundle.
//
// Plain fetch() against Paddle's Billing REST API rather than their SDK
// package — matches how this app already talks to every other provider
// (Seedance, Lemon Squeezy, etc. — see lib/seedance.ts).
//
// Paddle is a Merchant of Record like Lemon Squeezy was, but crucially it
// bills in USD regardless of the seller's own country/settlement currency —
// the reason this replaced Paystack, whose South African accounts only
// settle in ZAR.
//
// NOTE ON THINGS THAT NEED LIVE VERIFICATION: the "checkout return URL"
// behavior below is the one part of this file I'm not 100% certain of from
// memory — Paddle's hosted checkout redirect target may need to be set as a
// "Default payment link" in Paddle Dashboard → Checkout → Checkout settings
// instead of (or in addition to) passed per-transaction. Confirm once you
// have dashboard access and adjust createTransaction if the redirect
// doesn't land where expected.

function paddleBase(): string {
  return process.env.PADDLE_ENV === 'production'
    ? 'https://api.paddle.com'
    : 'https://sandbox-api.paddle.com'
}

export function paddleConfigured(): boolean {
  return !!process.env.PADDLE_API_KEY
}

function headers() {
  return {
    Authorization: `Bearer ${process.env.PADDLE_API_KEY || ''}`,
    'Content-Type': 'application/json',
  }
}

// One real Paddle recurring Price per self-serve tier, created in the
// Paddle dashboard (sandbox first) and referenced here by env var — never a
// manually-reconstructed amount. Checkout always references the Price by
// id, so what a customer is charged is exactly whatever that Price is
// configured for, not a number this app computes.
const PRICE_ENV_VAR: Record<Exclude<TierId, 'enterprise'>, string> = {
  minimum: 'PADDLE_PRICE_MINIMUM',
  growth: 'PADDLE_PRICE_GROWTH',
  scale: 'PADDLE_PRICE_SCALE',
}

export function getPriceId(tier: TierId): string | null {
  if (tier === 'enterprise') return null
  return process.env[PRICE_ENV_VAR[tier]] || null
}

// Paddle transactions need a customer_id, not a bare email — look one up by
// email first, and only create a new Customer if none exists yet. Keeps us
// from accumulating duplicate Paddle customers for the same person across
// multiple checkout attempts.
async function findOrCreateCustomer(email: string): Promise<{ customerId: string } | { error: string }> {
  const lookup = await fetch(`${paddleBase()}/customers?email=${encodeURIComponent(email)}`, {
    headers: headers(),
  })
  const lookupBody = await lookup.json().catch(() => null)
  if (lookup.ok && lookupBody?.data?.[0]?.id) {
    return { customerId: lookupBody.data[0].id }
  }

  const created = await fetch(`${paddleBase()}/customers`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ email }),
  })
  const createdBody = await created.json().catch(() => null)
  if (!created.ok || !createdBody?.data?.id) {
    const message = createdBody?.error?.detail || `Paddle error creating customer (${created.status})`
    return { error: message }
  }
  return { customerId: createdBody.data.id }
}

export async function createCheckout(params: {
  email: string
  priceId: string
  returnUrl: string
  customData: Record<string, string>
}): Promise<{ checkoutUrl: string } | { error: string }> {
  const customer = await findOrCreateCustomer(params.email)
  if ('error' in customer) return customer

  try {
    const res = await fetch(`${paddleBase()}/transactions`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        items: [{ price_id: params.priceId, quantity: 1 }],
        customer_id: customer.customerId,
        custom_data: params.customData,
        checkout: { url: params.returnUrl },
      }),
    })
    const body = await res.json()
    if (!res.ok) {
      const message = body?.error?.detail || `Paddle error ${res.status}`
      return { error: message }
    }
    const checkoutUrl = body?.data?.checkout?.url
    if (!checkoutUrl) return { error: 'Paddle did not return a checkout URL.' }
    return { checkoutUrl }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Paddle request failed' }
  }
}

// Paddle signs webhook bodies via the Paddle-Signature header, formatted as
// "ts=<unix_ts>;h1=<hex_hmac>" — the HMAC-SHA256 is computed over
// "<ts>:<raw_body>" using the notification destination's signing secret
// (from Paddle Dashboard → Developer Tools → Notifications → your endpoint).
export function verifyPaddleSignature(rawBody: string, signatureHeader: string | null): boolean {
  if (!signatureHeader || !process.env.PADDLE_WEBHOOK_SECRET) return false

  const parts = Object.fromEntries(
    signatureHeader.split(';').map(p => {
      const [k, v] = p.split('=')
      return [k, v]
    })
  )
  const ts = parts.ts
  const h1 = parts.h1
  if (!ts || !h1) return false

  const expected = createHmac('sha256', process.env.PADDLE_WEBHOOK_SECRET)
    .update(`${ts}:${rawBody}`)
    .digest('hex')

  const a = Buffer.from(expected)
  const b = Buffer.from(h1)
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}
