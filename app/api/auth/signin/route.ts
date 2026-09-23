import { NextRequest, NextResponse } from 'next/server'
import { getUserByEmail } from '@/lib/db'
import { verifyPassword, attachSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { email, password } = body || {}

  if (!email || typeof email !== 'string' || !password || typeof password !== 'string') {
    return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
  }

  const user = getUserByEmail(email)
  if (!user || !verifyPassword(password, user.passwordHash, user.passwordSalt)) {
    return NextResponse.json({ error: 'Incorrect email or password' }, { status: 401 })
  }

  const res = NextResponse.json({ user: { id: user.id, email: user.email } })
  return attachSession(res, user.id)
}
