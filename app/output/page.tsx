'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import type { Session, Pipeline, SeedancePipeline } from '@/lib/types'

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
    <div className="flex items-center gap-3.5 py-3">
      <span className={`w-4 text-center text-base font-mono ${color}`}>{icon}</span>
      <span className={`text-[15px] ${status === 'idle' ? 'text-[#C0BAB2]' : 'text-ink'}`}>{label}</span>
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
    <div className="w-full max-w-md mx-auto border border-divider bg-white px-7 py-5 mb-8 divide-y divide-[#F0EDE8]">
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

function SeedanceProgress({ seedance }: { seedance: SeedancePipeline }) {
  const latest = seedance.attempts[seedance.attempts.length - 1]
  const attemptDetail = seedance.attempts.length > 1
    ? `attempt ${latest?.attempt ?? seedance.attempts.length} of ${seedance.maxRetries + 1}`
    : undefined

  const generatingStatus =
    seedance.status === 'completed' ? 'completed' :
    seedance.status === 'failed' ? 'failed' :
    latest?.status === 'processing' ? 'processing' :
    latest?.status === 'queued' ? 'processing' : 'idle'

  const qualityStatus =
    seedance.status === 'completed' ? 'completed' :
    latest?.qualityGate && !latest.qualityGate.pass ? 'failed' :
    generatingStatus === 'completed' ? 'processing' : 'idle'

  return (
    <div className="w-full max-w-md mx-auto border border-divider bg-white px-7 py-5 mb-8 divide-y divide-[#F0EDE8]">
      <StageRow label="Character reference" status={seedance.characterSheet.status === 'ready' ? 'completed' : seedance.characterSheet.status} />
      <StageRow label="Generating video" status={generatingStatus} detail={attemptDetail} />
      <StageRow label="Quality check" status={qualityStatus} />
      {seedance.attempts.length > 1 && seedance.status !== 'failed' && (
        <p className="pt-3 text-xs text-[#9B9892]">
          Previous attempt didn&apos;t pass the quality gate — retrying.
        </p>
      )}
    </div>
  )
}

// ── Progress bar + time-based estimate ──────────────────────────────────────
// There's no real percentage from Seedance (or the legacy pipeline) mid-flight
// — just discrete stage/attempt states. Rather than a bare indeterminate
// spinner, this eases a bar toward (but never quite to) the next stage
// boundary over the expected ~2-5min render window, then snaps to 100 the
// moment the real status flips to completed. It's an honest approximation,
// not a fake number pretending to be exact.
function useElapsedSeconds(active: boolean): number {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    if (!active) return
    const start = Date.now()
    const id = setInterval(() => setElapsed((Date.now() - start) / 1000), 400)
    return () => clearInterval(id)
  }, [active])
  return elapsed
}

function ease(elapsed: number, span: number): number {
  return 1 - Math.exp(-elapsed / span)
}

function estimateProgress(seedance: SeedancePipeline | undefined, pipeline: Pipeline | undefined, elapsed: number): number {
  if (seedance) {
    if (seedance.status === 'completed') return 100
    if (seedance.characterSheet.status !== 'ready') return 4 + 6 * ease(elapsed, 15)
    const latest = seedance.attempts[seedance.attempts.length - 1]
    const qualityChecking = latest?.status === 'completed' && !latest.qualityGate
    if (qualityChecking) return 88 + 6 * ease(elapsed, 20)
    return 12 + 76 * ease(elapsed, 100)
  }
  if (pipeline) {
    if (pipeline.finalVideoUrl) return 100
    const stagesDone = [
      pipeline.avatar.status === 'completed',
      pipeline.broll.length === 0 || pipeline.broll.every(c => c.status === 'completed'),
      pipeline.compose.status === 'completed',
    ].filter(Boolean).length
    return Math.min(92, (stagesDone / 3) * 80 + 12 * ease(elapsed, 90))
  }
  return 10 + 82 * ease(elapsed, 100)
}

function ProgressBar({ percent }: { percent: number }) {
  return (
    <div className="w-full h-2 bg-[#EDEAE2] overflow-hidden">
      <div
        className="h-full bg-accent transition-[width] duration-700 ease-out"
        style={{ width: `${Math.min(100, Math.max(3, percent))}%` }}
      />
    </div>
  )
}

// ── Full-viewport generating screen ─────────────────────────────────────────

