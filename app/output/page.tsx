'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { RenderJob, Session } from '@/lib/types'
import { HOOK_LABELS } from '@/lib/types'

function ProgressBar({ status }: { status: RenderJob['status'] }) {
  const pct =
    status === 'queued' ? 10
    : status === 'processing' ? 55
    : status === 'completed' ? 100
    : 0

  return (
    <div className="h-px bg-divider w-full overflow-hidden">
      <div
        className={[
          'h-full transition-all duration-1000',
          status === 'failed' ? 'bg-error' : 'bg-accent',
        ].join(' ')}
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}

function VideoCard({ job }: { job: RenderJob }) {
  const label = HOOK_LABELS[job.hookType] || job.hookType
  const isTerminal = job.status === 'completed' || job.status === 'failed'

  return (
    <div className="border border-divider bg-surface">
      {/* Header */}
      <div className="px-5 pt-4 pb-3 border-b border-divider flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted uppercase tracking-widest">{label}</span>
        <span className={[
          'font-mono text-[11px] uppercase tracking-wider',
          job.status === 'completed' ? 'text-accent' : job.status === 'failed' ? 'text-error' : 'text-muted',
        ].join(' ')}>
          {job.status}
        </span>
      </div>

      {/* Progress bar */}
      {!isTerminal && <ProgressBar status={job.status} />}

      {/* Hook preview */}
      <div className="px-5 pt-4 pb-2">
        <p className="font-display text-base text-ink leading-snug">&ldquo;{job.hookLine}&rdquo;</p>
      </div>

      {/* Video or status */}
      <div className="px-5 pb-5">
        {job.status === 'completed' && job.videoUrl ? (
          <div className="space-y-3">
            <div className="bg-divider inline-flex p-1">
              <video
                src={job.videoUrl}
                controls
                playsInline
                className="max-h-[480px]"
                style={{ aspectRatio: '9/16' }}
              />
            </div>
            <div>
              <a
                href={job.videoUrl}
                download
                className="inline-block bg-ink text-cream px-5 py-2.5 text-xs font-sans font-medium hover:bg-accent transition-colors"
              >
                Download ↓
              </a>
            </div>
          </div>
        ) : job.status === 'failed' ? (
          <p className="text-error text-xs mt-2">
            {job.error || 'Render failed. Check HeyGen dashboard for details.'}
          </p>
        ) : (
          <p className="text-muted text-xs mt-2">
            {job.status === 'queued' ? 'Queued for render...' : 'Rendering — usually takes 1–5 minutes.'}
          </p>
        )}
      </div>
    </div>
  )
}

function OutputContent() {
  const params = useSearchParams()
  const sessionId = params.get('s') || ''

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function allTerminal(renders: RenderJob[]) {
    return renders.length > 0 && renders.every(r => r.status === 'completed' || r.status === 'failed')
  }

  async function poll() {
    const res = await fetch(`/api/status?s=${sessionId}`)
    const data: Session = await res.json()
    setSession(data)
    if (allTerminal(data.renders ?? [])) {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }

  useEffect(() => {
    fetch(`/api/session?s=${sessionId}`)
      .then(r => r.json())
      .then((data: Session) => {
        setSession(data)
        setLoading(false)
        if (!allTerminal(data.renders ?? [])) {
          pollRef.current = setInterval(poll, 5000)
        }
      })
      .catch(() => setLoading(false))

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const renders = session?.renders ?? []
  const completedCount = renders.filter(r => r.status === 'completed').length
  const pendingCount = renders.filter(r => r.status !== 'completed' && r.status !== 'failed').length

  if (loading) {
    return <div className="py-16 text-muted text-sm">Loading...</div>
  }

  return (
    <div className="py-16">
      <div className="mb-10 flex items-center gap-4">
        <Link href={`/scripts?s=${sessionId}`} className="text-muted text-sm hover:text-ink transition-colors">
          ← Back to scripts
        </Link>
        <Link href="/" className="text-muted text-sm hover:text-ink transition-colors">
          New brief
        </Link>
      </div>

      <header className="mb-8">
        <h1 className="font-display text-4xl text-ink mb-1">
          {pendingCount > 0 ? 'Rendering...' : 'Done.'}
        </h1>
        <p className="text-muted text-sm">
          {completedCount > 0
            ? `${completedCount} of ${renders.length} video${renders.length > 1 ? 's' : ''} ready.`
            : pendingCount > 0
            ? `${pendingCount} render${pendingCount > 1 ? 's' : ''} in progress. This page updates automatically.`
            : 'No renders found.'}
        </p>
      </header>

      {renders.length === 0 ? (
        <div className="border border-divider bg-surface px-6 py-8 text-muted text-sm">
          No render jobs found for this session.{' '}
          <Link href={`/scripts?s=${sessionId}`} className="underline hover:text-ink">
            Go back to scripts.
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          {renders.map(job => (
            <VideoCard key={job.scriptId} job={job} />
          ))}
        </div>
      )}
    </div>
  )
}

export default function OutputPage() {
  return (
    <Suspense fallback={<div className="py-16 text-muted text-sm">Loading...</div>}>
      <OutputContent />
    </Suspense>
  )
}
