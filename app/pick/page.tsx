'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Sidebar from '../components/Sidebar'
import { AUTO_CAST_ID, NO_CHARACTER_ID, type HeyGenAvatar } from '@/lib/types'

const AUTO_CAST: HeyGenAvatar = {
  avatar_id: AUTO_CAST_ID,
  avatar_name: 'UGC-style ad',
  preview_image_url: '',
}

const NO_CHARACTER: HeyGenAvatar = {
  avatar_id: NO_CHARACTER_ID,
  avatar_name: 'Cinematic ad',
  preview_image_url: '',
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 22 22" fill="none" className={className}>
      <path d="M11 1l2.2 7.8L21 11l-7.8 2.2L11 21l-2.2-7.8L1 11l7.8-2.2L11 1z" fill="currentColor" />
    </svg>
  )
}

function FilmIcon({ className }: { className?: string }) {
  return (
    <svg width="26" height="26" viewBox="0 0 22 22" fill="none" className={className}>
      <rect x="2" y="4" width="18" height="14" rx="1" stroke="currentColor" strokeWidth="1.3" />
      <path d="M2 8h18M2 14h18M7 4v4M7 14v4M15 4v4M15 14v4" stroke="currentColor" strokeWidth="1.1" />
    </svg>
  )
}

// Mood-lit, abstract banners for the two mode cards — soft gradients, glow,
// and bokeh rather than a literal figure (a drawn person/product reads as
// clip-art at this scale; light and atmosphere read as premium instead).
function UgcIllustration() {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/site/ugc-creator.jpg"
        alt=""
        className="w-full h-full object-cover object-[50%_45%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent" />
    </div>
  )
}

function CinematicIllustration() {
  return (
    <div className="relative w-full h-full overflow-hidden">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/site/cinematic-bottle.jpg"
        alt=""
        className="w-full h-full object-cover object-[50%_7%]"
      />
      <div className="absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-transparent" />
    </div>
  )
}

const MODES: { avatar: HeyGenAvatar; description: string; banner: () => React.ReactNode }[] = [
  {
    avatar: AUTO_CAST,
    description: 'A real person delivers it, UGC-style — AI-selected to fit your brief, no fixed face.',
    banner: () => <UgcIllustration />,
  },
  {
    avatar: NO_CHARACTER,
    description: 'No individual will be used. Product-focused shots only, no dialogue.',
    banner: () => <CinematicIllustration />,
  },
]

function isSpecialCard(id: string): boolean {
  return id === AUTO_CAST_ID || id === NO_CHARACTER_ID
}

