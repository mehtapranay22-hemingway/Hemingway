'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import { TIERS, creditsForVideos, type Tier } from '@/lib/pricing'

declare global {
  interface Window {
    Paddle?: {
      Environment: { set: (env: 'sandbox' | 'production') => void }
      Initialize: (opts: { token: string }) => void
      Checkout: {
        open: (opts: {
          transactionId: string
          settings?: { displayMode?: 'overlay' | 'inline'; variant?: 'one-page' | 'multi-page' }
        }) => void
      }
      // Response shape per Paddle's Pricing Preview API — matches at the
      // time this was written; worth a quick live sanity check if prices
      // ever come back empty instead of throwing.
      PricePreview: (opts: { items: { priceId: string; quantity: number }[] }) => Promise<{
        data: { details: { lineItems: { price: { id: string }; formattedTotals: { total: string } }[] } }
      }>
    }
  }
}

// Client-side mirrors of the server-only PADDLE_PRICE_* vars (lib/paddle.ts)
// — price ids aren't secret, just catalog identifiers, so a NEXT_PUBLIC_
// duplicate is fine. Used only to fetch a localized/formatted price preview;
// the actual charge is always determined server-side by the same ids.
const PADDLE_PRICE_ID: Record<string, string | undefined> = {
  minimum: process.env.NEXT_PUBLIC_PADDLE_PRICE_MINIMUM,
  growth: process.env.NEXT_PUBLIC_PADDLE_PRICE_GROWTH,
  scale: process.env.NEXT_PUBLIC_PADDLE_PRICE_SCALE,
}

type Subscription = {
  plan: string
  status: string
  currentPeriodEnd: string | null
  videoAllowance: number | null
  videosUsedThisCycle: number
}

const CONTACT_EMAIL = 'support@hemingwayengine.com'

