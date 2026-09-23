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

export default function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(data => setEmail(data.user?.email ?? null))
      .catch(() => {})
  }, [])

  async function handleSignOut() {
    await fetch('/api/auth/signout', { method: 'POST' })
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-56 bg-white border-r border-[#E8E5DF] flex flex-col z-20">
      {/* Logo */}
      <div className="px-5 py-5 border-b border-[#E8E5DF]">
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="font-display text-cream text-xs font-bold">H</span>
          </div>
          <span className="font-display text-ink text-sm font-semibold tracking-tight">
            Hemingway
          </span>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {NAV.map(item => {
          const isActive = pathname === item.href
          return (
            <Link
              key={item.href}
              href={item.href}
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
      </nav>

      {/* Bottom */}
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
  )
}
