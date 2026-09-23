import { put, del } from '@vercel/blob'
import { randomUUID } from 'crypto'
import { getSql } from './neon'
import type { HeyGenAvatar } from './types'

// Postgres (metadata) + Vercel Blob (image files) — not a local
// custom-avatars.json + public/avatars, which don't survive Vercel's
// ephemeral, per-invocation filesystem.

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS avatars (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          name TEXT NOT NULL,
          image_url TEXT NOT NULL,
          extra_image_urls JSONB,
          gender TEXT,
          uploaded_at TEXT NOT NULL
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS avatars_user_idx ON avatars(user_id)`
    })()
  }
  return schemaReady
}

export type CustomAvatar = {
  id: string
  userId: string
  name: string
  imageUrl: string // real https:// Blob URL — the cover photo shown on the picker
  extraImageUrls?: string[] // additional angles fed to Seedance for identity-lock; never shown on the picker grid
  gender?: string
  uploadedAt: string
}

type AvatarRow = {
  id: string
  user_id: string
  name: string
  image_url: string
  extra_image_urls: unknown
  gender: string | null
  uploaded_at: string
}

function parseExtraUrls(raw: unknown): string[] | undefined {
  if (!raw) return undefined
  const arr = typeof raw === 'string' ? JSON.parse(raw) : raw
  return Array.isArray(arr) && arr.length > 0 ? arr : undefined
}

function rowToAvatar(row: AvatarRow): CustomAvatar {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    imageUrl: row.image_url,
    extraImageUrls: parseExtraUrls(row.extra_image_urls),
    gender: row.gender ?? undefined,
    uploadedAt: row.uploaded_at,
  }
}

const MEDIA_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

// Every list/get/save/delete below is scoped to a userId — different
// accounts' avatar rosters are genuinely separate, not just visually so.

export async function listCustomAvatars(userId: string): Promise<CustomAvatar[]> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM avatars WHERE user_id = ${userId} ORDER BY uploaded_at DESC`) as AvatarRow[]
  return rows.map(rowToAvatar)
}

export async function getCustomAvatarById(userId: string, id: string): Promise<CustomAvatar | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM avatars WHERE user_id = ${userId} AND id = ${id}`) as AvatarRow[]
  return rows[0] ? rowToAvatar(rows[0]) : null
}

export async function saveCustomAvatar(params: {
  userId: string
  name: string
  gender?: string
  imageBase64: string
  imageMediaType: string
}): Promise<CustomAvatar> {
  await ensureSchema()
  const sql = getSql()
  const ext = MEDIA_EXT[params.imageMediaType] || 'png'
  const id = randomUUID().replace(/-/g, '').slice(0, 12)

  const blob = await put(`avatars/${id}.${ext}`, Buffer.from(params.imageBase64, 'base64'), {
    access: 'public',
    contentType: params.imageMediaType,
  })

  const avatar: CustomAvatar = {
    id,
    userId: params.userId,
    name: params.name,
    imageUrl: blob.url,
    gender: params.gender,
    uploadedAt: new Date().toISOString(),
  }
  await sql`
    INSERT INTO avatars (id, user_id, name, image_url, gender, uploaded_at)
    VALUES (${avatar.id}, ${avatar.userId}, ${avatar.name}, ${avatar.imageUrl}, ${avatar.gender ?? null}, ${avatar.uploadedAt})
  `
  return avatar
}

// Adds an extra angle reference to an existing avatar — used for Seedance
// identity-lock only, never surfaced as its own card on the picker.
export async function addAvatarReference(
  userId: string,
  id: string,
  imageBase64: string,
  imageMediaType: string
): Promise<CustomAvatar | null> {
  await ensureSchema()
  const sql = getSql()
  const existing = await getCustomAvatarById(userId, id)
  if (!existing) return null

  const ext = MEDIA_EXT[imageMediaType] || 'png'
  const refId = randomUUID().replace(/-/g, '').slice(0, 12)
  const blob = await put(`avatars/${refId}.${ext}`, Buffer.from(imageBase64, 'base64'), {
    access: 'public',
    contentType: imageMediaType,
  })

  const extras = [...(existing.extraImageUrls ?? []), blob.url]
  await sql`UPDATE avatars SET extra_image_urls = ${JSON.stringify(extras)}::jsonb WHERE user_id = ${userId} AND id = ${id}`
  return { ...existing, extraImageUrls: extras }
}

export async function updateCustomAvatar(
  userId: string,
  id: string,
  updates: { name?: string; gender?: string }
): Promise<CustomAvatar | null> {
  await ensureSchema()
  const sql = getSql()
  const existing = await getCustomAvatarById(userId, id)
  if (!existing) return null

  const next = { ...existing, ...updates }
  await sql`
    UPDATE avatars SET name = ${next.name}, gender = ${next.gender ?? null}
    WHERE user_id = ${userId} AND id = ${id}
  `
  return next
}

export async function deleteCustomAvatar(userId: string, id: string): Promise<boolean> {
  await ensureSchema()
  const sql = getSql()
  const target = await getCustomAvatarById(userId, id)
  if (!target) return false

  const urls = [target.imageUrl, ...(target.extraImageUrls ?? [])]
  await Promise.allSettled(urls.map(url => del(url)))

  await sql`DELETE FROM avatars WHERE user_id = ${userId} AND id = ${id}`
  return true
}

// Avatar listing for the /pick picker — the current user's uploads only.
export async function listAvatarsForPicker(userId: string): Promise<HeyGenAvatar[]> {
  const avatars = await listCustomAvatars(userId)
  return avatars.map(a => ({
    avatar_id: a.id,
    avatar_name: a.name,
    preview_image_url: a.imageUrl,
    gender: a.gender,
  }))
}

// Resolve an avatar's full reference set (cover photo + any extra angles) by
// id for the Seedance character sheet — scoped to the current user.
export async function resolveAvatarImage(userId: string, avatarId: string): Promise<{ imageUrls: string[]; name: string } | null> {
  const custom = await getCustomAvatarById(userId, avatarId)
  if (!custom) return null
  return { imageUrls: [custom.imageUrl, ...(custom.extraImageUrls ?? [])], name: custom.name }
}
