'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function BriefForm() {
  const router = useRouter()
  const params = useSearchParams()

  const sessionId = params.get('s') || ''
  const avatarId = params.get('avatarId') || ''
  const avatarName = params.get('avatarName') || ''
  const avatarImg = params.get('avatarImg') || ''
  const voiceId = params.get('voiceId') || ''
  const voiceName = params.get('voiceName') || ''

  const [brandName, setBrandName] = useState('')
  const [offer, setOffer] = useState('')
  const [targetCustomer, setTargetCustomer] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!brandName.trim() || !offer.trim()) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          avatarId,
          avatarName,
          avatarImg,
          voiceId,
          voiceName,
          brandName: brandName.trim(),
          offer: offer.trim(),
          targetCustomer: targetCustomer.trim(),
        }),
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Script generation failed')

      const scriptParams = new URLSearchParams({
        s: sessionId,
        avatarId,
        avatarName,
        avatarImg,
        voiceId,
        voiceName,
      })
      router.push(`/scripts?${scriptParams}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setLoading(false)
    }
  }

  return (
    <div className="py-16">
      <div className="mb-10 flex items-center gap-4">
        <Link href="/" className="text-muted text-sm hover:text-ink transition-colors">
          ← Back
        </Link>
        {avatarName && (
          <span className="text-xs text-muted border border-divider px-2 py-1">
            {avatarName} · {voiceName}
          </span>
        )}
      </div>

      <header className="mb-12">
        <h1 className="font-display text-4xl text-ink mb-2">Write the brief.</h1>
        <p className="text-muted text-sm max-w-md">
          One sentence is enough. The more specific the offer, the better the scripts.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="max-w-xl space-y-8">
        <div>
          <label className="block text-xs font-sans font-semibold uppercase tracking-widest text-muted mb-2">
            Brand or product name
          </label>
          <input
            type="text"
            value={brandName}
            onChange={e => setBrandName(e.target.value)}
            placeholder="e.g. Oura Ring, Hims, Graza"
            className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors"
            required
          />
        </div>

        <div>
          <label className="block text-xs font-sans font-semibold uppercase tracking-widest text-muted mb-2">
            One-line offer or product description
          </label>
          <textarea
            value={offer}
            onChange={e => setOffer(e.target.value)}
            placeholder="e.g. A sleep tracker ring that tells you when to go to bed, wake up, and take a break — so you stop guessing"
            rows={3}
            className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors resize-none"
            required
          />
          <p className="text-xs text-muted mt-1.5">
            Be specific about the outcome, not just the category. What changes for the customer?
          </p>
        </div>

        <div>
          <label className="block text-xs font-sans font-semibold uppercase tracking-widest text-muted mb-2">
            Target customer <span className="text-muted/50 normal-case font-normal">— optional</span>
          </label>
          <input
            type="text"
            value={targetCustomer}
            onChange={e => setTargetCustomer(e.target.value)}
            placeholder="e.g. Busy professionals who track their workouts but sleep terribly"
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
            className="bg-ink text-cream px-8 py-3 text-sm font-sans font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3"
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
              Claude is writing 5 distinct ad scripts. Usually takes 10–20 seconds.
            </p>
          )}
        </div>
      </form>
    </div>
  )
}

export default function BriefPage() {
  return (
    <Suspense fallback={<div className="py-16 text-muted text-sm">Loading...</div>}>
      <BriefForm />
    </Suspense>
  )
}
