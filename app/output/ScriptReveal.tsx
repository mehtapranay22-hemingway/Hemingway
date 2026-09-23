'use client'

import { useEffect, useRef, useState } from 'react'
import type { ScriptVariant } from '@/lib/types'

// The signature moment for the render wait: the script types itself out
// word-by-word instead of showing a spinner/progress bar, since the full
// script is already known before the render finishes. Paced to roughly the
// spoken-delivery rate used everywhere else in this app (2.5 words/sec —
// see SCRIPT_SYSTEM), clamped to a sensible floor/ceiling so it never feels
// instant or drags on forever. If the render finishes first, it speeds up
// to a graceful finish instead of cutting away mid-sentence.

const WORDS_PER_SECOND = 2.5
const MIN_TYPE_DURATION_MS = 15000
const MAX_TYPE_DURATION_MS = 45000
const FAST_FINISH_WORD_INTERVAL_MS = 35
const SETTLE_DELAY_MS = 400
const VIDEO_FADE_DELAY_MS = 450

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    setReduced(mq.matches)
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches)
    mq.addEventListener('change', handler)
    return () => mq.removeEventListener('change', handler)
  }, [])
  return reduced
}

export function ScriptReveal({
  script,
  renderComplete,
  videoUrl,
  onSettled,
}: {
  script: ScriptVariant
  renderComplete: boolean
  videoUrl?: string
  onSettled?: () => void
}) {
  const fullText = `${script.hookLine} ${script.body} ${script.cta}`
  const words = fullText.split(' ')
  const reducedMotion = useReducedMotion()

  const [visibleCount, setVisibleCount] = useState(0)
  const [typingDone, setTypingDone] = useState(false)
  const [settled, setSettled] = useState(false)
  const [videoVisible, setVideoVisible] = useState(false)

  const renderCompleteRef = useRef(renderComplete)
  renderCompleteRef.current = renderComplete

  // Reduced motion: skip the word-by-word reveal, show the full text at once
  useEffect(() => {
    if (reducedMotion) {
      setVisibleCount(words.length)
      setTypingDone(true)
    }
    // words.length is stable for a given script/session — only reduced motion matters here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion])

  // Word-by-word reveal, self-pacing off the current render status each tick
  useEffect(() => {
    if (reducedMotion || typingDone) return
    if (visibleCount >= words.length) { setTypingDone(true); return }

    const baseDurationMs = Math.min(
      MAX_TYPE_DURATION_MS,
      Math.max(MIN_TYPE_DURATION_MS, (words.length / WORDS_PER_SECOND) * 1000)
    )
    const baseIntervalMs = baseDurationMs / words.length
    const intervalMs = renderCompleteRef.current ? Math.min(baseIntervalMs, FAST_FINISH_WORD_INTERVAL_MS) : baseIntervalMs

    const t = setTimeout(() => setVisibleCount(c => c + 1), intervalMs)
    return () => clearTimeout(t)
  }, [visibleCount, words.length, reducedMotion, typingDone])

  // Once typing is done AND the render is actually done, settle: shrink the
  // script to a caption, then fade the video in — one deliberate beat, not
  // an instant swap.
  useEffect(() => {
    if (typingDone && renderComplete && !settled) {
      const t = setTimeout(() => setSettled(true), SETTLE_DELAY_MS)
      return () => clearTimeout(t)
    }
  }, [typingDone, renderComplete, settled])

  useEffect(() => {
    if (settled && !videoVisible) {
      const t = setTimeout(() => {
        setVideoVisible(true)
        onSettled?.()
      }, VIDEO_FADE_DELAY_MS)
      return () => clearTimeout(t)
    }
    // onSettled identity isn't expected to change across renders in practice
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, videoVisible])

  const displayedText = words.slice(0, visibleCount).join(' ')
  const showIdleCursor = typingDone && !settled

  return (
    <div className="w-full flex flex-col items-center">
      <p
        className={[
          'script-reveal font-display text-ink text-center whitespace-pre-line transition-all duration-500 ease-out',
          settled ? 'text-sm text-muted max-w-lg mb-4 opacity-80 leading-snug' : 'text-2xl md:text-3xl max-w-lg py-12 leading-snug',
        ].join(' ')}
      >
        {settled ? (
          <>&ldquo;{script.hookLine}&rdquo;</>
        ) : (
          <>
            {displayedText}
            {(!typingDone || showIdleCursor) && (
              <span
                className={`inline-block w-[2px] h-[0.9em] bg-ink ml-1 align-middle ${!reducedMotion ? 'typewriter-cursor' : ''}`}
              />
            )}
          </>
        )}
      </p>

      {settled && videoUrl && (
        <div
          className={`w-full bg-[#1A1A1A] flex items-center justify-center mb-6 transition-opacity duration-700 ease-out ${videoVisible ? 'opacity-100' : 'opacity-0'}`}
          style={{ aspectRatio: '9/16', maxHeight: '70vh' }}
        >
          <video src={videoUrl} controls autoPlay playsInline className="h-full w-auto max-w-full" />
        </div>
      )}
    </div>
  )
}
