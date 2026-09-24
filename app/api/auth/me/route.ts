import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getClientProfile } from '@/lib/db'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ user: null, profile: null })
  const profile = await getClientProfile(user.id)
  return NextResponse.json({ user: { id: user.id, email: user.email, emailVerified: user.emailVerified }, profile })
}
