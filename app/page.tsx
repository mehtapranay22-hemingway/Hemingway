'use client'

import { useState, useRef, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Sidebar from './components/Sidebar'

const OVERLAY = 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.38) 55%, rgba(0,0,0,0.12) 100%)'

const CATEGORIES = [
  {
    id: 'product-launch',
    title: 'Product\nLaunch',
    description: 'Announce something new',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=480&q=60&fit=crop&auto=format',
    prompt: 'I want a product launch ad that announces something new and gets people excited to buy.',
  },
  {
    id: 'ugc-testimonial',
    title: 'UGC\nTestimonial',
    description: 'Real customer, real result',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=480&q=60&fit=crop&auto=format',
    prompt: 'I want a UGC-style testimonial ad where a real customer shares their result from using my product.',
  },
  {
    id: 'founder-story',
    title: 'Founder\nStory',
    description: 'The human behind the brand',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=480&q=60&fit=crop&auto=format',
    prompt: 'I want a founder story ad that shows the human behind the brand and why I started this company.',
  },
  {
    id: 'competitor-angle',
    title: 'Competitor\nAngle',
    description: 'Win by contrast',
    image: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=480&q=60&fit=crop&auto=format',
    prompt: 'I want an ad that positions my product as the better alternative — win by contrast against competitors.',
  },
  {
    id: 'seasonal-promo',
    title: 'Seasonal\nPromo',
    description: 'Time-sensitive, high urgency',
    image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=480&q=60&fit=crop&auto=format',
    prompt: 'I want a seasonal promotion ad with high urgency — limited time offer that drives people to act now.',
  },
  {
    id: 'review-breakdown',
    title: 'Review\nBreakdown',
    description: 'Let the proof do the talking',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=480&q=60&fit=crop&auto=format',
    prompt: 'I want an ad built around real customer reviews — let the social proof do the talking.',
  },
]

type UploadedImage = { dataUrl: string; base64: string; mediaType: string; name: string }

type BriefAnalysis = {
  verdict: 'proceed' | 'flag' | 'block'
  brand_tier: 'budget' | 'mid' | 'premium' | 'luxury'
  production: { clips: number; quality: string; clip_duration: number }
  rationale: string
  flag_message: string | null
}

type ConversationTurn = { role: 'claude' | 'user'; text: string }
type AuthState = { user: { id: string; email: string } | null; profile: { fullName: string } | null }

