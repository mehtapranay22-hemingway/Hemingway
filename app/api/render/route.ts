import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/sessions'
import { startRender, fetchAvatars, fetchVoices } from '@/lib/heygen'
import { getPreference } from '@/lib/preferences'
import type { RenderJob } from '@/lib/types'

async function resolveAvatar(): Promise<{ avatarId: string; voiceId: string }> {
  // 1. Use saved preference
  const pref = getPreference()
  if (pref?.avatarId && pref?.voiceId) {
    return { avatarId: pref.avatarId, voiceId: pref.voiceId }
  }

  // 2. Auto-pick: prefer female avatars
  const [avatars, voices] = await Promise.all([fetchAvatars(), fetchVoices()])

  if (!avatars.length) throw new Error('No avatars returned from HeyGen. Check your API key.')

  const female = avatars.find(a => a.gender?.toLowerCase() === 'female')
  const chosen = female || avatars[0]

  const voice = voices[0]
  if (!voice) throw new Error('No voices returned from HeyGen.')

  return { avatarId: chosen.avatar_id, voiceId: voice.voice_id }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  const { sessionId, scriptIds } = body || {}

  if (!sessionId || !Array.isArray(scriptIds) || scriptIds.length === 0) {
    return NextResponse.json({ error: 'sessionId and scriptIds[] are required' }, { status: 400 })
  }

  const session = await getSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!session.scripts) return NextResponse.json({ error: 'No scripts found' }, { status: 400 })

  let avatarId: string
  let voiceId: string

  try {
    const resolved = await resolveAvatar()
    avatarId = resolved.avatarId
    voiceId = resolved.voiceId
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Could not load avatars'
    return NextResponse.json({ error: msg }, { status: 500 })
  }

  const selectedScripts = session.scripts.filter(s => scriptIds.includes(s.id))
  const newJobs: RenderJob[] = []

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

  const existing = session.renders.filter(r => !scriptIds.includes(r.scriptId))
  const updated = await updateSession(sessionId, { renders: [...existing, ...newJobs] })
  return NextResponse.json({ renders: updated?.renders })
}