function GeneratingScreen({ session }: { session: Session }) {
  const seedance = session.seedancePipeline
  const pipeline = session.pipeline
  const hookLine = session.scripts?.[0]?.hookLine ?? session.renders[0]?.hookLine
  const elapsed = useElapsedSeconds(true)
  const percent = estimateProgress(seedance, pipeline, elapsed)

  return (
    <div className="min-h-[calc(100vh-3.5rem)] lg:min-h-screen flex flex-col items-center justify-center px-4 sm:px-8 py-16 sm:py-20">
      <div className="w-full max-w-xl text-center">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent mb-5">Generating</p>
        <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl text-ink mb-4">Working on it&hellip;</h1>
        <p className="text-muted text-base mb-10 sm:mb-14">Generating your video. This usually takes 2–5 minutes.</p>

        {hookLine && (
          <p className="font-display text-2xl sm:text-3xl text-ink leading-snug mb-10 sm:mb-14 max-w-lg mx-auto">
            &ldquo;{hookLine}&rdquo;
          </p>
        )}

        <div className="max-w-md mx-auto mb-2">
          <ProgressBar percent={percent} />
        </div>
        <p className="text-xs text-muted mb-10">{Math.round(percent)}%</p>

        {seedance && <SeedanceProgress seedance={seedance} />}
        {!seedance && pipeline && <PipelineProgress pipeline={pipeline} />}
      </div>

      <div className="w-full max-w-xs mt-6">
        <Link
          href="/"
          className="block w-full border border-divider bg-white text-ink text-center py-3.5 text-sm font-medium hover:border-ink transition-colors"
        >
          Make another video →
        </Link>
      </div>
    </div>
  )
}

// ── Video card ───────────────────────────────────────────────────────────────

// A download is treated as an explicit "keep" signal for the lightweight ad
// memory layer (see lib/db.ts) — best-effort and fire-and-forget, since the
// download itself should never wait on or fail because of this.
function recordKept(sessionId: string) {
  fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {})
}

