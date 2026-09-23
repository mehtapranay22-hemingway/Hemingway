import { NextRequest, NextResponse } from 'next/server'
import { listSessionsForUser } from '@/lib/sessions'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ sessions: [] })

  const allSessions = await listSessionsForUser(user.id)
  const sessions = allSessions
    .filter(s => s.renders.some(r => r.status === 'completed' && r.videoUrl))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json({ sessions })
}
