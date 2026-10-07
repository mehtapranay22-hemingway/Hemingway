import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getClientProfile } from '@/lib/db'
import { isOwner } from '@/lib/owner'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ user: null, profile: null })
  const profile = await getClientProfile(user.id)
  // isOwner here is display-only (e.g. an optional "Owner mode" badge) —
  // the real enforcement is server-side in app/api/quickgen/route.ts.
  return NextResponse.json({
    user: { id: user.id, email: user.email, emailVerified: user.emailVerified, isOwner: isOwner(user) },
    profile,
  })
}
