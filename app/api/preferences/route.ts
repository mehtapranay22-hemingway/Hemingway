import { NextRequest, NextResponse } from 'next/server'
import { getPreference, setPreference } from '@/lib/preferences'

export async function GET() {
  return NextResponse.json(getPreference() || {})
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null)
  if (!body?.avatarId || !body?.voiceId) {
    return NextResponse.json({ error: 'avatarId and voiceId required' }, { status: 400 })
  }
  setPreference({
    avatarId: body.avatarId,
    avatarName: body.avatarName || '',
    voiceId: body.voiceId,
    voiceName: body.voiceName || '',
  })
  return NextResponse.json({ ok: true })
}
