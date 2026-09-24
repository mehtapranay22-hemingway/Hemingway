'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'

function DescribeForm() {
  const router = useRouter()
  const params = useSearchParams()
  const avatarId = params.get('avatarId') || ''
  const avatarName = params.get('name') || 'Avatar'
  const avatarImg = params.get('img') || ''

  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!description.trim() || !avatarId) return
    setLoading(true)
    setError('')

    try {
      const res = await fetch('/api/quickgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ avatarId, description: description.trim() }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      router.push(`/output?s=${data.sessionId}`)
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
          <a href="/" className="text-muted text-sm hover:text-ink transition-colors">← Avatars</a>
          <span className="text-[#E8E5DF]">/</span>
          <span className="text-sm text-ink">Describe</span>
        </div>

        <div className="px-8 py-10 max-w-xl">
          {/* Avatar preview — data comes from URL params, no fetch needed */}
          {avatarId && (
            <div className="flex items-center gap-4 mb-10 p-4 border border-divider bg-white">
              <div className="w-14 h-14 overflow-hidden shrink-0 bg-divider">
                {avatarImg && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={avatarImg}
                    alt={avatarName}
                    className="w-full h-full object-cover object-top"
                  />
                )}
              </div>
              <div>
                <div className="text-sm font-medium text-ink">{avatarName}</div>
                <div className="text-xs text-muted">Avatar</div>
              </div>
              <a href="/" className="ml-auto text-xs text-muted hover:text-ink transition-colors underline underline-offset-2">
                Change
              </a>
            </div>
          )}

          <h1 className="font-display text-3xl text-ink mb-1">What&apos;s the video about?</h1>
          <p className="text-muted text-sm mb-8">
            Describe your product, your offer, your message. One sentence or a paragraph — whatever feels natural.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="e.g. I sell a jewelry brand targeting women who want to treat themselves. I want an ad showing how our gold hoops are perfect for everyday wear — affordable luxury, not fast fashion."
              rows={6}
              autoFocus
              className="w-full border border-divider bg-white px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-ink transition-colors resize-none"
            />

            {error && (
              <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3">
                {error}
              </div>
            )}

            <div>
              <button
                type="submit"
                disabled={loading || !description.trim()}
                className="bg-ink text-cream px-8 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3"
              >
                {loading ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                    Writing script &amp; generating video...
                  </>
                ) : (
                  'Make the video →'
                )}
              </button>
              {loading && (
                <p className="text-xs text-muted mt-3">
                  Writing your script, then sending to HeyGen. This takes about 20–30 seconds to start, then 2–5 minutes to render.
                </p>
              )}
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function DescribePage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      <DescribeForm />
    </Suspense>
  )
}
