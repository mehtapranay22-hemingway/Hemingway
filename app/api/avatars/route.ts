import { NextRequest, NextResponse } from 'next/server'
import { listAvatarsForPicker } from '@/lib/avatars'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req)
  // Anonymous visitors haven't uploaded anything yet — empty roster, not an
  // error. The picker still offers "Let Hemingway cook."
  if (!user) return NextResponse.json({ avatars: [] })

  const avatars = await listAvatarsForPicker(user.id)
  return NextResponse.json({ avatars })
}
