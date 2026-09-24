'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import { TIERS, creditsForVideos, type Tier } from '@/lib/pricing'

type Subscription = {
  plan: string
  status: string
  currentPeriodEnd: string | null
  videoAllowance: number | null
  videosUsedThisCycle: number
}

// TODO: swap for the real support address before going live.
const CONTACT_EMAIL = 'hello@hemingway.app'

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
}: {
  tier: Tier
  onSubscribe: (tierId: string) => void
  loadingTier: string | null
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
              ${tier.monthlyPriceUsd}
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

function PricingGrid({ onSubscribe, loadingTier }: { onSubscribe: (tierId: string) => void; loadingTier: string | null }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
      {TIERS.map(tier => (
        <TierCard key={tier.id} tier={tier} onSubscribe={onSubscribe} loadingTier={loadingTier} />
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
      // A real Lemon Squeezy checkout URL is external — the dev-simulated
      // fallback returns an internal path instead.
      if (data.checkoutUrl.startsWith('http')) {
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
        <div className="ml-56 flex-1 flex items-center justify-center">
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
      <div className="ml-56 flex-1 px-8 py-10">
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
                  Billing isn&apos;t connected to Lemon Squeezy yet — subscribing below simulates a successful subscription (dev-only, never happens in production) so the gated flow can be tested end to end.
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
                          <span className="text-xs text-muted">Videos this cycle</span>
                          <span className="text-sm text-ink font-medium">
                            {subscription.videosUsedThisCycle} / {subscription.videoAllowance}
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
                  <PricingGrid onSubscribe={handleSubscribe} loadingTier={loadingTier} />
                </>
              )}
            </>
          )}
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
