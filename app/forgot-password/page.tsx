'use client'

import { useState } from 'react'
import Link from 'next/link'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-cream flex justify-center px-4 sm:px-8 py-16 sm:py-24">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex items-center gap-2.5">
          <div className="w-7 h-7 bg-ink flex items-center justify-center shrink-0">
            <span className="font-display text-cream text-xs font-bold">H</span>
          </div>
          <span className="font-display text-ink text-sm font-semibold tracking-tight">Hemingway</span>
        </div>

        {sent ? (
          <>
            <h1 className="font-display text-3xl text-ink mb-1">Check your email.</h1>
            <p className="text-muted text-sm mb-8">
              If an account exists for <span className="text-ink">{email.trim()}</span>, we&apos;ve sent a link to reset your password. It expires in an hour.
            </p>
            <Link href="/signin" className="text-ink underline hover:text-accent transition-colors text-sm">
              ← Back to sign in
            </Link>
          </>
        ) : (
          <>
            <h1 className="font-display text-3xl text-ink mb-1">Forgot your password?</h1>
            <p className="text-muted text-sm mb-8">We&apos;ll email you a link to reset it.</p>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="jane@brand.com"
                  className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors"
                  required
                  autoFocus
                />
              </div>

              {error && <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3">{error}</div>}

              <button
                type="submit"
                disabled={submitting || !email.trim()}
                className="w-full bg-accent text-cream px-8 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {submitting ? 'Sending...' : 'Send reset link'}
              </button>
            </form>

            <p className="text-muted text-sm mt-6 text-center">
              <Link href="/signin" className="text-ink underline hover:text-accent transition-colors">
                ← Back to sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  )
}
