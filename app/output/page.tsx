'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import type { Session, Pipeline } from '@/lib/types'

// ── Pipeline progress indicator ─────────────────────────────────────────────

function StageRow({ label, status, detail }: { label: string; status: string; detail?: string }) {
  const icon =
    status === 'completed' ? '✓' :
    status === 'failed'    ? '✕' :
    status === 'processing'? '●' : '–'

  const color =
    status === 'completed' ? 'text-[#6B8A4E]' :
    status === 'failed'    ? 'text-[#8A3030]' :
    status === 'processing'? 'text-accent animate-pulse' : 'text-[#C0BAB2]'

  return (
    <div className="flex items-center gap-3 py-2">
      <span className={`w-4 text-center text-sm font-mono ${color}`}>{icon}</span>
      <span className={`text-sm ${status === 'idle' ? 'text-[#C0BAB2]' : 'text-ink'}`}>{label}</span>
      {detail && <span className="text-xs text-[#B0ACA5] ml-auto">{detail}</span>}
    </div>
  )
}

function PipelineProgress({ pipeline }: { pipeline: Pipeline }) {
  const completedBroll = pipeline.broll.filter(c => c.status === 'completed').length
  const totalBroll = pipeline.broll.length

  const brollDetail = totalBroll === 0
    ? undefined
    : `${completedBroll}/${totalBroll} clips`

  return (
    <div className="w-full max-w-sm mx-auto border border-divider bg-white px-5 py-4 mb-8 divide-y divide-[#F0EDE8]">
      <StageRow label="Avatar video" status={pipeline.avatar.status} />
      {totalBroll > 0 && (
        <StageRow label="B-roll clips" status={
          pipeline.broll.every(c => c.status === 'completed') ? 'completed' :
          pipeline.broll.every(c => c.status === 'failed') ? 'failed' :
          pipeline.broll.some(c => c.status === 'processing') ? 'processing' : 'idle'
        } detail={brollDetail} />
      )}
      <StageRow label="Composing final video" status={pipeline.compose.status} />
      {pipeline.fallbackMode && (
        <p className="pt-3 text-xs text-[#9B9892]">
          B-roll generation failed — delivering avatar-only video.
        </p>
      )}
    </div>
  )
}

// ── Video card ───────────────────────────────────────────────────────────────

function VideoOutput({ session }: { session: Session }) {
  const pipeline = session.pipeline
  const finalUrl = pipeline?.finalVideoUrl

  // Determine overall status
  const isComplete = !!finalUrl
  const isFailed = pipeline
    ? pipeline.avatar.status === 'failed'
    : session.renders.every(r => r.status === 'failed')

  // Fallback: no pipeline — use legacy render
  const legacyRender = !pipeline ? session.renders[0] : null
  const videoUrl = finalUrl ?? (legacyRender?.status === 'completed' ? legacyRender.videoUrl : undefined)
  const hookLine = session.scripts?.[0]?.hookLine ?? session.renders[0]?.hookLine

  const anyPending = pipeline
    ? !finalUrl && !isFailed
    : session.renders.some(r => r.status !== 'completed' && r.status !== 'failed')

  return (
    <div className="flex flex-col items-center w-full max-w-2xl mx-auto">
      {hookLine && (
        <p className="font-display text-2xl text-ink text-center leading-snug mb-6 max-w-lg">
          &ldquo;{hookLine}&rdquo;
        </p>
      )}

      {/* Pipeline stage progress */}
      {pipeline && anyPending && <PipelineProgress pipeline={pipeline} />}

      {/* Completed video */}
      {isComplete && videoUrl && (
        <>
          <div className="w-full bg-[#1A1A1A] flex items-center justify-center mb-6" style={{ aspectRatio: '9/16', maxHeight: '70vh' }}>
            <video src={videoUrl} controls autoPlay playsInline className="h-full w-auto max-w-full" />
          </div>
          <a
            href={videoUrl}
            download="hemingway-video.mp4"
            className="w-full max-w-sm bg-ink text-cream text-center py-4 text-sm font-semibold hover:bg-accent transition-colors mb-3 block"
          >
            Download video ↓
          </a>
        </>
      )}

      {/* Failed */}
      {isFailed && (
        <div className="w-full border border-error/30 bg-error/5 text-error text-sm px-6 py-5 mb-6 text-center">
          {pipeline?.avatar.error ?? session.renders[0]?.error ?? 'Render failed. Check your HeyGen dashboard.'}
        </div>
      )}

      {/* Pending — no pipeline detail yet */}
      {anyPending && !pipeline && (
        <div className="w-full border border-divider bg-white flex flex-col items-center justify-center py-20 mb-6 gap-4" style={{ aspectRatio: '9/16', maxHeight: '70vh' }}>
          <span className="inline-block w-6 h-6 border-2 border-divider border-t-accent animate-spin" />
          <p className="text-sm text-muted">Rendering — usually 2–5 minutes.</p>
          <p className="text-xs text-muted/60">This page updates automatically.</p>
        </div>
      )}
    </div>
  )
}

// ── Page ─────────────────────────────────────────────────────────────────────

function OutputContent() {
  const params = useSearchParams()
  const sessionId = params.get('s') || ''

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  function isTerminal(s: Session): boolean {
    const pipeline = s.pipeline
    if (pipeline) {
      return !!pipeline.finalVideoUrl || pipeline.avatar.status === 'failed'
    }
    const renders = s.renders ?? []
    return renders.length > 0 && renders.every(r => r.status === 'completed' || r.status === 'failed')
  }

  async function poll() {
    try {
      const res = await fetch(`/api/status?s=${sessionId}`)
      if (!res.ok) return
      const data: Session = await res.json()
      setSession(data)
      if (isTerminal(data)) {
        if (pollRef.current) clearInterval(pollRef.current)
      }
    } catch {
      // network blip — retry next interval
    }
  }

  useEffect(() => {
    fetch(`/api/session?s=${sessionId}`)
      .then(r => r.json())
      .then((data: Session) => {
        setSession(data)
        setLoading(false)
        if (!isTerminal(data)) {
          pollRef.current = setInterval(poll, 5000)
        }
      })
      .catch(() => setLoading(false))

    return () => { if (pollRef.current) clearInterval(pollRef.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const pipeline = session?.pipeline
  const allDone = session ? isTerminal(session) && (!!pipeline?.finalVideoUrl || session.renders.some(r => r.status === 'completed')) : false
  const anyPending = session ? !isTerminal(session) : false

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="ml-56 flex-1 px-8 py-10">

        <div className="max-w-2xl mx-auto mb-10 text-center">
          <h1 className="font-display text-5xl text-ink mb-2">
            {allDone ? 'Your ad is ready.' : anyPending ? 'Working on it...' : 'Done.'}
          </h1>
          <p className="text-muted text-sm">
            {allDone
              ? 'Download it below, or make another.'
              : anyPending
              ? 'Generating your video. This usually takes 2–5 minutes.'
              : ''}
          </p>
        </div>

        {!session || session.renders.length === 0 ? (
          <p className="text-center text-muted text-sm">
            No renders found. <Link href="/" className="underline">Start over.</Link>
          </p>
        ) : (
          <VideoOutput session={session} />
        )}

        <div className="max-w-sm mx-auto mt-8 text-center">
          <Link
            href="/"
            className="block w-full border border-divider bg-white text-ink text-center py-3 text-sm font-medium hover:border-ink transition-colors"
          >
            Make another video →
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function OutputPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      <OutputContent />
    </Suspense>
  )
}
