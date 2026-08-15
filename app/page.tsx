'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import Sidebar from './components/Sidebar'

// All cards use one consistent dark overlay — visual variety comes from the photo, not the hue
const OVERLAY = 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.38) 55%, rgba(0,0,0,0.12) 100%)'

const CATEGORIES = [
  {
    id: 'product-launch',
    title: 'Product\nLaunch',
    description: 'Announce something new',
    image: 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=480&q=60&fit=crop&auto=format',
  },
  {
    id: 'ugc-testimonial',
    title: 'UGC\nTestimonial',
    description: 'Real customer, real result',
    image: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=480&q=60&fit=crop&auto=format',
  },
  {
    id: 'founder-story',
    title: 'Founder\nStory',
    description: 'The human behind the brand',
    image: 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=480&q=60&fit=crop&auto=format',
  },
  {
    id: 'competitor-angle',
    title: 'Competitor\nAngle',
    description: 'Win by contrast',
    image: 'https://images.unsplash.com/photo-1542744173-8e7e53415bb0?w=480&q=60&fit=crop&auto=format',
  },
  {
    id: 'seasonal-promo',
    title: 'Seasonal\nPromo',
    description: 'Time-sensitive, high urgency',
    image: 'https://images.unsplash.com/photo-1607082348824-0a96f2a4b9da?w=480&q=60&fit=crop&auto=format',
  },
  {
    id: 'review-breakdown',
    title: 'Review\nBreakdown',
    description: 'Let the proof do the talking',
    image: 'https://images.unsplash.com/photo-1556742049-0cfed4f6a45d?w=480&q=60&fit=crop&auto=format',
  },
]

// Wire to Clerk useUser() once auth is added
const USER_NAME = 'Pranay'
const USER_INITIALS = 'P'

export default function HomePage() {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!prompt.trim()) return
    router.push(`/avatar?prompt=${encodeURIComponent(prompt.trim())}`)
  }

  return (
    <div className="flex min-h-screen bg-[#F7F5F2]">
      <Sidebar />

      <div className="ml-56 flex-1 flex flex-col">

        {/* Top bar */}
        <div className="sticky top-0 z-10 bg-[#F7F5F2]/90 backdrop-blur-sm border-b border-[#E8E5DF] px-8 py-3 flex items-center justify-end gap-4">
          <button className="relative text-[#9B9892] hover:text-ink transition-colors p-1">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
              <path d="M9 2a5 5 0 00-5 5v3l-1.5 2h13L14 10V7a5 5 0 00-5-5zM7 15a2 2 0 004 0" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-accent text-white text-[8px] font-bold flex items-center justify-center">
              2
            </span>
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-full bg-ink flex items-center justify-center">
              <span className="text-cream text-xs font-semibold">{USER_INITIALS}</span>
            </div>
            <span className="text-sm text-ink font-medium">{USER_NAME}</span>
          </div>
        </div>

        {/* Hero prompt section — fills most of the viewport */}
        <div className="flex flex-col items-center justify-center min-h-[58vh] px-8 text-center">
          {/* Hero copy */}
          <div className="mb-8">
            <h1 className="font-display text-5xl text-ink leading-tight mb-2">
              Let&apos;s make some money,
            </h1>
            <h1 className="font-display text-5xl leading-tight">
              <span className="text-accent">{USER_NAME}.</span>
            </h1>
          </div>

          {/* Prompt bar */}
          <form onSubmit={handleSubmit} className="w-full max-w-2xl">
            <div className="flex flex-col bg-white border border-[#E0DDD7] shadow-sm focus-within:border-ink focus-within:shadow-md transition-all">
              <textarea
                rows={3}
                value={prompt}
                onChange={e => setPrompt(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e) } }}
                placeholder="e.g. A sleep tracker ring that tells you when to go to bed, wake up, and take a break — so you stop guessing"
                className="w-full px-5 pt-5 pb-3 text-base text-ink placeholder:text-[#B5B0A8] bg-transparent outline-none font-sans resize-none"
              />
              <div className="flex items-center justify-between px-5 pb-4">
                <span className="text-xs text-[#C0BAB2]">Press Enter to generate · Shift+Enter for new line</span>
                <button
                  type="submit"
                  disabled={!prompt.trim()}
                  className="px-5 py-2 bg-ink text-cream text-sm font-medium hover:bg-accent transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  Generate
                  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                    <path d="M2 6.5h9M7 2l4.5 4.5L7 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              </div>
            </div>
          </form>

          {/* Quick-start chips */}
          <div className="flex items-center gap-2 mt-4 flex-wrap justify-center">
            {['Product Launch', 'UGC Testimonial', 'Founder Story'].map(label => (
              <button
                key={label}
                onClick={() => router.push(`/avatar?type=${label.toLowerCase().replace(/ /g, '-')}`)}
                className="text-xs text-[#6B6862] border border-[#E0DDD7] bg-white px-3 py-1.5 hover:border-ink hover:text-ink transition-colors"
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content formats section — requires scroll */}
        <div className="px-8 pb-16">
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

          <div className="grid grid-cols-3 gap-4">
            {CATEGORIES.map(cat => (
              <Link
                key={cat.id}
                href={`/avatar?type=${cat.id}`}
                className="group relative overflow-hidden aspect-[4/3] flex flex-col justify-between bg-[#1A1410] transition-all hover:scale-[1.015] hover:shadow-xl"
              >
                {/* Photo */}
                <Image
                  src={cat.image}
                  alt={cat.title.replace('\n', ' ')}
                  fill
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes="(max-width: 1280px) 33vw, 400px"
                  priority
                />

                {/* Unified dark overlay — same treatment for all 6 cards */}
                <div className="absolute inset-0" style={{ background: OVERLAY }} />

                {/* Top label */}
                <div className="relative px-5 pt-4">
                  <span className="text-[10px] font-sans font-semibold uppercase tracking-widest text-white/50">
                    {cat.description}
                  </span>
                </div>

                {/* Bottom title + CTA */}
                <div className="relative px-5 pb-5">
                  <h3 className="font-display text-[1.6rem] leading-tight text-white mb-2.5 whitespace-pre-line">
                    {cat.title}
                  </h3>
                  <div className="flex items-center gap-1.5 text-xs font-sans font-medium text-white/55 group-hover:text-white/90 transition-colors">
                    <span>Create Now</span>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1.5 5.5h8M5.5 1.5l4 4-4 4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
