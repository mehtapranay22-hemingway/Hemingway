import { NextRequest, NextResponse } from 'next/server'
import { getClientProfile, saveClientProfile, getUserByEmail, createUser } from '@/lib/db'
import { getCurrentUser, hashPassword, attachSession } from '@/lib/auth'
import { claimSession } from '@/lib/sessions'
import { INDUSTRIES } from '@/lib/industry'

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ completed: false, profile: null })
  const profile = getClientProfile(user.id)
  return NextResponse.json({ completed: !!profile, profile })
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { fullName, businessName, email, industry, companySize, feedback, password, sessionId } = body || {}

  if (!fullName || typeof fullName !== 'string') {
    return NextResponse.json({ error: 'fullName is required' }, { status: 400 })
  }
  if (!businessName || typeof businessName !== 'string') {
    return NextResponse.json({ error: 'businessName is required' }, { status: 400 })
  }
  if (!email || typeof email !== 'string') {
    return NextResponse.json({ error: 'email is required' }, { status: 400 })
  }
  if (!industry || !INDUSTRIES.includes(industry)) {
    return NextResponse.json({ error: 'industry must be one of the listed options' }, { status: 400 })
  }
  if (!companySize || typeof companySize !== 'string') {
    return NextResponse.json({ error: 'companySize is required' }, { status: 400 })
  }

  // Two paths in: already signed in (e.g. came via /signup first) just needs
  // the profile saved. Not signed in yet — this submission has to create the
  // account too, since onboarding is the only place that ever collects a
  // password when someone generates before signing up.
  let userId: string
  let isNewSignup = false

  const existingUser = getCurrentUser(req)
  if (existingUser) {
    userId = existingUser.id
  } else {
    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
    }
    if (getUserByEmail(email)) {
      return NextResponse.json({ error: 'An account with that email already exists — sign in instead.' }, { status: 409 })
    }
    const { hash, salt } = hashPassword(password)
    const newUser = createUser(email, hash, salt)
    userId = newUser.id
    isNewSignup = true
  }

  const profile = saveClientProfile({
    userId,
    fullName,
    businessName,
    email,
    industry,
    companySize,
    feedback: typeof feedback === 'string' && feedback.trim() ? feedback.trim() : null,
  })

  // Claim whatever they generated before creating an account, so their
  // first video shows up in their library instead of vanishing.
  if (sessionId && typeof sessionId === 'string') {
    claimSession(sessionId, userId)
  }

  const res = NextResponse.json({ profile })
  return isNewSignup ? attachSession(res, userId) : res
}
