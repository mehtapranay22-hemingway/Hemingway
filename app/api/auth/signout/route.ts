import { NextRequest, NextResponse } from 'next/server'
import { clearSession } from '@/lib/auth'

export async function POST(req: NextRequest) {
  const res = NextResponse.json({ ok: true })
  return clearSession(req, res)
}
