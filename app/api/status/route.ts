import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/sessions'
import { pollRender } from '@/lib/heygen'
import type { RenderJob } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('s')

  if (!sessionId) return NextResponse.json({ error: 'Missing session id' }, { status: 400 })

  const session = getSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  const pending = session.renders.filter(
    r => r.status !== 'completed' && r.status !== 'failed' && r.videoId
  )

  if (pending.length === 0) return NextResponse.json(session)

  const polled = await Promise.allSettled(
    pending.map(async job => {
      const result = await pollRender(job.videoId!)
      return { jobScriptId: job.scriptId, ...result }
    })
  )

  const updates: Record<string, Partial<RenderJob>> = {}
  for (const r of polled) {
    if (r.status === 'fulfilled') {
      const { jobScriptId, status, videoUrl } = r.value
      updates[jobScriptId] = { status, videoUrl }
    }
  }

  const updatedRenders = session.renders.map(job => ({
    ...job,
    ...(updates[job.scriptId] || {}),
  }))

  const updated = updateSession(sessionId, { renders: updatedRenders })
  return NextResponse.json(updated)
}
