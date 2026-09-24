import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail } from '@/lib/db'
import { verifyPassword, attachSession } from '@/lib/auth'
import { checkRateLimit, clientIp } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { email, password } = body || {}

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  // 10 attempts per 15 min, keyed by IP+email — blunts brute-forcing one
  // account's password without locking out unrelated users on the same IP.
  const { allowed, retryAfterSeconds } = await checkRateLimit(`signin:${clientIp(req)}:${email.toLowerCase()}`, 10, 900)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many attempts. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
  }

  const user = await getUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 })
  }

  const res = NextResponse.json({ user: { id: user.id, email: user.email } })
  return attachSession(res, user.id)
}
