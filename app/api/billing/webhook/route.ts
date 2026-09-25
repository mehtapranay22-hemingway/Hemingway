import { NextRequest, NextResponse } from 'next/server'
import { handleWebhookEvent } from '@/lib/billing'

// No auth check here on purpose — providers call this directly, not through
// a logged-in browser session. Trust comes from signature verification
// inside handleWebhookEvent() once a real provider is wired in, not cookies.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  // Paddle signs with Paddle-Signature ("ts=...;h1=...") and carries the
  // event type in the body itself (event_type), unlike Lemon Squeezy which
  // split it across a header and the body's meta.
  const signature = req.headers.get('paddle-signature')

  const result = await handleWebhookEvent(rawBody, signature)
  if (!result.handled) return NextResponse.json({ error: result.error }, { status: 503 })
  return NextResponse.json({ ok: true })
}
