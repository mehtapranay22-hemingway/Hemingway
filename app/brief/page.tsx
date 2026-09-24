'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'

function BriefForm() {
  const router = useRouter()
  const params = useSearchParams()
  const promptFromHome = params.get('prompt') || ''

  const [brandName, setBrandName] = useState('')
  const [offer, setOffer] = useState(promptFromHome)
  const [targetCustomer, setTargetCustomer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brandName.trim() || !offer.trim()) return
    setLoading(true)
    setError('')

    try {
      const sessionRes = await fetch('/api/session', { method: 'POST' })
      const { id: sessionId } = await sessionRes.json()

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          brandName: brandName.trim(),
          offer: offer.trim(),
          targetCustomer: targetCustomer.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Script generation failed')

      router.push(`/scripts?s=${sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="lg:ml-56 pt-14 lg:pt-0 flex-1">
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-8 py-3 flex items-center gap-3">
          <a href="/" className="text-muted text-sm hover:text-ink transition-colors">← Home</a>
          <span className="text-[#E8E5DF]">/</span>
          <span className="text-sm text-ink">Brief</span>
        </div>

        <div className="px-8 py-10 max-w-xl">
          <h1 className="font-display text-3xl text-ink mb-1">Write the brief.</h1>
          <p className="text-muted text-sm mb-10">
            One sentence is enough. The more specific the offer, the better the scripts.
          </p>

          <form onSubmit={handleSubmit} className="space-y-8">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">
                Brand or product name
              </label>
              <input
                type="text"
                value={brandName}
                onChange={e => setBrandName(e.target.value)}
                placeholder="e.g. Oura Ring, Hims, Graza"
                className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors"
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">
                What are you selling? What&apos;s the outcome?
              </label>
              <textarea
                value={offer}
                onChange={e => setOffer(e.target.value)}
                placeholder="e.g. A sleep tracker ring that tells you when to go to bed — so you stop guessing"
                rows={3}
                className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors resize-none"
                required
              />
              <p className="text-xs text-muted mt-1.5">
                Be specific about the outcome. What changes for the customer?
              </p>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">
                Target customer{' '}
                <span className="text-muted/50 normal-case font-normal">— optional</span>
              </label>
              <input
                type="text"
                value={targetCustomer}
                onChange={e => setTargetCustomer(e.target.value)}
                placeholder="e.g. Busy professionals who track workouts but sleep terribly"
                className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors"
              />
            </div>

            {error && (
              <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3">
                {error}
              </div>
            )}

            <div className="border-t border-divider pt-6">
              <button
                type="submit"
                disabled={loading || !brandName.trim() || !offer.trim()}
                className="bg-ink text-cream px-8 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                    Generating scripts...
                  </>
                ) : (
                  'Generate scripts →'
                )}
              </button>
              {loading && (
                <p className="text-xs text-muted mt-3">
                  Writing 5 distinct ad scripts. Usually 10–20 seconds.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function BriefPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen bg-[#F7F5F2]">
          <Sidebar />
          <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 flex items-center justify-center">
            <p className="text-muted text-sm">Loading...</p>
          </div>
        </div>
      }
    >
      <BriefForm />
    </Suspense>
  )
}
