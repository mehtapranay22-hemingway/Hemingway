import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { startCheckout } from '@/lib/billing'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const body = await req.json().catch(() => null)
  const plan = typeof body?.plan === 'string' ? body.plan : null
  if (!plan) return NextResponse.json({ error: 'plan is required' }, { status: 400 })
  const returnPath = typeof body?.returnPath === 'string' ? body.returnPath : undefined

  const result = await startCheckout(user.id, plan, returnPath)
  if ('error' in result) return NextResponse.json(result, { status: 503 })
  return NextResponse.json(result)
}
