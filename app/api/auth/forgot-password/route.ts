import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail, createVerificationToken } from '@/lib/db'
import { sendPasswordResetEmail } from '@/lib/email'
import { checkRateLimit, clientIp } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { email } = body || {}
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  const { allowed, retryAfterSeconds } = await checkRateLimit(`forgot-password:${clientIp(req)}:${email.toLowerCase()}`, 5, 900)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
  }

  const user = await getUserByEmail(email)
  // Always return the same response whether or not the account exists —
  // otherwise this endpoint becomes a way to check which emails have accounts.
  if (user) {
    const token = await createVerificationToken(user.id, 'password_reset')
    await sendPasswordResetEmail(user.email, token).catch(err => console.error('[forgot-password] send failed', err))
  }
  return NextResponse.json({ ok: true })
}
