import { NextRequest, NextResponse } from 'next/server'
import { consumeVerificationToken, setPasswordHash, deleteAllAuthSessions } from '@/lib/db'
import { hashPassword, attachSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { token, password } = body || {}

  if (!token || typeof token !== 'string') {
    return NextResponse.json({ error: 'Missing or invalid reset link' }, { status: 400 })
  }
  if (!password || typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const userId = await consumeVerificationToken(token, 'password_reset')
  if (!userId) {
    return NextResponse.json({ error: 'This reset link is invalid or has expired' }, { status: 400 })
  }

  const { hash, salt } = hashPassword(password)
  await setPasswordHash(userId, hash, salt)
  // Invalidate every existing session, then sign back in fresh on this one.
  await deleteAllAuthSessions(userId)

  const res = NextResponse.json({ ok: true })
  return attachSession(res, userId)
}
