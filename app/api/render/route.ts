import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/sessions'
import { startRender } from '@/lib/heygen'
import type { RenderJob } from '@/lib/types'

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { sessionId, scriptIds } = body || {}

  if (!sessionId || !Array.isArray(scriptIds) || scriptIds.length === 0) {
    return NextResponse.json({ error: 'sessionId and scriptIds[] are required' }, { status: 400 })
  }

  const session = getSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!session.avatar) return NextResponse.json({ error: 'No avatar configured' }, { status: 400 })
  if (!session.scripts) return NextResponse.json({ error: 'No scripts found' }, { status: 400 })

  const { avatarId, voiceId } = session.avatar
  const selectedScripts = session.scripts.filter(s => scriptIds.includes(s.id))

  const newJobs: RenderJob[] = []

  // Start all renders in parallel
  const results = await Promise.allSettled(
    selectedScripts.map(async script => {
      const fullScript = [script.hookLine, script.body, script.cta].join(' ')
      try {
        const { videoId } = await startRender(avatarId, voiceId, fullScript)
        return { script, videoId, error: null }
      } catch (err) {
        return { script, videoId: null, error: err instanceof Error ? err.message : 'Render failed' }
      }
    })
  )

  for (const result of results) {
    if (result.status === 'fulfilled') {
      const { script, videoId, error } = result.value
      newJobs.push({
        scriptId: script.id,
        hookType: script.hookType,
        hookLine: script.hookLine,
        videoId: videoId || undefined,
        status: error ? 'failed' : 'queued',
        error: error || undefined,
        startedAt: new Date().toISOString(),
      })
    }
  }

  // Merge with any existing renders (don't overwrite completed ones)
  const existing = session.renders.filter(r => !scriptIds.includes(r.scriptId))
  const updated = updateSession(sessionId, { renders: [...existing, ...newJobs] })
  return NextResponse.json({ renders: updated?.renders })
}
