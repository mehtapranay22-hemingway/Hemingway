import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { createVerificationToken } from '@/lib/db'
import { sendVerificationEmail } from '@/lib/email'
import { checkRateLimit, clientIp } from '@/lib/ratelimit'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  if (user.emailVerified) return NextResponse.json({ ok: true, alreadyVerified: true })

  const { allowed, retryAfterSeconds } = await checkRateLimit(`resend-verify:${clientIp(req)}:${user.id}`, 3, 900)
  if (!allowed) {
    return NextResponse.json({ error: 'Too many requests. Try again shortly.' }, { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } })
  }

  const token = await createVerificationToken(user.id, 'email_verify')
  await sendVerificationEmail(user.email, token)
  return NextResponse.json({ ok: true })
}
