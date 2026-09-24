'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const NAV = [
  {
    label: 'Home',
    href: '/',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M2 6.5L8 2l6 4.5V14a.5.5 0 01-.5.5h-3.75v-3.75h-3.5V14.5H2.5A.5.5 0 012 14V6.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Library',
    href: '/library',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="2.5" width="13" height="11" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M6 2.5v11M1.5 6h4.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        <path d="M9 6.5l3 2-3 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    label: 'Avatar',
    href: '/avatar',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="8" cy="5.5" r="2.75" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M2.5 14c0-2.761 2.462-5 5.5-5s5.5 2.239 5.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Billing',
    href: '/billing',
    icon: (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <rect x="1.5" y="3.5" width="13" height="9" rx="1" stroke="currentColor" strokeWidth="1.2"/>
        <path d="M1.5 6.5h13" stroke="currentColor" strokeWidth="1.2"/>
      </svg>
    ),
  },
]

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
        <span className="font-display text-cream text-xs font-bold">H</span>
      </div>
      <span className="font-display text-ink text-sm font-semibold tracking-tight">
        Hemingway
      </span>
    </div>
  )
}

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <>
      {NAV.map(item => {
        const isActive = pathname === item.href
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={[
              'flex items-center gap-3 px-3 py-2.5 text-sm transition-colors',
              isActive
                ? 'bg-[#F5EFE6] text-accent font-medium'
                : 'text-[#6B6862] hover:bg-[#F7F5F2] hover:text-ink',
            ].join(' ')}
          >
            <span className={isActive ? 'text-accent' : 'text-[#9B9892]'}>
              {item.icon}
            </span>
            {item.label}
          </Link>
        )
      })}
    </>
  )
}

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => setEmail(data.user?.email ?? null))
      .catch(() => {})
  }, [])

  // Close the mobile drawer automatically on route change.
  useEffect(() => {
    setMenuOpen(false)
  }, [pathname])

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <>
      {/* Desktop / iPad landscape — fixed left column, unchanged from before */}
      <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-56 bg-white border-r border-[#E8E5DF] flex-col z-20">
        <div className="px-5 py-5 border-b border-[#E8E5DF]">
          <Logo />
        </div>
        <nav className="flex-1 px-3 py-4 space-y-0.5">
          <NavLinks pathname={pathname} />
        </nav>
        <div className="px-5 py-4 border-t border-[#E8E5DF]">
          {email ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] text-[#9B9892] truncate">{email}</span>
              <button onClick={handleSignOut} className="text-[11px] text-muted hover:text-ink transition-colors shrink-0">
                Sign out
              </button>
            </div>
          ) : (
            <p className="text-[10px] text-[#B0ACA5] uppercase tracking-widest font-sans">
              Hemingway
            </p>
          )}
        </div>
      </aside>

      {/* Mobile / iPad portrait — top bar with a slide-out drawer */}
      <header className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-white border-b border-[#E8E5DF] flex items-center justify-between px-4 z-30">
        <Logo />
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Open menu"
          className="w-9 h-9 flex items-center justify-center text-ink"
        >
          <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
            <path d="M3 5.5h14M3 10h14M3 14.5h14" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
          </svg>
        </button>
      </header>

      {menuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div
            className="absolute inset-0 bg-ink/30"
            onClick={() => setMenuOpen(false)}
          />
          <div className="absolute top-0 right-0 h-full w-64 max-w-[80vw] bg-white border-l border-[#E8E5DF] flex flex-col">
            <div className="px-5 py-5 border-b border-[#E8E5DF] flex items-center justify-between">
              <Logo />
              <button
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
                className="w-8 h-8 flex items-center justify-center text-muted"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path d="M3 3l10 10M13 3L3 13" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-0.5">
              <NavLinks pathname={pathname} onNavigate={() => setMenuOpen(false)} />
            </nav>
            <div className="px-5 py-4 border-t border-[#E8E5DF]">
              {email ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] text-[#9B9892] truncate">{email}</span>
                  <button onClick={handleSignOut} className="text-[11px] text-muted hover:text-ink transition-colors shrink-0">
                    Sign out
                  </button>
                </div>
              ) : (
                <p className="text-[10px] text-[#B0ACA5] uppercase tracking-widest font-sans">
                  Hemingway
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
