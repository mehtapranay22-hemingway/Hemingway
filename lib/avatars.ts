import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { HeyGenAvatar } from './types'

const INDEX_FILE = path.join(process.cwd(), 'data', 'custom-avatars.json')
const AVATAR_DIR = path.join(process.cwd(), 'public', 'avatars')

export type CustomAvatar = {
  id: string
  userId: string
  name: string
  imageUrl: string // relative public path, e.g. /avatars/<id>.png — the cover photo shown on the picker
  extraImageUrls?: string[] // additional angles fed to Seedance for identity-lock; never shown on the picker grid
  gender?: string
  uploadedAt: string
}

const MEDIA_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
}

function readIndex(): CustomAvatar[] {
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'))
  } catch {
    return []
  }
}

function writeIndex(avatars: CustomAvatar[]): void {
  fs.mkdirSync(path.dirname(INDEX_FILE), { recursive: true })
  fs.writeFileSync(INDEX_FILE, JSON.stringify(avatars, null, 2))
}

// Every list/get/save/delete below is scoped to a userId — different
// accounts' avatar rosters are genuinely separate, not just visually so.

export function listCustomAvatars(userId: string): CustomAvatar[] {
  return readIndex().filter(a => a.userId === userId)
}

export function getCustomAvatarById(userId: string, id: string): CustomAvatar | null {
  return readIndex().find(a => a.userId === userId && a.id === id) ?? null
}

export function saveCustomAvatar(params: {
  userId: string
  name: string
  gender?: string
  imageBase64: string
  imageMediaType: string
}): CustomAvatar {
  const ext = MEDIA_EXT[params.imageMediaType] || 'png'
  const id = randomUUID().replace(/-/g, '').slice(0, 12)

  fs.mkdirSync(AVATAR_DIR, { recursive: true })
  fs.writeFileSync(path.join(AVATAR_DIR, `${id}.${ext}`), Buffer.from(params.imageBase64, 'base64'))

  const avatar: CustomAvatar = {
    id,
    userId: params.userId,
    name: params.name,
    imageUrl: `/avatars/${id}.${ext}`,
    gender: params.gender,
    uploadedAt: new Date().toISOString(),
  }
  const all = readIndex()
  all.push(avatar)
  writeIndex(all)
  return avatar
}

// Adds an extra angle reference to an existing avatar — used for Seedance
// identity-lock only, never surfaced as its own card on the picker.
export function addAvatarReference(userId: string, id: string, imageBase64: string, imageMediaType: string): CustomAvatar | null {
  const all = readIndex()
  const idx = all.findIndex(a => a.userId === userId && a.id === id)
  if (idx === -1) return null

  const ext = MEDIA_EXT[imageMediaType] || 'png'
  const refId = randomUUID().replace(/-/g, '').slice(0, 12)
  fs.mkdirSync(AVATAR_DIR, { recursive: true })
  fs.writeFileSync(path.join(AVATAR_DIR, `${refId}.${ext}`), Buffer.from(imageBase64, 'base64'))

  const extras = all[idx].extraImageUrls ?? []
  all[idx] = { ...all[idx], extraImageUrls: [...extras, `/avatars/${refId}.${ext}`] }
  writeIndex(all)
  return all[idx]
}

export function updateCustomAvatar(userId: string, id: string, updates: { name?: string; gender?: string }): CustomAvatar | null {
  const all = readIndex()
  const idx = all.findIndex(a => a.userId === userId && a.id === id)
  if (idx === -1) return null
  all[idx] = { ...all[idx], ...updates }
  writeIndex(all)
  return all[idx]
}

export function deleteCustomAvatar(userId: string, id: string): boolean {
  const all = readIndex()
  const target = all.find(a => a.userId === userId && a.id === id)
  if (!target) return false
  try {
    fs.unlinkSync(path.join(process.cwd(), 'public', target.imageUrl))
  } catch {}
  writeIndex(all.filter(a => !(a.userId === userId && a.id === id)))
  return true
}

// Avatar listing for the /pick picker — the current user's uploads only.
export async function listAvatarsForPicker(userId: string): Promise<HeyGenAvatar[]> {
  return listCustomAvatars(userId).map(a => ({
    avatar_id: a.id,
    avatar_name: a.name,
    preview_image_url: a.imageUrl,
    gender: a.gender,
  }))
}

// Resolve an avatar's full reference set (cover photo + any extra angles) by
// id for the Seedance character sheet — scoped to the current user.
export async function resolveAvatarImage(userId: string, avatarId: string): Promise<{ imageUrls: string[]; name: string } | null> {
  const custom = getCustomAvatarById(userId, avatarId)
  if (!custom) return null
  return { imageUrls: [custom.imageUrl, ...(custom.extraImageUrls ?? [])], name: custom.name }
}