function CheckIcon() {
  return (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none" className="shrink-0 mt-1">
      <path d="M1 5l3.2 3.5L11 1" stroke="#B8863B" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function TierCard({
  tier,
  onSubscribe,
  loadingTier,
  localizedPrice,
}: {
  tier: Tier
  onSubscribe: (tierId: string) => void
  loadingTier: string | null
  localizedPrice?: string
}) {
  const credits = tier.videoAllowance != null ? creditsForVideos(tier.videoAllowance) : null

  return (
    <div
      className={[
        'flex flex-col bg-white p-6',
        tier.recommended ? 'border-2 border-accent' : 'border border-divider',
      ].join(' ')}
    >
      {tier.recommended ? (
        <p className="text-[10px] uppercase tracking-widest font-semibold text-accent mb-3">Recommended</p>
      ) : (
        <div className="mb-3 h-[14px]" />
      )}

      <h3 className="font-display text-xl text-ink mb-4">{tier.name}</h3>

      {tier.enterprise ? (
        <div className="mb-4">
          <p className="font-display text-3xl text-ink">Custom</p>
          <p className="text-xs text-muted mt-1">Volume built around your needs</p>
        </div>
      ) : (
        <div className="mb-4">
          <p className={['font-display text-3xl', tier.recommended ? 'text-accent' : 'text-ink'].join(' ')}>
            {credits!.toLocaleString()} credits
          </p>
        </div>
      )}

      <div className="mb-5 pb-5 border-b border-divider">
        {tier.enterprise ? (
          <p className="text-sm text-muted">Contact us for pricing</p>
        ) : (
          <p className="text-sm text-ink">
            <span className={['font-display text-2xl', tier.recommended ? 'text-accent' : 'text-ink'].join(' ')}>
              {localizedPrice ?? `$${tier.monthlyPriceUsd}`}
            </span>
            <span className="text-muted"> /month</span>
          </p>
        )}
      </div>

      <ul className="space-y-2.5 mb-6 flex-1">
        {tier.features.map(f => (
          <li key={f} className="flex items-start gap-2 text-[13px] text-muted leading-snug">
            <CheckIcon />
            <span>{f}</span>
          </li>
        ))}
      </ul>

      {tier.enterprise ? (
        <a
          href={`mailto:${CONTACT_EMAIL}?subject=Hemingway%20Enterprise`}
          className="block text-center border border-divider text-ink text-sm font-medium px-4 py-3 hover:border-ink transition-colors"
        >
          Contact us
        </a>
      ) : (
        <button
          onClick={() => onSubscribe(tier.id)}
          disabled={loadingTier !== null}
          className={[
            'text-center text-sm font-medium px-4 py-3 transition-colors disabled:opacity-40',
            tier.recommended ? 'bg-accent text-cream hover:opacity-90' : 'bg-ink text-cream hover:bg-accent',
          ].join(' ')}
        >
          {loadingTier === tier.id ? 'Starting checkout...' : 'Subscribe'}
        </button>
      )}
    </div>
  )
}

function PricingGrid({
  onSubscribe,
  loadingTier,
  localizedPrices,
}: {
  onSubscribe: (tierId: string) => void
  loadingTier: string | null
  localizedPrices: Record<string, string>
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {TIERS.map(tier => (
        <TierCard
          key={tier.id}
          tier={tier}
          onSubscribe={onSubscribe}
          loadingTier={loadingTier}
          localizedPrice={localizedPrices[tier.id]}
        />
      ))}
    </div>
  )
}

function BillingContent() {
  const router = useRouter()
  const params = useSearchParams()
  const next = params.get('next') || '/'
  const gated = params.get('reason') === 'unlock-video'

  const [loading, setLoading] = useState(true)
  const [signedOut, setSignedOut] = useState(false)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [configured, setConfigured] = useState(false)
  const [error, setError] = useState('')
  const [loadingTier, setLoadingTier] = useState<string | null>(null)
  const [showPlans, setShowPlans] = useState(false)
  const [localizedPrices, setLocalizedPrices] = useState<Record<string, string>>({})

  // Paddle's hosted checkout isn't an external page like Lemon Squeezy's was
  // — /api/billing/checkout returns a same-origin URL (this page, plus a
  // ?_ptxn=<transaction id> param) meant to be opened via Paddle.js's
  // overlay, not navigated to directly. Load the SDK once on mount so it's
  // ready by the time someone clicks Subscribe.
  useEffect(() => {
    const token = process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
    if (!token || window.Paddle) return
    const script = document.createElement('script')
    script.src = 'https://cdn.paddle.com/paddle/v2/paddle.js'
    script.onload = () => {
      if (process.env.NEXT_PUBLIC_PADDLE_ENV !== 'production') {
        window.Paddle!.Environment.set('sandbox')
      }
      window.Paddle!.Initialize({ token })

      // Localized/tax-aware price display — Paddle auto-detects the
      // visitor's country from their IP and returns already-formatted
      // totals, so no currency math or formatting happens on our side.
      // Falls back to the flat USD figures in lib/pricing.ts if this
      // fails for any reason (e.g. an unconfigured price id).
      const items = Object.entries(PADDLE_PRICE_ID)
        .filter((entry): entry is [string, string] => !!entry[1])
        .map(([, priceId]) => ({ priceId, quantity: 1 }))
      if (items.length === 0) return

      window.Paddle!.PricePreview({ items })
        .then(res => {
          const byTier: Record<string, string> = {}
          for (const line of res.data.details.lineItems) {
            const tierId = Object.keys(PADDLE_PRICE_ID).find(id => PADDLE_PRICE_ID[id] === line.price.id)
            if (tierId) byTier[tierId] = line.formattedTotals.total
          }
          setLocalizedPrices(byTier)
        })
        .catch(() => {})
    }
    document.body.appendChild(script)
  }, [])

  useEffect(() => {
    fetch('/api/billing/status')
      .then(r => {
        if (r.status === 401) { setSignedOut(true); return null }
        return r.json()
      })
      .then(data => {
        if (!data) return
        setSubscription(data.subscription)
        setConfigured(data.billingConfigured)
      })
      .catch(() => setError('Could not load billing status'))
      .finally(() => setLoading(false))
  }, [])

  async function handleSubscribe(tierId: string) {
    setLoadingTier(tierId)
    setError('')
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan: tierId, returnPath: next }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Checkout unavailable')

      // A real Paddle checkout carries a transaction id in ?_ptxn= — open
      // it in the Paddle.js overlay rather than navigating there (it's a
      // same-origin URL, not an external hosted page). The dev-simulated
      // fallback has no _ptxn and returns a plain internal path instead.
      const txnId = data.checkoutUrl.startsWith('http')
        ? new URL(data.checkoutUrl).searchParams.get('_ptxn')
        : null

      if (txnId && window.Paddle) {
        window.Paddle.Checkout.open({
          transactionId: txnId,
          settings: { displayMode: 'overlay', variant: 'one-page' },
        })
        setLoadingTier(null)
      } else if (data.checkoutUrl.startsWith('http')) {
        window.location.href = data.checkoutUrl
      } else {
        router.push(data.checkoutUrl)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout unavailable')
      setLoadingTier(null)
    }
  }

  if (!loading && signedOut) {
    return (
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <p className="font-display text-2xl text-ink mb-2">Sign in to view billing.</p>
            <Link href={`/signin?next=${encodeURIComponent(`/billing?next=${next}`)}`} className="inline-block bg-ink text-cream px-6 py-3 text-sm font-medium hover:bg-accent transition-colors">
              Sign in
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const isActive = subscription?.status === 'active'
  const currentTier = subscription ? TIERS.find(t => t.id === subscription.plan) : undefined

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 px-4 sm:px-8 py-10">
        <div className={isActive && !showPlans ? 'max-w-xl' : 'max-w-6xl'}>
          <p className="text-[#B0ACA5] text-xs uppercase tracking-widest font-sans mb-2">Billing</p>
          <h1 className="font-display text-4xl text-ink mb-2">
            {gated && !isActive ? 'Unlock your video.' : isActive ? 'Your plan.' : 'Choose a plan.'}
          </h1>
          {gated && !isActive && (
            <p className="text-muted text-sm mb-8">Subscribe to view and download what you made.</p>
          )}
          {(!gated || isActive) && <div className="mb-8" />}

          {loading ? (
            <p className="text-muted text-sm">Loading...</p>
          ) : (
            <>
              {!configured && (
                <div className="border border-divider bg-white px-5 py-4 mb-6 text-sm text-muted max-w-xl">
                  Billing isn&apos;t connected to Paddle yet — subscribing below simulates a successful subscription (dev-only, never happens in production) so the gated flow can be tested end to end.
                </div>
              )}

              {error && (
                <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3 mb-6 max-w-xl">{error}</div>
              )}

              {isActive && subscription && !showPlans ? (
                <>
                  <div className="border border-divider bg-white px-6 py-6 mb-6">
                    <div className="flex items-baseline justify-between mb-1">
                      <span className="font-display text-2xl text-ink">{currentTier?.name ?? subscription.plan} plan</span>
                      <span className="text-xs uppercase tracking-widest text-muted capitalize">{subscription.status}</span>
                    </div>
                    {subscription.currentPeriodEnd && (
                      <p className="text-xs text-muted mb-4">Renews {new Date(subscription.currentPeriodEnd).toLocaleDateString()}</p>
                    )}

                    {subscription.videoAllowance != null && (
                      <div className="mt-4 pt-4 border-t border-divider">
                        <div className="flex items-baseline justify-between mb-2">
                          <span className="text-xs text-muted">Credits this cycle</span>
                          <span className="text-sm text-ink font-medium">
                            {creditsForVideos(subscription.videosUsedThisCycle).toLocaleString()} / {creditsForVideos(subscription.videoAllowance).toLocaleString()}
                          </span>
                        </div>
                        <div className="h-1.5 bg-[#EDEAE2] w-full">
                          <div
                            className="h-full bg-accent transition-[width] duration-500"
                            style={{ width: `${Math.min(100, (subscription.videosUsedThisCycle / subscription.videoAllowance) * 100)}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-4">
                    <Link
                      href={next}
                      className="inline-block bg-ink text-cream px-8 py-3 text-sm font-medium hover:bg-accent transition-colors"
                    >
                      Continue →
                    </Link>
                    <button
                      onClick={() => setShowPlans(true)}
                      className="text-sm text-muted hover:text-ink transition-colors"
                    >
                      Change plan
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {isActive && (
                    <button
                      onClick={() => setShowPlans(false)}
                      className="text-sm text-muted hover:text-ink transition-colors mb-6 inline-block"
                    >
                      ← Back to your plan
                    </button>
                  )}
                  <PricingGrid onSubscribe={handleSubscribe} loadingTier={loadingTier} localizedPrices={localizedPrices} />
                </>
              )}
            </>
          )}

          <div className="flex flex-wrap gap-5 text-xs text-muted mt-16 pt-6 border-t border-divider">
            <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
            <Link href="/refund-policy" className="hover:text-ink transition-colors">Refunds</Link>
            <a href={`mailto:${CONTACT_EMAIL}`} className="hover:text-ink transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </div>
  )
}

export default function BillingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#F7F5F2]" />}>
      <BillingContent />
    </Suspense>
  )
}
