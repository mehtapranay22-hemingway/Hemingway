import { NextRequest, NextResponse } from 'next/server'
import { handleWebhookEvent } from '@/lib/billing'

// No auth check here on purpose — providers call this directly, not through
// a logged-in browser session. Trust comes from signature verification
// inside handleWebhookEvent() once a real provider is wired in, not cookies.
export async function POST(req: NextRequest) {
  const rawBody = await req.text()
  const signature = req.headers.get('x-signature')
  // Lemon Squeezy sends the event name both as a header and in the body's
  // meta.event_name — the header is authoritative here since it's cheap to
  // read before parsing, body meta.event_name is the fallback if it's ever
  // absent (see handleWebhookEvent in lib/billing.ts).
  const eventNameHeader = req.headers.get('x-event-name')

  const result = await handleWebhookEvent(rawBody, signature, eventNameHeader)
  if (!result.handled) return NextResponse.json({ error: result.error }, { status: 503 })
  return NextResponse.json({ ok: true })
}
