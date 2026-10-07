import { put } from '@vercel/blob'
import { randomUUID } from 'crypto'

// Vercel Blob now, not public/uploads or public/videos on local disk —
// those don't survive Vercel's ephemeral, per-invocation filesystem, and
// Blob URLs are real public https:// links Seedance's cloud can fetch
// directly (see the note on publicPathToDataUri below — that whole
// workaround is gone now that files aren't local-only).

const MEDIA_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Saves an ad-hoc base64 image (e.g. a product photo attached to a brief) as
// a servable file and returns its public URL. Used so it can be passed to
// Seedance as a real reference image, not just Claude script context —
// without this, generated cutaways show a hallucinated product instead of
// the one the user actually uploaded.
export async function saveTemporaryImage(imageBase64: string, imageMediaType: string): Promise<string> {
  const ext = MEDIA_EXT[imageMediaType] || 'jpg'
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  const blob = await put(`uploads/${id}.${ext}`, Buffer.from(imageBase64, 'base64'), {
    access: 'public',
    contentType: imageMediaType,
  })
  return blob.url
}

// Seedance (via BytePlus Ark/TOS) hands back a presigned video_url that
// expires ~24h after generation (X-Tos-Expires=86400 in the URL itself,
// confirmed live) — re-polling the same task later returns the identical,
// still-expired signature, it doesn't reissue a fresh one. If we store that
// raw URL as the session's permanent videoUrl, a finished ad silently stops
// being viewable/downloadable a day later with nothing in our own state
// having changed. Downloading the bytes once, right at completion, and
// serving them from our own storage makes "completed" actually mean
// permanently available.
export async function saveVideoFromUrl(remoteUrl: string): Promise<string> {
  // One retry — this fetch is against a third-party CDN (BytePlus TOS) at
  // the exact moment it just finished writing the file, and the only
  // alternative to retrying is losing an already-paid-for render to a
  // transient network blip. Real failures (bad URL, Blob auth/quota issue)
  // still surface after the second attempt.
  let lastErr: unknown
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      const res = await fetch(remoteUrl)
      if (!res.ok) throw new Error(`Failed to fetch video (${res.status})`)
      const buffer = Buffer.from(await res.arrayBuffer())
      const id = randomUUID().replace(/-/g, '').slice(0, 12)
      const blob = await put(`videos/${id}.mp4`, buffer, {
        access: 'public',
        contentType: 'video/mp4',
      })
      return blob.url
    } catch (err) {
      lastErr = err
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error('Failed to rehost video after 2 attempts')
}
