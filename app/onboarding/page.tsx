'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { INDUSTRIES } from '@/lib/industry'

const COMPANY_SIZES = ['Just me', '2-10 people', '11-50 people', '50+ people'] as const

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted mb-4">{children}</p>
  )
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">{children}</label>
  )
}

function OptionButton({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'text-left px-4 py-3 border text-sm transition-colors',
        selected ? 'border-accent border-2 text-ink font-medium' : 'border-divider text-ink hover:border-muted',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function OnboardingForm() {
  const router = useRouter()
  const params = useSearchParams()
  const nextPath = params.get('next') || '/'
  const claimSessionId = params.get('session') || undefined

  const [checking, setChecking] = useState(true)
  const [needsPassword, setNeedsPassword] = useState(false)

  const [fullName, setFullName] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [industry, setIndustry] = useState<string>('')
  const [companySize, setCompanySize] = useState<string>('')
  const [feedback, setFeedback] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  // Already fully set up (account + profile) — this page should only ever
  // run once. If they're signed in but haven't onboarded yet, no password
  // field needed; if there's no account at all yet, this submission has to
  // create one too.
  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.json())
      .then((data: { user: { id: string; email: string } | null; profile: unknown | null }) => {
        if (data.user && data.profile) {
          router.replace(nextPath)
          return
        }
        if (data.user?.email) setEmail(data.user.email)
        setNeedsPassword(!data.user)
        setChecking(false)
      })
      .catch(() => setChecking(false))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const isValid =
    fullName.trim() && businessName.trim() && email.trim() && industry && companySize &&
    (!needsPassword || password.length >= 8)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!isValid) return
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: fullName.trim(),
          businessName: businessName.trim(),
          email: email.trim(),
          industry,
          companySize,
          feedback: feedback.trim() || undefined,
          ...(needsPassword ? { password } : {}),
          ...(claimSessionId ? { sessionId: claimSessionId } : {}),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      router.push(nextPath)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  if (checking) {
    return <div className="min-h-screen bg-cream" />
  }

  return (
    <div className="min-h-screen bg-cream flex justify-center px-4 sm:px-8 py-10 sm:py-16">
      <div className="w-full max-w-xl">
        <div className="mb-2 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="font-display text-cream text-xs font-bold">H</span>
          </div>
          <span className="font-display text-ink text-sm font-semibold tracking-tight">Hemingway</span>
        </div>

        <h1 className="font-display text-3xl sm:text-4xl text-ink mt-6 mb-2">
          {claimSessionId ? 'Love it? Let’s save it to your account.' : 'Let’s set up your account.'}
        </h1>
        <p className="text-muted text-sm mb-12">
          A couple of quick things, once — this won&apos;t come up again.
        </p>

        <form onSubmit={handleSubmit} className="space-y-12">
          {/* About you */}
          <div>
            <SectionLabel>About you</SectionLabel>
            <div className="space-y-5">
              <div>
                <FieldLabel>Full name</FieldLabel>
                <input
                  type="text"
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  placeholder="Jane Doe"
                  className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors"
                  required
                  autoFocus
                />
              </div>
              <div>
                <FieldLabel>Business name</FieldLabel>
                <input
                  type="text"
                  value={businessName}
                  onChange={e => setBusinessName(e.target.value)}
                  placeholder="Your brand or company"
                  className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors"
                  required
                />
              </div>
              <div>
                <FieldLabel>Email address</FieldLabel>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@brand.com"
                  disabled={!needsPassword}
                  className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors disabled:bg-[#F0EDE8] disabled:text-muted"
                  required
                />
              </div>
              {needsPassword && (
                <div>
                  <FieldLabel>Password</FieldLabel>
                  <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors"
                    required
                    minLength={8}
                  />
                </div>
              )}
            </div>
          </div>

          <div className="border-t border-divider" />

          {/* Your business */}
          <div>
            <SectionLabel>Your business</SectionLabel>
            <div className="space-y-6">
              <div>
                <FieldLabel>Industry / category</FieldLabel>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {INDUSTRIES.map(opt => (
                    <OptionButton key={opt} label={opt} selected={industry === opt} onClick={() => setIndustry(opt)} />
                  ))}
                </div>
              </div>
              <div>
                <FieldLabel>Company size</FieldLabel>
                <div className="grid grid-cols-2 gap-2">
                  {COMPANY_SIZES.map(opt => (
                    <OptionButton key={opt} label={opt} selected={companySize === opt} onClick={() => setCompanySize(opt)} />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-divider" />

          {/* Help us get it right */}
          <div>
            <SectionLabel>Help us get it right</SectionLabel>
            <div>
              <FieldLabel>
                Anything else about your brand&apos;s voice? <span className="text-muted/50 normal-case font-normal">— optional</span>
              </FieldLabel>
              <textarea
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                placeholder="Tone, phrases you avoid, what makes your brand distinct — anything that helps us get it right."
                rows={3}
                className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors resize-none"
              />
            </div>
          </div>

          {error && (
            <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3">{error}</div>
          )}

          <div className="border-t border-divider pt-8">
            <button
              type="submit"
              disabled={!isValid || submitting}
              className="bg-accent text-cream px-8 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-3"
            >
              {submitting ? (
                <>
                  <span className="inline-block w-3 h-3 border border-cream/40 border-t-cream animate-spin" />
                  Saving...
                </>
              ) : (
                <>Continue →</>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <OnboardingForm />
    </Suspense>
  )
}
