'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import type { ScriptVariant } from '@/lib/types'
import { HOOK_LABELS } from '@/lib/types'

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
      <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-divider">
        <span className="font-mono text-[11px] text-muted uppercase tracking-widest">{label}</span>
        <div className="flex items-center gap-4">
          <span className="font-mono text-[11px] text-muted">≈{script.estimatedDurationSeconds}s</span>
          <button
            onClick={onToggle}
            className={[
              'w-5 h-5 border flex items-center justify-center transition-all shrink-0',
              selected ? 'border-accent bg-accent' : 'border-divider bg-surface hover:border-ink',
            ].join(' ')}
          >
            {selected && (
              <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="px-6 pt-6 pb-8 space-y-5">
        <p className="font-display text-xl text-ink leading-snug">&ldquo;{script.hookLine}&rdquo;</p>
        <div className="border-l-2 border-divider pl-4">
          <p className="text-sm text-ink leading-relaxed">{script.body}</p>
        </div>
        <div>
          <span className="text-xs font-semibold uppercase tracking-widest text-muted mr-2">CTA</span>
          <span className="text-sm text-ink">{script.cta}</span>
        </div>
        {script.pacingNotes && (
          <span className="font-mono text-[11px] text-muted/70 italic">{script.pacingNotes}</span>
        )}
      </div>
    </div>
  )
}

function ScriptsContent() {
  const router = useRouter()
  const params = useSearchParams()
  const sessionId = params.get('s') || ''

  const [scripts, setScripts] = useState<ScriptVariant[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [rendering, setRendering] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/session?s=${sessionId}`)
      .then(r => r.json())
      .then(data => { if (data.scripts) setScripts(data.scripts); setLoading(false) })
      .catch(() => { setError('Failed to load scripts'); setLoading(false) })
  }, [sessionId])

  function toggleScript(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
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
        body: JSON.stringify({ sessionId, scriptIds: [...selected] }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to start renders')
      router.push(`/output?s=${sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Render failed')
      setRendering(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="ml-56 flex-1">
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-8 py-3 flex items-center gap-3">
          <a href="/brief" className="text-muted text-sm hover:text-ink transition-colors">← Back to brief</a>
          <span className="text-[#E8E5DF]">/</span>
          <span className="text-sm text-ink">Scripts</span>
        </div>

        <div className="px-8 py-10">
          <h1 className="font-display text-3xl text-ink mb-1">Review scripts.</h1>
          <p className="text-muted text-sm mb-8">Select which variants to render into video.</p>

          {loading && <p className="text-muted text-sm">Loading scripts...</p>}

          {error && (
            <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3 mb-8">{error}</div>
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

          <div className="border-t border-divider pt-8">
            {selected.size > 0 ? (
              <div className="flex items-start gap-8">
                <button
                  onClick={handleRender}
                  disabled={rendering}
                  className="bg-ink text-cream px-8 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 flex items-center gap-3"
                >
                  {rendering ? (
                    <>
                      <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                      Starting renders...
                    </>
                  ) : `Render ${selected.size} script${selected.size > 1 ? 's' : ''} →`}
                </button>
                <div className="text-xs text-muted pt-1">
                  <div className="font-semibold text-ink mb-0.5">
                    {selected.size} video{selected.size > 1 ? 's' : ''} — ≈{totalSecs}s total
                  </div>
                  <div>HeyGen credit usage applies based on your plan.</div>
                </div>
              </div>
            ) : (
              <p className="text-muted text-sm">Select at least one script to render.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export default function ScriptsPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      <ScriptsContent />
    </Suspense>
  )
}
