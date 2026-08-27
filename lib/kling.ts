import type { BrollClip } from './types'

const BASE = 'https://api.klingai.com'

function headers() {
  return { Authorization: `Bearer ${process.env.KLING_API_KEY || ''}`, 'Content-Type': 'application/json' }
}

export async function startBrollClip(
  prompt: string,
  index: number,
  imageUrl?: string
): Promise<BrollClip> {
  const clipType = imageUrl ? 'i2v' : 't2v'
  const endpoint = imageUrl
    ? `${BASE}/v1/videos/image2video`
    : `${BASE}/v1/videos/text2video`

  const body = imageUrl
    ? { model_name: 'kling-v1', image: imageUrl, prompt, mode: 'std', duration: 5 }
    : { model_name: 'kling-v1', prompt, mode: 'std', duration: 5, aspect_ratio: '9:16' }

  try {
    const res = await fetch(endpoint, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
    if (!res.ok) throw new Error(`Kling ${res.status}`)
    const data = await res.json()
    const taskId = data.data?.task_id
    if (!taskId) throw new Error('No task_id from Kling')
    return { index, prompt, clipType, status: 'processing', taskId }
  } catch (err) {
    return { index, prompt, clipType, status: 'failed', error: err instanceof Error ? err.message : 'Failed' }
  }
}

export async function pollBrollClip(clip: BrollClip): Promise<BrollClip> {
  if (!clip.taskId) return clip
  const endpoint = clip.clipType === 'i2v'
    ? `${BASE}/v1/videos/image2video/${clip.taskId}`
    : `${BASE}/v1/videos/text2video/${clip.taskId}`

  try {
    const res = await fetch(endpoint, { headers: headers() })
    if (!res.ok) return clip
    const data = await res.json()
    const taskStatus = data.data?.task_status
    if (taskStatus === 'succeed') {
      const videoUrl = data.data?.task_result?.videos?.[0]?.url
      return { ...clip, status: 'completed', videoUrl }
    }
    if (taskStatus === 'failed') {
      return { ...clip, status: 'failed', error: data.data?.task_status_msg || 'Kling render failed' }
    }
    return clip // still processing
  } catch {
    return clip
  }
}

export function klingConfigured(): boolean {
  return !!process.env.KLING_API_KEY
}
