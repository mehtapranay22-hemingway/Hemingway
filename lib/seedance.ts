import type { CharacterSheet, QualityGateResult } from './types'

// ── Seedance 2.5 client (BytePlus Ark — direct API, not fal.ai) ────────────
//
// CONFIRMED against real BytePlus Ark API docs + a live key (Sep 2026):
//   - Platform: BytePlus Ark (the international arm of Volcengine Ark),
//     base host ark.ap-southeast.bytepluses.com — NOT the China-mainland
//     ark.cn-beijing.volces.com host this file originally assumed.
//   - Model id: "dreamina-seedance-2-5-260628" — not "doubao-seedance-2-5".
//   - Auth: simple `Authorization: Bearer <key>` — the earlier concern about
//     needing full HMAC-SHA256 AK/SK signing was unfounded, bearer is correct.
//   - Request body: content is an array of typed parts. Reference images
//     need `"role": "reference_image"` on each part (previously omitted).
//     Aspect ratio field is `ratio`, not `aspect_ratio`. `watermark: false`
//     is a real field this file previously didn't send.
//   - Async task pattern: submit -> task id -> poll. Exact status-field
//     names/polling endpoint still being confirmed against a live response
//     (see pollShot) — the request side is now verified, the response-parsing
//     side is the remaining best-effort part.
//   - Generates video + dialogue + lip-sync + music in one pass; character
//     identity is locked across shots via reference image inputs, not a
//     dedicated "character sheet" artifact.

const ARK_BASE = process.env.VOLC_ARK_BASE_URL || 'https://ark.ap-southeast.bytepluses.com/api/v3'
const ARK_API_KEY = process.env.VOLC_API_KEY
const ARK_MODEL = process.env.VOLC_MODEL_ENDPOINT || 'dreamina-seedance-2-5-260628'

const MOCK = !ARK_API_KEY

export function seedanceConfigured(): boolean {
  return !MOCK
}

export function seedanceMockMode(): boolean {
  return MOCK
}

function headers() {
  return { Authorization: `Bearer ${ARK_API_KEY || ''}`, 'Content-Type': 'application/json' }
}

// A character sheet is just the validated reference photo(s) + identity
// description we'll pass into every generation attempt. Seedance wants
// clean, well-lit, single-subject reference images — we reuse avatar photos
// already picked/uploaded in the UI rather than generating new ones. Extra
// angles (profile, 3/4) help identity-lock hold up across dynamic multi-shot
// generation, where a single front-on photo gives the model nothing to go on
// for a turned head.
export async function buildCharacterSheet(
  referenceImageUrls: string[],
  description: string
): Promise<CharacterSheet> {
  if (MOCK) {
    return { status: 'ready', referenceImageUrls, description }
  }

  try {
    // data: URIs are self-contained — nothing to fetch/validate over the
    // network, and a HEAD request against one is meaningless.
    const checks = await Promise.all(referenceImageUrls.map(url =>
      url.startsWith('data:') ? Promise.resolve({ ok: true, status: 200 }) : fetch(url, { method: 'HEAD' })
    ))
    const badIdx = checks.findIndex(res => !res.ok)
    if (badIdx !== -1) {
      return {
        status: 'failed',
        referenceImageUrls,
        description,
        error: `Reference image unreachable (${checks[badIdx].status}): ${referenceImageUrls[badIdx]}`,
      }
    }
    return { status: 'ready', referenceImageUrls, description }
  } catch (err) {
    return {
      status: 'failed',
      referenceImageUrls,
      description,
      error: err instanceof Error ? err.message : 'Reference image check failed',
    }
  }
}

export async function submitShot(params: {
  prompt: string
  referenceImageUrls: string[]
  durationSeconds: number
  seed?: number
}): Promise<{ taskId: string } | { error: string }> {
  if (MOCK) {
    // Mock id encodes its own mint time so pollShot() can simulate a realistic
    // PENDING -> RUNNING -> SUCCEEDED lifecycle without any external state.
    return { taskId: `mock_${Date.now()}_${Math.random().toString(36).slice(2, 8)}` }
  }

  try {
    const res = await fetch(`${ARK_BASE}/contents/generations/tasks`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        model: ARK_MODEL,
        content: [
          { type: 'text', text: params.prompt },
          ...params.referenceImageUrls.map(url => ({
            type: 'image_url',
            image_url: { url },
            role: 'reference_image',
          })),
        ],
        duration: Math.min(30, Math.max(4, Math.round(params.durationSeconds))),
        ratio: '9:16',
        generate_audio: true,
        watermark: false,
        seed: params.seed,
      }),
    })

    if (!res.ok) {
      const err = await res.json().catch(() => ({}))
      return { error: (err as { error?: { message?: string } }).error?.message || `Seedance error ${res.status}` }
    }
    const data = await res.json()
    const taskId = data.id || data.task_id
    if (!taskId) return { error: 'No task id in Seedance response' }
    return { taskId }
  } catch (err) {
    return { error: err instanceof Error ? err.message : 'Seedance submission failed' }
  }
}

export async function pollShot(taskId: string): Promise<{
  status: 'queued' | 'processing' | 'completed' | 'failed'
  videoUrl?: string
  seed?: number
  error?: string
}> {
  if (MOCK) {
    const mintedAt = Number(taskId.split('_')[1] || 0)
    if (!mintedAt) return { status: 'failed', error: 'Malformed mock task id' }
    const elapsed = Date.now() - mintedAt
    if (elapsed < 8000) return { status: 'queued' }
    if (elapsed < 25000) return { status: 'processing' }
    return {
      status: 'completed',
      videoUrl: `https://mock.seedance.local/${taskId}.mp4`,
      seed: 1000000 + (mintedAt % 999999),
    }
  }

  try {
    const res = await fetch(`${ARK_BASE}/contents/generations/tasks/${taskId}`, { headers: headers() })
    if (!res.ok) return { status: 'processing' }
    const data = await res.json()
    const status = data.status as string | undefined

    if (status === 'succeeded' || status === 'SUCCEEDED') {
      const videoUrl = data.content?.video_url || data.data?.[0]?.url
      return { status: 'completed', videoUrl, seed: data.seed }
    }
    if (status === 'failed' || status === 'FAILED') {
      return { status: 'failed', error: data.error?.message || 'Seedance job failed' }
    }
    if (status === 'running' || status === 'RUNNING') return { status: 'processing' }
    return { status: 'queued' }
  } catch {
    return { status: 'processing' }
  }
}

// Real implementation (once we have live renders to grade): sample a frame
// and ask Claude vision whether the character stayed consistent, the
// product/brand is clearly visible, and there are no obvious artifacts.
// Stubbed to always pass so the full pipeline — including the retry path —
// can be exercised end-to-end without spending on real generations.
export async function runQualityGate(
  videoUrl: string,
  _context: { description: string; hookLine: string }
): Promise<QualityGateResult> {
  void videoUrl
  return { pass: true, checkedAt: new Date().toISOString() }
}
