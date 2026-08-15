import { NextResponse } from 'next/server'
import { fetchVoices } from '@/lib/heygen'

export async function GET() {
  if (!process.env.HEYGEN_API_KEY) {
    return NextResponse.json({ error: 'HEYGEN_API_KEY not configured' }, { status: 503 })
  }
  const voices = await fetchVoices()
  return NextResponse.json({ voices })
}