function PickAvatar() {
  const router = useRouter()
  const params = useSearchParams()
  const description = params.get('d') || ''

  const [avatars, setAvatars] = useState<HeyGenAvatar[]>([])
  const [selected, setSelected] = useState<HeyGenAvatar | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!description) { router.replace('/'); return }
    fetch('/api/avatars')
      .then(r => r.json())
      .then(data => {
        if (data.error) { setError(data.error); return }
        const list: HeyGenAvatar[] = data.avatars || []
        setAvatars(list)
        const female = list.find(a => a.gender?.toLowerCase() === 'female')
        setSelected(female || list[0] || AUTO_CAST)
      })
      .catch(() => setError('Could not load avatars'))
      .finally(() => setLoading(false))
  }, [description, router])

  async function handleGenerate() {
    if (!selected || !description) return
    setGenerating(true)
    setError('')
    try {
      const imageBase64 = sessionStorage.getItem('hw_img_b64') || undefined
      const imageMediaType = sessionStorage.getItem('hw_img_type') || undefined
      const analysisRaw = sessionStorage.getItem('hw_analysis')
      const analysis = analysisRaw ? JSON.parse(analysisRaw) : undefined
      const res = await fetch('/api/quickgen', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          avatarId: selected.avatar_id,
          avatarGender: isSpecialCard(selected.avatar_id) ? undefined : (selected.gender || 'female'),
          description, imageBase64, imageMediaType, analysis,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Generation failed')
      sessionStorage.removeItem('hw_img_b64')
      sessionStorage.removeItem('hw_img_type')
      sessionStorage.removeItem('hw_analysis')
      router.push(`/output?s=${data.sessionId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setGenerating(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />
      <div className="ml-56 flex-1 pb-32">
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-8 py-3 flex items-center gap-3">
          <a href="/" className="text-muted text-sm hover:text-ink transition-colors">← Back</a>
          <span className="text-[#E8E5DF]">/</span>
          <span className="text-sm text-ink">Pick avatar</span>
        </div>

        <div className="px-8 py-10 max-w-5xl">
          {/* Description preview */}
          <div className="mb-8 px-5 py-4 bg-white border border-divider">
            <span className="block text-muted text-[11px] uppercase tracking-widest font-semibold mb-1.5">Your brief</span>
            <p className="text-sm text-ink leading-relaxed line-clamp-2">{description}</p>
          </div>

          <h1 className="font-display text-4xl text-ink mb-1.5">Who delivers it?</h1>
          <p className="text-muted text-sm mb-8">Pick how this ad gets made.</p>

          {error && (
            <div className="border border-error/30 bg-error/5 text-error text-sm px-5 py-4 max-w-lg mb-6">
              {error}
            </div>
          )}

          {/* Two primary modes — large and deliberate, not tiles in the avatar grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 mb-12">
            {MODES.map(({ avatar: mode, description: modeDescription, banner }) => {
              const isSelected = selected?.avatar_id === mode.avatar_id
              return (
                <button
                  key={mode.avatar_id}
                  onClick={() => setSelected(mode)}
                  className={[
                    'group relative text-left bg-white border-2 flex flex-col overflow-hidden transition-all duration-200',
                    isSelected
                      ? 'border-accent shadow-[0_8px_24px_-8px_rgba(184,134,59,0.35)]'
                      : 'border-divider hover:border-ink hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-12px_rgba(26,26,26,0.18)]',
                  ].join(' ')}
                >
                  <div className="relative h-80 w-full">
                    {banner()}
                    {isSelected && (
                      <div className="absolute top-4 right-4 w-6 h-6 bg-accent flex items-center justify-center">
                        <svg width="11" height="9" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </div>
                  <div className="px-6 pt-4 pb-4 flex items-center justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="font-display text-xl leading-tight text-ink mb-0.5">{mode.avatar_name}</div>
                      <p className="text-xs text-muted leading-snug">{modeDescription}</p>
                    </div>
                    <div className={[
                      'flex items-center gap-1.5 text-xs font-medium shrink-0 transition-colors',
                      isSelected ? 'text-accent' : 'text-[#B0ACA5] group-hover:text-ink',
                    ].join(' ')}>
                      <span>{isSelected ? 'Selected' : 'Select'}</span>
                      <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                        <path d="M1.5 5.5h8M5.5 1.5l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>

          {(loading || avatars.length > 0) && (
            <div className="flex items-center gap-3 mb-5">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted shrink-0">Or pick a saved avatar</span>
              <div className="h-px bg-[#E8E5DF] flex-1" />
            </div>
          )}

          {loading && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {Array.from({ length: 12 }).map((_, i) => (
                <div key={i}>
                  <div className="aspect-[3/4] skeleton-shimmer" />
                  <div className="h-2.5 skeleton-shimmer mt-2 w-3/4" />
                  <div className="h-2 skeleton-shimmer mt-1.5 w-1/2" />
                </div>
              ))}
            </div>
          )}

          {!loading && avatars.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3">
              {avatars.map(avatar => {
                const isSelected = selected?.avatar_id === avatar.avatar_id
                return (
                  <button
                    key={avatar.avatar_id}
                    onClick={() => setSelected(avatar)}
                    className={[
                      'group text-left border bg-white transition-all duration-200',
                      isSelected ? 'border-accent border-2 shadow-md' : 'border-divider hover:border-ink hover:shadow-[0_6px_16px_-8px_rgba(26,26,26,0.2)]',
                    ].join(' ')}
                  >
                    <div className="relative aspect-[3/4] bg-divider overflow-hidden">
                      {avatar.preview_image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={avatar.preview_image_url}
                          alt={avatar.avatar_name}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-muted text-xs">No preview</div>
                      )}
                      {isSelected && (
                        <div className="absolute top-2 right-2 w-5 h-5 bg-accent flex items-center justify-center">
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path d="M1 4l3 3 5-6" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-2">
                      <div className="text-xs text-ink truncate">{avatar.avatar_name}</div>
                      {avatar.gender && <div className="text-xs text-muted capitalize">{avatar.gender}</div>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Sticky bottom bar — always visible */}
      {selected && (
        <div className="fixed bottom-0 left-56 right-0 z-20 bg-white border-t border-[#E8E5DF] px-8 py-4 flex items-center gap-6">
          <div className="flex items-center gap-3">
            {selected.avatar_id === AUTO_CAST_ID ? (
              <div className="w-10 h-10 bg-divider flex items-center justify-center text-[#9B9892] shrink-0">
                <SparkleIcon className="w-4 h-4" />
              </div>
            ) : selected.avatar_id === NO_CHARACTER_ID ? (
              <div className="w-10 h-10 bg-divider flex items-center justify-center text-[#9B9892] shrink-0">
                <FilmIcon className="w-4 h-4" />
              </div>
            ) : selected.preview_image_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={selected.preview_image_url}
                alt={selected.avatar_name}
                className="w-10 h-10 object-cover object-top"
              />
            )}
            <div>
              <div className="text-sm font-medium text-ink">{selected.avatar_name}</div>
              {selected.avatar_id === AUTO_CAST_ID ? (
                <div className="text-xs text-muted">AI-selected creator</div>
              ) : selected.avatar_id === NO_CHARACTER_ID ? (
                <div className="text-xs text-muted">No individual used</div>
              ) : (
                <div className="text-xs text-muted capitalize">{selected.gender}</div>
              )}
            </div>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="ml-auto bg-ink text-cream px-8 py-3 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-40 flex items-center gap-3"
          >
            {generating ? (
              <>
                <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                Generating...
              </>
            ) : (
              <>Make the video →</>
            )}
          </button>
          {error && <p className="text-error text-xs">{error}</p>}
        </div>
      )}
    </div>
  )
}

export default function PickPage() {
  return (
    <Suspense fallback={
      <div className="flex min-h-screen bg-[#F7F5F2]">
        <Sidebar />
        <div className="ml-56 flex-1 flex items-center justify-center">
          <p className="text-muted text-sm">Loading...</p>
        </div>
      </div>
    }>
      <PickAvatar />
    </Suspense>
  )
}
