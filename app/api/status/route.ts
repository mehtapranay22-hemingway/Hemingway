import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession } from '@/lib/sessions'
import { pollRender } from '@/lib/heygen'
import { pollBrollClip, klingConfigured } from '@/lib/kling'
import { composeVideo, pollCompose, shotstackConfigured } from '@/lib/shotstack'
import type { RenderJob, Pipeline } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('s')

  if (!sessionId) return NextResponse.json({ error: 'Missing session id' }, { status: 400 })

  const session = getSession(sessionId)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })

  // --- Stage 1: Poll HeyGen avatar renders ---
  const pendingRenders = session.renders.filter(
    r => r.status !== 'completed' && r.status !== 'failed' && r.videoId
  )

  let updatedRenders = session.renders
  if (pendingRenders.length > 0) {
    const polled = await Promise.allSettled(
      pendingRenders.map(async job => {
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
    updatedRenders = session.renders.map(job => ({ ...job, ...(updates[job.scriptId] || {}) }))
  }

  // --- Stage 2: Advance Kling + Shotstack pipeline ---
  let pipeline: Pipeline | undefined = session.pipeline

  if (pipeline) {
    const avatarRender = updatedRenders.find(r => r.status === 'completed' && r.videoUrl)
    const avatarFailed = updatedRenders.every(r => r.status === 'failed')

    // Sync avatar stage from HeyGen render
    if (avatarRender && pipeline.avatar.status !== 'completed') {
      pipeline = { ...pipeline, avatar: { status: 'completed', videoUrl: avatarRender.videoUrl } }
    } else if (avatarFailed && pipeline.avatar.status !== 'failed') {
      pipeline = { ...pipeline, avatar: { status: 'failed' } }
    }

    // Poll Kling B-roll clips that are still processing
    if (klingConfigured()) {
      const processingClips = pipeline.broll.filter(c => c.status === 'processing')
      if (processingClips.length > 0) {
        const polledClips = await Promise.all(processingClips.map(pollBrollClip))
        const clipUpdates = Object.fromEntries(polledClips.map(c => [c.index, c]))
        pipeline = {
          ...pipeline,
          broll: pipeline.broll.map(c => clipUpdates[c.index] ?? c),
        }
      }
    }

    const allBrollTerminal = pipeline.broll.length === 0 ||
      pipeline.broll.every(c => c.status === 'completed' || c.status === 'failed')
    const completedBroll = pipeline.broll.filter(c => c.status === 'completed' && c.videoUrl)

    // Start Shotstack when avatar + all B-roll are terminal
    if (
      pipeline.avatar.status === 'completed' &&
      pipeline.avatar.videoUrl &&
      allBrollTerminal &&
      pipeline.compose.status === 'idle'
    ) {
      if (!shotstackConfigured() || completedBroll.length === 0) {
        // No composition possible — deliver avatar-only
        pipeline = {
          ...pipeline,
          compose: { status: 'completed' },
          finalVideoUrl: pipeline.avatar.videoUrl,
          fallbackMode: completedBroll.length === 0 && pipeline.broll.length > 0,
        }
      } else {
        try {
          const brollUrls = completedBroll.map(c => c.videoUrl!)
          const renderId = await composeVideo(pipeline.avatar.videoUrl, brollUrls)
          pipeline = { ...pipeline, compose: { status: 'processing', taskId: renderId } }
        } catch (err) {
          // Shotstack failed to start — fall back to avatar-only
          pipeline = {
            ...pipeline,
            compose: { status: 'failed', error: err instanceof Error ? err.message : 'Composition failed' },
            finalVideoUrl: pipeline.avatar.videoUrl,
            fallbackMode: true,
          }
        }
      }
    }

    // Poll Shotstack if composing
    if (pipeline.compose.status === 'processing' && pipeline.compose.taskId) {
      const result = await pollCompose(pipeline.compose.taskId)
      if (result.status === 'completed') {
        pipeline = { ...pipeline, compose: { ...pipeline.compose, status: 'completed', videoUrl: result.url }, finalVideoUrl: result.url }
      } else if (result.status === 'failed') {
        // Composition failed — fall back to avatar-only
        pipeline = {
          ...pipeline,
          compose: { ...pipeline.compose, status: 'failed' },
          finalVideoUrl: pipeline.avatar.videoUrl,
          fallbackMode: true,
        }
      }
    }
  }

  const updated = updateSession(sessionId, { renders: updatedRenders, ...(pipeline ? { pipeline } : {}) })
  return NextResponse.json(updated)
}
