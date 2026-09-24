import { NextRequest, NextResponse } from 'next/server'
import { consumeVerificationToken, markEmailVerified } from '@/lib/db'

function appBaseUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

// Clicked straight from the verification email — GET, not POST, and redirects
// to /signin with a status flag rather than returning JSON.
export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const userId = token ? await consumeVerificationToken(token, 'email_verify') : null

  if (!userId) {
    return NextResponse.redirect(`${appBaseUrl()}/signin?verified=0`)
  }

  await markEmailVerified(userId)
  return NextResponse.redirect(`${appBaseUrl()}/signin?verified=1`)
}
