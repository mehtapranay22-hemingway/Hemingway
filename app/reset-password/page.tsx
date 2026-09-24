'use client'

import { useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

function ResetPasswordForm() {
  const router = useRouter()
  const params = useSearchParams()
  const token = params.get('token') || ''

  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (password !== confirm) {
      setError('Passwords don’t match')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || 'Something went wrong')
      router.push('/')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
      setSubmitting(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen bg-cream flex justify-center px-4 sm:px-8 py-16 sm:py-24">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl text-ink mb-1">Invalid link.</h1>
          <p className="text-muted text-sm mb-8">This password reset link is missing its token.</p>
          <Link href="/forgot-password" className="text-ink underline hover:text-accent transition-colors text-sm">
            Request a new link →
          </Link>
        </div>
      </div>
    )
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

        <h1 className="font-display text-3xl text-ink mb-1">Set a new password.</h1>
        <p className="text-muted text-sm mb-8">Make it something you&apos;ll remember.</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">New password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="At least 8 characters"
              className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors"
              required
              minLength={8}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-semibold uppercase tracking-widest text-muted mb-2">Confirm password</label>
            <input
              type="password"
              value={confirm}
              onChange={e => setConfirm(e.target.value)}
              placeholder="Type it again"
              className="w-full border border-divider bg-surface px-4 py-3 text-sm text-ink placeholder:text-muted/60 focus:border-accent transition-colors"
              required
              minLength={8}
            />
          </div>

          {error && <div className="border border-error/30 bg-error/5 text-error text-sm px-4 py-3">{error}</div>}

          <button
            type="submit"
            disabled={submitting || password.length < 8 || !confirm}
            className="w-full bg-accent text-cream px-8 py-3 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {submitting ? 'Saving...' : 'Reset password'}
          </button>
        </form>
      </div>
    </div>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-cream" />}>
      <ResetPasswordForm />
    </Suspense>
  )
}