function VideoOutput({ session }: { session: Session }) {
  const seedance = session.seedancePipeline
  const pipeline = session.pipeline
  const finalUrl = seedance?.finalVideoUrl ?? pipeline?.finalVideoUrl

  // Determine overall status
  const isComplete = !!finalUrl
  const isFailed = seedance
    ? seedance.status === 'failed'
    : pipeline
    ? pipeline.avatar.status === 'failed'
    : session.renders.every(r => r.status === 'failed')

  const failureMessage = seedance
    ? seedance.attempts[seedance.attempts.length - 1]?.error
      ?? seedance.attempts[seedance.attempts.length - 1]?.qualityGate?.reason
      ?? 'Generation failed after retries.'
    : pipeline?.avatar.error ?? session.renders[0]?.error ?? 'Render failed.'

  // Legacy render (no seedance/pipeline detail on this session)
  const legacyRender = !seedance && !pipeline ? session.renders[0] : null
  const videoUrl = finalUrl ?? (legacyRender?.status === 'completed' ? legacyRender.videoUrl : undefined)
  const hookLine = session.scripts?.[0]?.hookLine ?? session.renders[0]?.hookLine

  // Seedance's raw video_url is a presigned link that expires ~24h after
  // generation. Our own rehosted videos are always a local /videos/... path
  // — anything else (an old render from before that fix, or a rare rehost
  // failure that fell back to the remote URL) is guaranteed dead by the time
  // anyone's actually viewing it, so it gets its own state instead of a
  // video player and download link that silently fail.
  const isExpired = isComplete && !!videoUrl && !videoUrl.startsWith('/')

  const anyPending = seedance
    ? !finalUrl && !isFailed
    : pipeline
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
      {seedance && anyPending && <SeedanceProgress seedance={seedance} />}
      {!seedance && pipeline && anyPending && <PipelineProgress pipeline={pipeline} />}

      {/* Completed video */}
      {isComplete && videoUrl && isExpired && (
        <div className="w-full border border-divider bg-white flex flex-col items-center justify-center py-20 mb-6 gap-3 px-6 text-center" style={{ aspectRatio: '9/16', maxHeight: '70vh' }}>
          <svg width="26" height="26" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="9.5" stroke="#B0ACA5" strokeWidth="1.3" />
            <path d="M11 6.5v5.2M11 15v.1" stroke="#B0ACA5" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-sm text-ink font-medium">This video&apos;s link has expired</p>
          <p className="text-xs text-muted max-w-xs">
            It was rendered before videos were saved permanently and can&apos;t be recovered. Make another to get a working copy.
          </p>
          <Link
            href="/"
            className="mt-2 border border-divider bg-white text-ink text-center px-5 py-2.5 text-xs font-medium hover:border-ink transition-colors"
          >
            Make another video →
          </Link>
        </div>
      )}
      {isComplete && videoUrl && !isExpired && (
        <>
          <div className="w-full bg-[#1A1A1A] flex items-center justify-center mb-6" style={{ aspectRatio: '9/16', maxHeight: '70vh' }}>
            <video src={videoUrl} controls autoPlay playsInline className="h-full w-auto max-w-full" />
          </div>
          <a
            href={videoUrl}
            download="hemingway-video.mp4"
            onClick={() => recordKept(session.id)}
            className="w-full max-w-sm bg-ink text-cream text-center py-4 text-sm font-semibold hover:bg-accent transition-colors mb-3 block"
          >
            Download video ↓
          </a>
        </>
      )}

      {/* Failed */}
      {isFailed && (
        <div className="w-full border border-error/30 bg-error/5 text-error text-sm px-6 py-5 mb-6 text-center">
          {failureMessage}
        </div>
      )}

      {/* Pending — no stage detail yet */}
      {anyPending && !seedance && !pipeline && (
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
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('s') || ''

  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const pollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stoppedRef = useRef(false)
  const onboardCheckedRef = useRef(false)

  function isTerminal(s: Session): boolean {
    if (s.seedancePipeline) {
      return s.seedancePipeline.status === 'completed' || s.seedancePipeline.status === 'failed'
    }
    const pipeline = s.pipeline
    if (pipeline) {
      return !!pipeline.finalVideoUrl || pipeline.avatar.status === 'failed'
    }
    const renders = s.renders ?? []
    return renders.length > 0 && renders.every(r => r.status === 'completed' || r.status === 'failed')
  }

  // Self-rescheduling rather than setInterval — the next poll is only
  // scheduled once this one fully resolves. /api/status can legitimately
  // take longer than 5s now (it may download and rehost a finished video
  // inline), and setInterval firing on a fixed clock regardless of that
  // used to let two requests for the same session overlap: both would see
  // the render as freshly completed, both would download it, and whichever
  // write landed last silently won — orphaning the other download and
  // sometimes losing the update entirely. See withSessionLock in
  // lib/sessions.ts for the matching server-side guard (covers a second
  // browser tab too, which this alone wouldn't).
  async function poll() {
    try {
      const res = await fetch(`/api/status?s=${sessionId}`)
      if (res.ok) {
        const data: Session = await res.json()
        setSession(data)
        if (isTerminal(data)) return
      }
    } catch {
      // network blip — retry next tick
    }
    if (!stoppedRef.current) {
      pollTimeoutRef.current = setTimeout(poll, 5000)
    }
  }

  useEffect(() => {
    stoppedRef.current = false
    fetch(`/api/session?s=${sessionId}`)
      .then(r => r.json())
      .then((data: Session) => {
        setSession(data)
        setLoading(false)
        if (!isTerminal(data)) {
          pollTimeoutRef.current = setTimeout(poll, 5000)
        }
      })
      .catch(() => setLoading(false))

    return () => {
      stoppedRef.current = true
      if (pollTimeoutRef.current) clearTimeout(pollTimeoutRef.current)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId])

  const pipeline = session?.pipeline
  const seedance = session?.seedancePipeline
  const allDone = session
    ? isTerminal(session) && (!!seedance?.finalVideoUrl || !!pipeline?.finalVideoUrl || session.renders.some(r => r.status === 'completed'))
    : false
  const anyPending = session ? !isTerminal(session) : false

  // The onboarding/signup moment: this is deliberately here, not on the home
  // page — the whole point is zero friction before someone's seen their
  // first real result. Chains straight into a paywall check once an account
  // exists — nobody sees a finished video without both an account AND an
  // active subscription. accessGranted stays false (video withheld) until
  // both checks pass, so there's no flash of the finished video before a
  // redirect fires.
  //
  // Triggers on 'awaiting_payment' too, not just allDone — quickgen now
  // holds the actual Seedance submission for anyone unpaid, so allDone would
  // otherwise never become true for them at all (nothing's rendering yet).
  const awaitingPayment = seedance?.status === 'awaiting_payment'
  const [accessGranted, setAccessGranted] = useState(false)

  useEffect(() => {
    if ((!allDone && !awaitingPayment) || onboardCheckedRef.current) return
    onboardCheckedRef.current = true

    const outputPath = `/output?s=${sessionId}`

    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: { user: { id: string } | null; profile: unknown | null }) => {
        if (!data.user || !data.profile) {
          router.push(`/onboarding?session=${sessionId}&next=${encodeURIComponent(outputPath)}`)
          return
        }
        return fetch('/api/billing/status').then(r => r.json()).then((billing: { subscription?: { status: string } }) => {
          if (billing.subscription?.status !== 'active') {
            router.push(`/billing?next=${encodeURIComponent(outputPath)}&reason=unlock-video`)
            return
          }
          setAccessGranted(true)
        })
      })
      .catch(() => {})
  }, [allDone, awaitingPayment, sessionId, router])

  if (loading) {
    return (
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    )
  }

  const showGenerating = anyPending && !awaitingPayment && session && session.renders.length > 0

  if (showGenerating) {
    return (
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="lg:ml-56 pt-14 lg:pt-0 flex-1">
          <GeneratingScreen session={session!} />
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 px-4 sm:px-8 py-10">

        <div className="max-w-2xl mx-auto mb-10 text-center">
          <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl text-ink mb-2">
            {allDone ? 'Your ad is ready.' : 'Done.'}
          </h1>
          <p className="text-muted text-sm">
            {allDone ? 'Download it below, or make another.' : ''}
          </p>
        </div>

        {!session || session.renders.length === 0 ? (
          <p className="text-center text-muted text-sm">
            No renders found. <Link href="/" className="underline">Start over.</Link>
          </p>
        ) : (allDone || awaitingPayment) && !accessGranted ? (
          // Video is ready (or held pending payment) but withheld until the
          // account/paywall checks above resolve — avoids a flash of the
          // finished video, or the raw "awaiting payment" pipeline state,
          // before a redirect to /onboarding or /billing fires.
          <p className="text-center text-muted text-sm py-20">Checking your account...</p>
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
        <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      <OutputContent />
    </Suspense>
  )
}
