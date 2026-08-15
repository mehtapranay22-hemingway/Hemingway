'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import type { ScriptVariant } from '@/lib/types'
import { HOOK_LABELS } from '@/lib/types'

const COST_NOTE = 'HeyGen credit usage depends on your plan\'s per-minute rate.'

function ScriptCard({
  script,
  index,
  selected,
  onToggle,
}: {
  script: ScriptVariant
  index: number
  selected: boolean
  onToggle: () => void
}) {
  const label = HOOK_LABELS[script.hookType] || script.hookType

  return (
    <div
      className={[
        'border bg-surface transition-all script-reveal',
        selected ? 'border-accent border-2' : 'border-divider',
      ].join(' ')}
      style={{ animationDelay: `${index * 60}ms` }}
    >
      {/* Manuscript header */}
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-divider">
        <span className="font-mono text-[11px] text-muted uppercase tracking-widest">
          {label}
        </span>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-muted">
            ≈{script.estimatedDurationSeconds}s
          </span>
          <button
            onClick={onToggle}
            className={[
              'w-5 h-5 border flex items-center justify-center transition-all shrink-0',
              selected ? 'border-accent bg-accent' : 'border-divider bg-surface hover:border-ink',
            ].join(' ')}
            aria-label={selected ? 'Deselect' : 'Select for render'}
          >
            {selected && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Script content */}
      <div className="px-6 pt-6 pb-8 space-y-5">
        {/* Hook — in display serif, large */}
        <div>
          <p className="font-display text-xl text-ink leading-snug">
            &ldquo;{script.hookLine}&rdquo;
          </p>
        </div>

        {/* Body */}
        <div className="border-l-2 border-divider pl-4">
          <p className="text-sm text-ink leading-relaxed">{script.body}</p>
        </div>

        {/* CTA */}
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted mr-2">CTA</span>
          <span className="text-sm text-ink">{script.cta}</span>
        </div>

        {/* Pacing */}
        {script.pacingNotes && (
          <div className="pt-1">
            <span className="font-mono text-[11px] text-muted/70 italic">{script.pacingNotes}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ScriptsContent() {
  const router = useRouter()
  const params = useSearchParams()

  const sessionId = params.get('s') || ''
  const avatarId = params.get('avatarId') || ''
  const avatarName = params.get('avatarName') || ''
  const voiceId = params.get('voiceId') || ''

  const [scripts, setScripts] = useState<ScriptVariant[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/session?s=${sessionId}`)
      .then(r => r.json())
      .then(data => {
        if (data.scripts) setScripts(data.scripts)
        setLoading(false)
      })
      .catch(() => { setError('Failed to load scripts'); setLoading(false) })
  }, [sessionId])

  function toggleScript(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectedScripts = scripts.filter(s => selected.has(s.id))
  const totalSecs = selectedScripts.reduce((sum, s) => sum + s.estimatedDurationSeconds, 0)

  async function handleRender() {
    if (selected.size === 0) return
    setRendering(true)
    setError('')
    try {
      const res = await fetch('/api/render', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId, scriptIds: [...selected], avatarId, voiceId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start renders')

      const outParams = new URLSearchParams({ s: sessionId })
      router.push(`/output?${outParams}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed')
      setRendering(false)
    }
  }

  if (loading) {
    return (
      <div className="py-16">
        <p className="text-muted text-sm">Loading scripts...</p>
      </div>
    )
  }

  return (
    <div className="py-16">
      <div className="mb-10 flex items-center gap-4">
        <Link
          href={`/brief?s=${sessionId}&avatarId=${avatarId}&avatarName=${avatarName}&voiceId=${voiceId}`}
          className="text-muted text-sm hover:text-ink transition-colors"
        >
          ← Back to brief
        </Link>
        {avatarName && (
          <span className="text-xs text-muted border border-divider px-2 py-1">{avatarName}</span>
        )}
      </div>

      <header className="mb-4">
        <h1 className="font-display text-4xl text-ink mb-1">Review scripts.</h1>
        <p className="text-muted text-sm">Select which variants to render into video.</p>
      </header>

      {error && (
        <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3 mb-8">
          {error}
        </div>
      )}

      <div className="space-y-5 mb-10">
        {scripts.map((script, i) => (
          <ScriptCard
            key={script.id}
            script={script}
            index={i}
            selected={selected.has(script.id)}
            onToggle={() => toggleScript(script.id)}
          />
        ))}
      </div>

      {/* Selection summary + render button */}
      <div className="border-t border-divider pt-8">
        {selected.size > 0 ? (
          <div className="flex items-start gap-8">
            <div>
              <button
                onClick={handleRender}
                disabled={rendering}
                className="bg-ink text-cream px-8 py-3 text-sm font-sans font-medium hover:bg-accent transition-colors disabled:opacity-40 flex items-center gap-3"
              >
                {rendering ? (
                  <>
                    <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                    Starting renders...
                  </>
                ) : (
                  `Render ${selected.size} script${selected.size > 1 ? 's' : ''} →`
                )}
              </button>
            </div>
            <div className="text-xs text-muted leading-relaxed max-w-xs pt-1">
              <div className="font-semibold text-ink mb-0.5">
                {selected.size} video{selected.size > 1 ? 's' : ''} — ≈{totalSecs}s total
              </div>
              <div>{COST_NOTE}</div>
            </div>
          </div>
        ) : (
          <p className="text-muted text-sm">Select at least one script to render.</p>
        )}
      </div>
    </div>
  )
}

export default function ScriptsPage() {
  return (
    <Suspense fallback={<div className="py-16 text-muted text-sm">Loading...</div>}>
      <ScriptsContent />
    </Suspense>
  )
}
