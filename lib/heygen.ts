import fs from 'fs'
import path from 'path'
import type { HeyGenAvatar, HeyGenVoice } from './types'

const BASE = 'https://api.heygen.com'
const KEY = process.env.HEYGEN_API_KEY
const CACHE_TTL = 10 * 60 * 1000 // 10 minutes

const AVATAR_CACHE_FILE = path.join(process.cwd(), 'data', 'avatar-cache.json')
const VOICE_CACHE_FILE = path.join(process.cwd(), 'data', 'voice-cache.json')

function headers() {
  return { 'X-Api-Key': KEY || '', 'Content-Type': 'application/json' }
}

function readCache<T>(file: string): T[] | null {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (raw.expiresAt > Date.now()) return raw.data as T[]
  } catch {}
  return null
}

function writeCache<T>(file: string, data: T[]): void {
  try {
    fs.writeFileSync(file, JSON.stringify({ data, expiresAt: Date.now() + CACHE_TTL }))
  } catch {}
}

export async function fetchAvatars(): Promise<HeyGenAvatar[]> {
  if (!KEY) return []
  const cached = readCache<HeyGenAvatar>(AVATAR_CACHE_FILE)
  if (cached) return cached
  try {
    const res = await fetch(`${BASE}/v2/avatars`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json()
    const avatars = (data.data?.avatars || []) as HeyGenAvatar[]
    writeCache(AVATAR_CACHE_FILE, avatars)
    return avatars
  } catch {
    return []
  }
}

export async function fetchVoices(): Promise<HeyGenVoice[]> {
  if (!KEY) return []
  const cached = readCache<HeyGenVoice>(VOICE_CACHE_FILE)
  if (cached) return cached
  try {
    const res = await fetch(`${BASE}/v2/voices`, { headers: headers() })
    if (!res.ok) return []
    const data = await res.json()
    const voices: HeyGenVoice[] = data.data?.voices || []
    const filtered = voices.filter(v => v.language?.toLowerCase().includes('english')).slice(0, 8)
    writeCache(VOICE_CACHE_FILE, filtered)
    return filtered
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
      caption: true,
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
  duration?: number
}> {
  if (!KEY) return { status: 'processing' }

  const res = await fetch(`${BASE}/v1/video_status.get?video_id=${videoId}`, {
    headers: headers(),
  })

  if (!res.ok) return { status: 'processing' }

  const data = await res.json()
  const status = data.data?.status
  // Prefer the captioned render — falls back to the plain video if captions weren't generated.
  const videoUrl = data.data?.video_url_caption || data.data?.video_url
  const duration = data.data?.duration

  if (status === 'completed' && videoUrl) return { status: 'completed', videoUrl, duration }
  if (status === 'failed') return { status: 'failed' }
  return { status: 'processing' }
}
