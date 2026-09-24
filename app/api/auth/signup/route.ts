import { NextRequest, NextResponse } from 'next/server'
import { createUser, getUserByEmail, createVerificationToken } from '@/lib/db'
import { hashPassword, attachSession } from '@/lib/auth'
import { checkRateLimit, clientIp } from '@/lib/ratelimit'
import { sendVerificationEmail } from '@/lib/email'

export async function POST(req: NextRequest) {
  // 10 signups per hour per IP — generous for a real person, tight enough
  // to blunt scripted account-creation spam.
  const { allowed, retryAfterSeconds } = await checkRateLimit(`signup:${clientIp(req)}`, 10, 3600)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many signup attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
  }

  const body = await req.json().catch(() => null)
  const { email, password } = body || {}

  if (!email || typeof email !== 'string' || !email.includes('@')) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  if (await getUserByEmail(email)) {
    return NextResponse.json({ error: 'An account with that email already exists' }, { status: 409 })
  }

  const { hash, salt } = hashPassword(password)
  const user = await createUser(email, hash, salt)

  // Best-effort and awaited — a serverless function can be frozen right
  // after the response is sent, so an un-awaited send might never actually
  // go out. A failure here shouldn't fail signup though, hence the catch.
  try {
    const token = await createVerificationToken(user.id, 'email_verify')
    await sendVerificationEmail(user.email, token)
  } catch (err) {
    console.error('[signup] failed to send verification email', err)
  }

  const res = NextResponse.json({ user: { id: user.id, email: user.email } })
  return attachSession(res, user.id)
}
