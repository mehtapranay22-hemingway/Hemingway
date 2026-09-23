import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads')
const VIDEO_DIR = path.join(process.cwd(), 'public', 'videos')

const MEDIA_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

// Saves an ad-hoc base64 image (e.g. a product photo attached to a brief) as
// a servable file and returns its relative public URL. Used so it can be
// passed to Seedance as a real reference image, not just Claude script
// context — without this, generated cutaways show a hallucinated product
// instead of the one the user actually uploaded.
export function saveTemporaryImage(imageBase64: string, imageMediaType: string): string {
  const ext = MEDIA_EXT[imageMediaType] || 'jpg'
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  fs.mkdirSync(UPLOAD_DIR, { recursive: true })
  fs.writeFileSync(path.join(UPLOAD_DIR, `${id}.${ext}`), Buffer.from(imageBase64, 'base64'))
  return `/uploads/${id}.${ext}`
}

const EXT_TO_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

// Reads a file already saved under public/ (avatar photos, uploaded product
// photos) and returns it as a data: URI. Local dev/localhost URLs for these
// files are only reachable from this machine — Seedance's cloud API can't
// fetch them at all (confirmed live: it returns a generic "invalid image
// format" error, which is really "couldn't fetch this URL"). A data URI
// embeds the bytes directly in the request, so no public hosting is needed.
export function publicPathToDataUri(relativePublicPath: string): string {
  const filePath = path.join(process.cwd(), 'public', relativePublicPath.replace(/^\/+/, ''))
  const buffer = fs.readFileSync(filePath)
  const ext = path.extname(filePath).slice(1).toLowerCase()
  const mime = EXT_TO_MIME[ext] || 'image/png'
  return `data:${mime};base64,${buffer.toString('base64')}`
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
  const res = await fetch(remoteUrl)
  if (!res.ok) throw new Error(`Failed to fetch video (${res.status})`)
  const buffer = Buffer.from(await res.arrayBuffer())
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  fs.mkdirSync(VIDEO_DIR, { recursive: true })
  fs.writeFileSync(path.join(VIDEO_DIR, `${id}.mp4`), buffer)
  return `/videos/${id}.mp4`
}
