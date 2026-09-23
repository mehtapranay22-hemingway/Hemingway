import { NextRequest, NextResponse } from 'next/server'
import { addAvatarReference } from '@/lib/avatars'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const { id, imageBase64, imageMediaType } = body || {}

  if (!id || typeof id !== 'string') {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }
  if (!imageBase64 || typeof imageBase64 !== 'string') {
    return NextResponse.json({ error: 'imageBase64 is required' }, { status: 400 })
  }

  const avatar = addAvatarReference(user.id, id, imageBase64, imageMediaType || 'image/png')
  if (!avatar) return NextResponse.json({ error: 'Avatar not found' }, { status: 404 })
  return NextResponse.json({ avatar })
}
