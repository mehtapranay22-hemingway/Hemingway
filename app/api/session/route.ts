import { NextResponse } from 'next/server'
import { createSession, getSession } from '@/lib/sessions'

export async function POST() {
  const session = await createSession()
  return NextResponse.json({ id: session.id })
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url)
  const id = searchParams.get('s')
  if (!id) return NextResponse.json({ error: 'Missing session id' }, { status: 400 })
  const session = await getSession(id)
  if (!session) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  return NextResponse.json(session)
}
