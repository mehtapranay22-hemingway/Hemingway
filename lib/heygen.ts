import type { HeyGenAvatar, HeyGenVoice } from './types'

const BASE = 'https://api.heygen.com'
const KEY = process.env.HEYGEN_API_KEY

function headers() {
  return { 'X-Api-Key': KEY || '', 'Content-Type': 'application/json' }
}

export async function fetchAvatars(): Promise<HeyGenAvatar[]> {
  if (!KEY) return []
  try {
    const res = await fetch(`${BASE}/v2/avatars`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json()
    return (data.data?.avatars || []) as HeyGenAvatar[]
  } catch {
    return []
  }
}

export async function fetchVoices(): Promise<HeyGenVoice[]> {
  if (!KEY) return []
  try {
    const res = await fetch(`${BASE}/v2/voices`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json()
    const voices: HeyGenVoice[] = data.data?.voices || []
    // Return first 8 English voices
    return voices.filter(v => v.language?.toLowerCase().includes('english')).slice(0, 8)
  } catch {
    return []
  }
}

export async function startRender(
  avatarId: string,
  voiceId: string,
  scriptText: string
): Promise<{ videoId: string }> {
  if (!KEY) throw new Error('HEYGEN_API_KEY is not configured')

  const res = await fetch(`${BASE}/v2/video/generate`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: 'avatar', avatar_id: avatarId, avatar_style: 'normal' },
          voice: { type: 'text', input_text: scriptText, voice_id: voiceId },
        },
      ],
      dimension: { width: 720, height: 1280 },
      title: 'Hemingway Engine',
    }),
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    const msg = (err as { message?: string }).message
    throw new Error(msg || `HeyGen error ${res.status}`)
  }

  const data = await res.json()
  const videoId = data.data?.video_id
  if (!videoId) throw new Error('No video_id in HeyGen response')
  return { videoId }
}

export async function pollRender(videoId: string): Promise<{
  status: 'processing' | 'completed' | 'failed'
  videoUrl?: string
}> {
  if (!KEY) return { status: 'processing' }

  const res = await fetch(`${BASE}/v1/video_status.get?video_id=${videoId}`, {
    headers: headers(),
  })

  if (!res.ok) return { status: 'processing' }

  const data = await res.json()
  const status = data.data?.status
  const videoUrl = data.data?.video_url

  if (status === 'completed' && videoUrl) return { status: 'completed', videoUrl }
  if (status === 'failed') return { status: 'failed' }
  return { status: 'processing' }
}
