import { NextRequest, NextResponse } from 'next/server'
import { createUser, getUserByEmail } from '@/lib/db'
import { hashPassword, attachSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
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

  const res = NextResponse.json({ user: { id: user.id, email: user.email } })
  return attachSession(res, user.id)
}
