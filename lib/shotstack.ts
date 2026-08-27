const BASE = process.env.SHOTSTACK_ENV === 'production'
  ? 'https://api.shotstack.io/v1'
  : 'https://api.shotstack.io/stage/v1'

function headers() {
  return { 'x-api-key': process.env.SHOTSTACK_API_KEY || '', 'Content-Type': 'application/json' }
}

export async function composeVideo(avatarUrl: string, brollUrls: string[]): Promise<string> {
  const clips: object[] = []
  let time = 0

  // Opening B-roll (5s)
  if (brollUrls[0]) {
    clips.push({ asset: { type: 'video', src: brollUrls[0] }, start: 0, length: 5, transition: { in: 'fade', out: 'fade' } })
    time = 5
  }

  // Avatar — estimate 20s; Shotstack will trim/extend to actual duration
  clips.push({ asset: { type: 'video', src: avatarUrl }, start: time, length: 20, transition: { in: 'fade' } })
  time += 20

  // Remaining B-roll (5s each)
  for (let i = 1; i < brollUrls.length; i++) {
    clips.push({ asset: { type: 'video', src: brollUrls[i] }, start: time, length: 5, transition: { in: 'fade', out: 'fade' } })
    time += 5
  }

  const body = {
    timeline: { tracks: [{ clips }] },
    output: { format: 'mp4', resolution: 'hd', aspectRatio: '9:16', fps: 30 },
  }

  const res = await fetch(`${BASE}/render`, { method: 'POST', headers: headers(), body: JSON.stringify(body) })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error((err as { error?: string }).error || `Shotstack error ${res.status}`)
  }
  const data = await res.json()
  const renderId = data.response?.id
  if (!renderId) throw new Error('No render id from Shotstack')
  return renderId
}

export async function pollCompose(renderId: string): Promise<{
  status: 'processing' | 'completed' | 'failed'
  url?: string
}> {
  try {
    const res = await fetch(`${BASE}/render/${renderId}`, { headers: headers() })
    if (!res.ok) return { status: 'processing' }
    const data = await res.json()
    const status = data.response?.status
    if (status === 'done') return { status: 'completed', url: data.response?.url }
    if (status === 'failed') return { status: 'failed' }
    return { status: 'processing' }
  } catch {
    return { status: 'processing' }
  }
}

export function shotstackConfigured(): boolean {
  return !!process.env.SHOTSTACK_API_KEY
}
