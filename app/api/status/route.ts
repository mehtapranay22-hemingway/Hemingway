import { NextRequest, NextResponse } from 'next/server'
import { getSession, updateSession, withSessionLock } from '@/lib/sessions'
import { pollRender } from '@/lib/heygen'
import { composeVideo, pollCompose, shotstackConfigured } from '@/lib/shotstack'
import { pollShot, submitShot, runQualityGate } from '@/lib/seedance'
import { saveVideoFromUrl } from '@/lib/uploads'
import { getSubscription, incrementVideosUsed } from '@/lib/db'
import type { RenderJob, Pipeline, SeedancePipeline } from '@/lib/types'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const sessionId = searchParams.get('s')

  if (!sessionId) return NextResponse.json({ error: 'Missing session id' }, { status: 400 })

  // Everything below — read, poll Seedance, maybe download+rehost a finished
  // video, write back — is serialized per session id. Without this, an
  // overlapping request for the same session (a slow poll outliving the
  // client's 5s interval, or a second tab) can independently repeat the same
  // work and race to write the result; see withSessionLock's own comment in
  // lib/sessions.ts for how that silently orphaned downloaded videos before.
  return withSessionLock(sessionId, () => handleStatusPoll(sessionId))
}

async function handleStatusPoll(sessionId: string): Promise<NextResponse> {
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
        const { jobScriptId, status, videoUrl, duration } = r.value
        updates[jobScriptId] = { status, videoUrl, duration }
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
      pipeline = { ...pipeline, avatar: { status: 'completed', videoUrl: avatarRender.videoUrl, duration: avatarRender.duration } }
    } else if (avatarFailed && pipeline.avatar.status !== 'failed') {
      pipeline = { ...pipeline, avatar: { status: 'failed' } }
    }

    // B-roll clips came from Kling, now removed — nothing creates new ones,
    // so any broll array here is already frozen at whatever terminal state
    // it was in (only the one historical pre-Seedance session has this).
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
          const renderId = await composeVideo(pipeline.avatar.videoUrl, brollUrls, pipeline.avatar.duration)
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

  // --- Stage 3: Advance the Seedance pipeline (the active engine going forward) ---
  let seedancePipeline: SeedancePipeline | undefined = session.seedancePipeline

  // Stage 2.5: a held submission only ever reaches Seedance here, and only
  // once the session's owning account actually has an active subscription —
  // this is the one place real cost gets incurred, checked fresh on every
  // poll rather than trusted from whenever the video was requested.
  if (seedancePipeline?.status === 'awaiting_payment' && seedancePipeline.pendingSubmission) {
    const owner = session.userId ? getSubscription(session.userId) : null
    const overAllowance = !!owner && owner.videoAllowance != null && owner.videosUsedThisCycle >= owner.videoAllowance

    if (owner?.status === 'active' && overAllowance) {
      // Became active while already tapped out for the cycle (e.g. paid,
      // then used up the allowance with a different generation before this
      // one's payment caught up) — fail it plainly rather than submitting
      // past the plan's limit.
      const { prompt } = seedancePipeline.pendingSubmission
      seedancePipeline = {
        ...seedancePipeline,
        status: 'failed',
        pendingSubmission: undefined,
        attempts: [{ attempt: 1, status: 'failed', prompt, error: `You've used all ${owner.videoAllowance} videos in your current billing cycle.` }],
      }
    } else if (owner?.status === 'active') {
      const { prompt, referenceImageUrls, durationSeconds } = seedancePipeline.pendingSubmission
      const submitResult = await submitShot({ prompt, referenceImageUrls, durationSeconds })
      if ('error' in submitResult) {
        seedancePipeline = {
          ...seedancePipeline,
          status: 'failed',
          pendingSubmission: undefined,
          attempts: [{ attempt: 1, status: 'failed', prompt, error: submitResult.error }],
        }
      } else {
        seedancePipeline = {
          ...seedancePipeline,
          status: 'generating',
          pendingSubmission: undefined,
          attempts: [{ attempt: 1, status: 'queued', taskId: submitResult.taskId, prompt }],
        }
      }
    }
  }

  if (seedancePipeline && seedancePipeline.status !== 'completed' && seedancePipeline.status !== 'failed' && seedancePipeline.status !== 'awaiting_payment') {
    const attempts = [...seedancePipeline.attempts]
    const current = attempts[attempts.length - 1]
    const targetDuration = session.scripts?.[0]?.estimatedDurationSeconds ?? 20

    if (current && (current.status === 'queued' || current.status === 'processing') && current.taskId) {
      const result = await pollShot(current.taskId)
      let videoUrl = result.videoUrl

      // Seedance's video_url is a presigned link that expires in ~24h —
      // rehost it under our own /videos the moment it completes so the
      // render stays viewable/downloadable indefinitely, not just for a day.
      if (result.status === 'completed' && videoUrl) {
        try {
          videoUrl = await saveVideoFromUrl(videoUrl)
        } catch {
          // Fall back to the remote URL rather than losing the completed
          // render outright — it'll still work until it expires.
        }
      }

      attempts[attempts.length - 1] = {
        ...current,
        status: result.status,
        videoUrl,
        seed: result.seed,
        error: result.error,
      }
    }

    const latest = attempts[attempts.length - 1]

    async function retryOrFail(reason: string) {
      if (attempts.length <= seedancePipeline!.maxRetries) {
        const retry = await submitShot({
          prompt: latest.prompt,
          referenceImageUrls: seedancePipeline!.characterSheet.referenceImageUrls,
          durationSeconds: targetDuration,
        })
        if ('error' in retry) {
          seedancePipeline = { ...seedancePipeline!, status: 'failed', attempts }
        } else {
          attempts.push({ attempt: latest.attempt + 1, status: 'queued', taskId: retry.taskId, prompt: latest.prompt })
          seedancePipeline = { ...seedancePipeline!, status: 'generating', attempts }
        }
      } else {
        seedancePipeline = { ...seedancePipeline!, status: 'failed', attempts, finalVideoUrl: undefined }
        void reason
      }
    }

    if (latest?.status === 'completed' && latest.videoUrl && !latest.qualityGate) {
      const gate = await runQualityGate(latest.videoUrl, {
        description: session.brief?.offer || '',
        hookLine: session.scripts?.[0]?.hookLine || '',
      })
      attempts[attempts.length - 1] = { ...latest, qualityGate: gate }

      if (gate.pass) {
        seedancePipeline = { ...seedancePipeline, status: 'completed', attempts, finalVideoUrl: latest.videoUrl }
        // Counted here, not at submission — a render that ultimately fails
        // after retries shouldn't cost the client a video from their
        // allowance, only one that actually finishes successfully does.
        if (session.userId) incrementVideosUsed(session.userId)
      } else {
        await retryOrFail(gate.reason || 'Quality gate failed')
      }
    } else if (latest?.status === 'failed') {
      await retryOrFail(latest.error || 'Generation failed')
    } else {
      seedancePipeline = { ...seedancePipeline, attempts }
    }

    // Keep `renders[0]` in sync so the output page's existing status branches work
    // without needing to know about the Seedance pipeline specifically.
    const scriptId = session.scripts?.[0]?.id
    if (scriptId) {
      const finalStatus = seedancePipeline.status === 'completed' ? 'completed'
        : seedancePipeline.status === 'failed' ? 'failed'
        : 'queued'
      updatedRenders = updatedRenders.map(r =>
        r.scriptId === scriptId ? { ...r, status: finalStatus, videoUrl: seedancePipeline!.finalVideoUrl } : r
      )
    }
  }

  const updated = updateSession(sessionId, {
    renders: updatedRenders,
    ...(pipeline ? { pipeline } : {}),
    ...(seedancePipeline ? { seedancePipeline } : {}),
  })
  return NextResponse.json(updated)
}
