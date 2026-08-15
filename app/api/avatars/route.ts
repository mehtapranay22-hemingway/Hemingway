import { NextResponse } from 'next/server'
import { fetchAvatars } from '@/lib/heygen'

export async function GET() {
  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 503 })
  }
  const avatars = await fetchAvatars()
  return NextResponse.json({ avatars })
}
