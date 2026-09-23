import { NextRequest, NextResponse } from 'next/server'
import { getSession } from '@/lib/sessions'
import { getCurrentUser } from '@/lib/auth'
import { recordKeptAd } from '@/lib/db'

// Fired when a client downloads a finished video — treated as an explicit
// "keep" signal for the lightweight ad-memory layer (see lib/db.ts). Silent
// no-ops for anonymous visitors or sessions they don't own; this is a
// best-effort background signal, not something the download itself should
// ever be blocked on.
export async function POST(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ ok: false })

  const body = await req.json().catch(() => null)
  const sessionId = body?.sessionId
  if (!sessionId) return NextResponse.json({ error: 'sessionId is required' }, { status: 400 })

  const session = getSession(sessionId)
  if (!session || session.userId !== user.id) {
    return NextResponse.json({ ok: false })
  }

  const script = session.scripts?.[0]
  if (!script) return NextResponse.json({ ok: false })

  // Cinematic-mode scripts always carry an empty cta (see quickgen route) —
  // that's the reliable way to tell the two modes apart after the fact.
  recordKeptAd({
    userId: user.id,
    sessionId: session.id,
    mode: script.cta ? 'dialogue' : 'cinematic',
    hookLine: script.hookLine,
    body: script.body,
    cta: script.cta || null,
  })

  return NextResponse.json({ ok: true })
}
