import { NextRequest, NextResponse } from 'next/server'
import { saveCustomAvatar, updateCustomAvatar, deleteCustomAvatar, listCustomAvatars } from '@/lib/avatars'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })
  return NextResponse.json({ avatars: listCustomAvatars(user.id) })
}

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { name, gender, imageBase64, imageMediaType } = body || {}

  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
  }

  const avatar = saveCustomAvatar({
    userId: user.id,
    name,
    gender: gender || undefined,
    imageBase64,
    imageMediaType: imageMediaType || 'image/png',
  })
  return NextResponse.json({ avatar })
}

export async function PATCH(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { id, name, gender } = body || {}
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const updates: { name?: string; gender?: string } = {}
  if (typeof name === 'string') updates.name = name
  if (typeof gender === 'string') updates.gender = gender

  const avatar = updateCustomAvatar(user.id, id, updates)
  if (!avatar) return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  return NextResponse.json({ avatar })
}

export async function DELETE(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const id = searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const ok = deleteCustomAvatar(user.id, id)
  if (!ok) return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