export default function HomePage() {
  const router = useRouter()
  const [auth, setAuth] = useState<AuthState>({ user: null, profile: null })
  // Restored from sessionStorage on mount — the brief text was never
  // persisted anywhere before, so navigating away (to /pick, /output, and
  // now /onboarding or /billing mid-flow) and back wiped whatever someone
  // had typed. Lazy-init so it's there on the very first render, not one
  // render late.
  const [description, setDescription] = useState(() => {
    if (typeof window === 'undefined') return ''
    return sessionStorage.getItem('hw_draft_description') || ''
  })
  const [image, setImage] = useState<UploadedImage | null>(null)
  const [uploadError, setUploadError] = useState('')
  const [analyzing, setAnalyzing] = useState(false)
  const [blockMessage, setBlockMessage] = useState<string | null>(null)
  const [conversation, setConversation] = useState<ConversationTurn[]>([])
  const [replyDraft, setReplyDraft] = useState('')
  const [enrichedDescription, setEnrichedDescription] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // No gate here on purpose — generating comes first, accounts come after
  // (see app/output/page.tsx for where onboarding/signup actually happens).
  // This just fills in the greeting/nav once we know who's asking.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => setAuth({ user: data.user, profile: data.profile }))
      .catch(() => {})
  }, [])

  // Keep the draft brief alive across navigation — see the lazy-init above
  // for why this exists.
  useEffect(() => {
    sessionStorage.setItem('hw_draft_description', description)
  }, [description])

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (file.size > 5 * 1024 * 1024) { setUploadError('Image must be under 5MB'); return }
    setUploadError('')
    const reader = new FileReader()
    reader.onload = ev => {
      const dataUrl = ev.target?.result as string
      const base64 = dataUrl.split(',')[1]
      setImage({ dataUrl, base64, mediaType: file.type, name: file.name })
    }
    reader.readAsDataURL(file)
    e.target.value = ''
  }

  function saveAndNavigate(desc: string, analysis: BriefAnalysis) {
    if (image) {
      sessionStorage.setItem('hw_img_b64', image.base64)
      sessionStorage.setItem('hw_img_type', image.mediaType)
    } else {
      sessionStorage.removeItem('hw_img_b64')
      sessionStorage.removeItem('hw_img_type')
    }
    sessionStorage.setItem('hw_analysis', JSON.stringify(analysis))
    router.push(`/pick?d=${encodeURIComponent(desc)}`)
  }

  async function runAnalysis(desc: string, turns: ConversationTurn[], allowQuestion: boolean) {
    setAnalyzing(true)
    setBlockMessage(null)

    try {
      const res = await fetch('/api/analyze-brief', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: desc, hasImage: !!image }),
      })
      const analysis: BriefAnalysis = await res.json()

      if (analysis.verdict === 'block') {
        setBlockMessage(analysis.flag_message || 'This brief needs more detail before we can make a good ad.')
        setAnalyzing(false)
        return
      }

      if (analysis.verdict === 'flag' && analysis.flag_message && allowQuestion) {
        setConversation([...turns, { role: 'claude', text: analysis.flag_message }])
        setEnrichedDescription(desc)
        setAnalyzing(false)
        return
      }

      // proceed — either a clean verdict, or we've already asked our one allowed question
      saveAndNavigate(desc, analysis)
    } catch {
      // On error don't block — proceed with the description as-is
      router.push(`/pick?d=${encodeURIComponent(desc)}`)
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = description.trim()
    if (!trimmed) return
    setConversation([])
    setEnrichedDescription('')
    setReplyDraft('')
    await runAnalysis(trimmed, [], true)
  }

  async function handleReplySubmit(e: React.FormEvent) {
    e.preventDefault()
    const reply = replyDraft.trim()
    if (!reply) return

    const newTurns: ConversationTurn[] = [...conversation, { role: 'user', text: reply }]
    setConversation(newTurns)
    setReplyDraft('')

    // Build enriched description from original + all conversation context
    const context = newTurns
      .map(t => (t.role === 'claude' ? `Question: ${t.text}` : `Answer: ${t.text}`))
      .join('\n')
    const enriched = `${enrichedDescription || description.trim()}\n\nClarifications:\n${context}`
    setEnrichedDescription(enriched)

    await runAnalysis(enriched, newTurns, false)
  }

  function handleContinueAnyway() {
    const desc = enrichedDescription || description.trim()
    if (!desc) return
    // Proceed without waiting for a stronger brief — use last known analysis or defaults
    const storedAnalysis = sessionStorage.getItem('hw_analysis')
    if (storedAnalysis) {
      router.push(`/pick?d=${encodeURIComponent(desc)}`)
    } else {
      router.push(`/pick?d=${encodeURIComponent(desc)}`)
    }
  }

  function handleCategoryClick(prompt: string) {
    setDescription(prompt)
  }

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    setAuth({ user: null, profile: null })
    router.refresh()
  }

  const firstName = auth.profile?.fullName?.split(' ')[0]

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />

      <div className="lg:ml-56 pt-14 lg:pt-0 flex-1 flex flex-col">
        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-4 sm:px-8 py-3 flex items-center justify-end gap-4">
          {auth.user ? (
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-full bg-ink flex items-center justify-center">
                  <span className="text-cream text-xs font-semibold">{(firstName || auth.user.email)[0].toUpperCase()}</span>
                </div>
                <span className="text-sm text-ink font-medium">{firstName || auth.user.email}</span>
              </div>
              <button onClick={handleSignOut} className="text-xs text-muted hover:text-ink transition-colors">
                Sign out
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-3 text-sm">
              <Link href="/signin" className="text-muted hover:text-ink transition-colors">Sign in</Link>
              <Link href="/signup" className="bg-ink text-cream px-4 py-1.5 text-xs font-medium hover:bg-accent transition-colors">
                Sign up
              </Link>
            </div>
          )}
        </div>

        {/* Hero prompt */}
        <div className="flex flex-col items-center justify-center min-h-[58vh] px-4 sm:px-8 text-center">
          <div className="mb-8">
            <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl text-ink leading-tight mb-2">
              Let&apos;s make some money{firstName ? ',' : '.'}
            </h1>
            {firstName && (
              <h1 className="font-display text-3xl sm:text-4xl lg:text-5xl leading-tight">
                <span className="text-accent">{firstName}.</span>
              </h1>
            )}
          </div>

          <form onSubmit={handleSubmit} className="w-full max-w-2xl">
            <div className="flex flex-col bg-white border border-[#E0DDD7] shadow-sm focus-within:border-ink focus-within:shadow-md transition-all">
              <textarea
                rows={4}
                value={description}
                onChange={e => setDescription(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault()
                    handleSubmit(e)
                  }
                }}
                autoFocus
                placeholder="Describe your product, your offer, your message. e.g. I run a jewelry brand and want an ad for women who want affordable everyday luxury — our gold hoops, $40."
                className="w-full px-5 pt-5 pb-3 text-base text-ink placeholder:text-[#B5B0A8] bg-transparent outline-none font-sans resize-none"
              />

              {/* Image thumbnail */}
              {image && (
                <div className="px-5 pb-2 flex items-center gap-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={image.dataUrl} alt={image.name} className="w-12 h-12 object-cover border border-divider" />
                  <span className="text-xs text-muted truncate max-w-[160px]">{image.name}</span>
                  <button
                    type="button"
                    onClick={() => setImage(null)}
                    className="text-xs text-muted hover:text-error transition-colors ml-1"
                  >
                    ✕ remove
                  </button>
                </div>
              )}
              {uploadError && <p className="px-5 pb-2 text-xs text-error">{uploadError}</p>}

              <div className="flex items-center justify-between px-5 pb-4">
                <div className="flex items-center gap-3">
                  {/* Hidden file input */}
                  <input
                    ref={fileRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                  {/* "+" upload button */}
                  <button
                    type="button"
                    onClick={() => fileRef.current?.click()}
                    title="Add product image"
                    className="w-6 h-6 border border-[#C0BAB2] text-[#9B9892] hover:border-ink hover:text-ink transition-colors flex items-center justify-center text-sm leading-none"
                  >
                    +
                  </button>
                  <span className="text-xs text-[#C0BAB2]">Press Enter to continue · Shift+Enter for new line</span>
                </div>
                <button
                  type="submit"
                  disabled={!description.trim() || analyzing}
                  className="px-5 py-2 bg-ink text-cream text-sm font-medium hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {analyzing ? (
                    <>
                      <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                      Checking...
                    </>
                  ) : (
                    <>
                      Next
                      <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                        <path d="M2 6.5h9M7 2l4.5 4.5L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Block message — must rewrite */}
            {blockMessage && (
              <div className="mt-3 px-4 py-3 bg-[#FDF3F3] border border-[#E8C5C5] text-sm text-[#8A3030] text-left">
                {blockMessage}
              </div>
            )}
          </form>

          {/* Multi-turn clarification conversation — outside the form above; it has its own
              form for the reply input, and HTML forbids nesting <form> elements. */}
          {conversation.length > 0 && (
            <div className="w-full max-w-2xl mt-3 bg-white border border-[#E0DDD7] text-left">
              {conversation.map((turn, i) => (
                <div
                  key={i}
                  className={`px-4 py-3 text-sm border-b border-[#F0EDE8] last:border-b-0 ${
                    turn.role === 'claude'
                      ? 'text-[#6B5A2A] bg-[#FDF8EE]'
                      : 'text-ink bg-white'
                  }`}
                >
                  <span className="text-[10px] uppercase tracking-widest font-semibold mr-2 opacity-50">
                    {turn.role === 'claude' ? 'Hemingway' : 'You'}
                  </span>
                  {turn.text}
                </div>
              ))}

              {/* Reply input — only show when last turn is Claude's */}
              {conversation[conversation.length - 1]?.role === 'claude' && (
                <form onSubmit={handleReplySubmit} className="flex gap-0 border-t border-[#E0DDD7]">
                  <input
                    autoFocus
                    type="text"
                    value={replyDraft}
                    onChange={e => setReplyDraft(e.target.value)}
                    placeholder="Add more detail..."
                    disabled={analyzing}
                    className="flex-1 px-4 py-3 text-sm text-ink bg-transparent outline-none placeholder:text-[#C0BAB2]"
                  />
                  <button
                    type="submit"
                    disabled={!replyDraft.trim() || analyzing}
                    className="px-4 py-3 text-sm text-[#9B9892] hover:text-ink disabled:opacity-30 transition-colors border-l border-[#E0DDD7]"
                  >
                    {analyzing ? '...' : '→'}
                  </button>
                </form>
              )}

              <div className="px-4 py-2 border-t border-[#F0EDE8]">
                <button
                  type="button"
                  onClick={handleContinueAnyway}
                  className="text-xs text-[#C0BAB2] hover:text-[#9B9892] transition-colors"
                >
                  Skip and continue anyway →
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Content formats */}
        <div className="px-4 sm:px-8 pb-16">
          <div className="flex items-center gap-2 mb-5 text-sm text-[#6B6862]">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="1" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="1" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="1" y="8" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
              <rect x="8" y="8" width="5" height="5" rx="0.5" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
            <span className="font-medium">Content formats</span>
            <span className="text-[#B0ACA5]">— pick a starting point</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {CATEGORIES.map(cat => (
              <button
                key={cat.id}
                onClick={() => handleCategoryClick(cat.prompt)}
                className="group relative overflow-hidden aspect-[16/10] sm:aspect-[4/3] flex flex-col justify-between bg-[#1A1410] transition-all hover:scale-[1.015] hover:shadow-xl text-left"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={cat.image}
                  alt={cat.title.replace('\n', ' ')}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <div className="absolute inset-0" style={{ background: OVERLAY }} />

                <div className="relative px-5 pt-4">
                  <span className="text-[10px] font-sans font-semibold uppercase tracking-widest text-white/50">
                    {cat.description}
                  </span>
                </div>

                <div className="relative px-5 pb-5">
                  <h3 className="font-display text-[1.6rem] leading-tight text-white mb-2.5 whitespace-pre-line">
                    {cat.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs font-sans font-medium text-white/55 group-hover:text-white/90 transition-colors">
                    <span>Use this format</span>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1.5 5.5h8M5.5 1.5l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </button>
            ))}
          </div>

          <div className="flex flex-wrap gap-5 text-xs text-[#B0ACA5] mt-10 pt-6 border-t border-[#E8E5DF]">
            <Link href="/terms" className="hover:text-ink transition-colors">Terms</Link>
            <Link href="/privacy" className="hover:text-ink transition-colors">Privacy</Link>
            <Link href="/refund-policy" className="hover:text-ink transition-colors">Refunds</Link>
            <a href="mailto:support@hemingwayengine.com" className="hover:text-ink transition-colors">Contact</a>
          </div>
        </div>
      </div>
    </div>
  )
}
