'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Sidebar from '../components/Sidebar'
import type { Session, RenderJob } from '@/lib/types'

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

// A download is treated as an explicit "keep" signal for the lightweight ad
// memory layer (see lib/db.ts) — best-effort and fire-and-forget.
function recordKept(sessionId: string) {
  fetch('/api/memory', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionId }),
  }).catch(() => {})
}

// Seedance hands back a presigned link that expires ~24h after generation —
// anything rendered before the rehosting fix (or if the rehost itself ever
// fails and falls back to the remote URL) only ever has that raw link, which
// is guaranteed dead by the time anyone's browsing their library days later.
// Our own rehosted videos are always a local /videos/... path, so anything
// else is treated as expired rather than shown as a normal playable video.
function isLikelyExpired(url?: string): boolean {
  return !!url && !url.startsWith('/')
}

function VideoCard({ render, sessionId, date }: { render: RenderJob; sessionId: string; date: string }) {
  const [hovered, setHovered] = useState(false)
  const expired = isLikelyExpired(render.videoUrl)

  if (expired) {
    return (
      <div className="bg-white border border-[#E8E5DF]">
        <div className="relative bg-[#F0EDE8] overflow-hidden flex flex-col items-center justify-center gap-2 px-4 text-center" style={{ aspectRatio: '9/16' }}>
          <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
            <circle cx="11" cy="11" r="9.5" stroke="#B0ACA5" strokeWidth="1.3" />
            <path d="M11 6.5v5.2M11 15v.1" stroke="#B0ACA5" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <p className="text-[#9B9892] text-xs">Link expired</p>
        </div>

        <div className="p-4 space-y-3">
          <p className="font-display text-ink text-base leading-snug line-clamp-2">
            &ldquo;{render.hookLine}&rdquo;
          </p>

          <div className="flex items-center justify-between">
            <span className="text-[#B0ACA5] text-[11px]">{formatDate(date)}</span>
            <span className="text-[11px] text-[#A8432F] font-medium">Expired</span>
          </div>

          <p className="text-[#9B9892] text-xs leading-relaxed">
            This one was rendered before videos were saved permanently. It can&apos;t be recovered — regenerate it to get a working copy.
          </p>

          <Link
            href="/"
            className="block text-center border border-[#E8E5DF] text-ink text-xs font-medium px-3 py-2.5 hover:border-ink transition-colors"
          >
            Make another video →
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div
      className="bg-white border border-[#E8E5DF] hover:border-[#C0BAB2] transition-colors group"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* Video preview */}
      <div className="relative bg-[#1A1A1A] overflow-hidden" style={{ aspectRatio: '9/16' }}>
        <video
          src={render.videoUrl}
          muted
          playsInline
          loop
          className="w-full h-full object-cover"
          ref={el => {
            if (!el) return
            if (hovered) el.play().catch(() => {})
            else { el.pause(); el.currentTime = 0 }
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#1A1A1A]/70 via-transparent to-transparent pointer-events-none" />
        <div className="absolute top-3 left-3 font-sans text-white/60 text-[10px] font-medium uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity">
          Hover to preview
        </div>
      </div>

      {/* Info */}
      <div className="p-4 space-y-3">
        <p className="font-display text-ink text-base leading-snug line-clamp-2">
          &ldquo;{render.hookLine}&rdquo;
        </p>

        <div className="flex items-center justify-between">
          <span className="text-[#B0ACA5] text-[11px]">{formatDate(date)}</span>
          <span className="text-[11px] text-[#8A9B6A] font-medium">Ready</span>
        </div>

        <div className="flex gap-2 pt-1">
          <a
            href={render.videoUrl}
            download="hemingway-video.mp4"
            onClick={() => recordKept(sessionId)}
            className="flex-1 text-center bg-ink text-cream text-xs font-medium px-3 py-2.5 hover:bg-accent transition-colors"
          >
            Download ↓
          </a>
          <Link
            href={`/output?s=${sessionId}`}
            className="px-3 py-2.5 border border-[#E8E5DF] text-[#9B9892] text-xs hover:border-ink hover:text-ink transition-colors"
          >
            View
          </Link>
        </div>
      </div>
    </div>
  )
}

export default function LibraryPage() {
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/library')
      .then(r => r.json())
      .then(data => setSessions(data.sessions ?? []))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const completedRenders = sessions.flatMap(s =>
    s.renders
      .filter(r => r.status === 'completed' && r.videoUrl)
      .map(r => ({ render: r, sessionId: s.id, date: s.createdAt }))
  )

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />

      <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 px-4 sm:px-8 py-10">
        {/* Header */}
        <div className="max-w-5xl mx-auto">
          <div className="flex items-end justify-between mb-10">
            <div>
              <p className="text-[#B0ACA5] text-xs uppercase tracking-widest font-sans mb-2">Video library</p>
              <h1 className="font-display text-4xl text-ink">Your ads.</h1>
            </div>
            <Link
              href="/"
              className="bg-ink text-cream text-sm font-medium px-5 py-2.5 hover:bg-accent transition-colors"
            >
              Make another →
            </Link>
          </div>

          {/* Loading skeleton */}
          {loading && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="bg-white border border-[#E8E5DF] animate-pulse">
                  <div className="bg-[#F0EDE8]" style={{ aspectRatio: '9/16' }} />
                  <div className="p-4 space-y-3">
                    <div className="h-4 bg-[#F0EDE8] w-full" />
                    <div className="h-3 bg-[#F0EDE8] w-1/2" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Empty state */}
          {!loading && completedRenders.length === 0 && (
            <div className="border border-[#E8E5DF] bg-white p-16 text-center max-w-md mx-auto">
              <p className="font-display text-2xl text-ink mb-2">Nothing here yet.</p>
              <p className="text-[#9B9892] text-sm mb-8">
                Videos you generate will be saved here automatically.
              </p>
              <Link
                href="/"
                className="inline-block bg-ink text-cream text-sm font-medium px-6 py-3 hover:bg-accent transition-colors"
              >
                Make your first ad →
              </Link>
            </div>
          )}

          {/* Video grid */}
          {!loading && completedRenders.length > 0 && (
            <>
              <p className="text-[#B0ACA5] text-xs mb-5">
                {completedRenders.length} video{completedRenders.length !== 1 ? 's' : ''}
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                {completedRenders.map(({ render, sessionId, date }) => (
                  <VideoCard
                    key={render.scriptId}
                    render={render}
                    sessionId={sessionId}
                    date={date}
                  />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
