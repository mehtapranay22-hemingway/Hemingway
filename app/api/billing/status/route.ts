import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { getBillingStatus, billingConfigured } from '@/lib/billing'

export async function GET(req: NextRequest) {
  const user = getCurrentUser(req)
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 })

  const subscription = await getBillingStatus(user.id)
  return NextResponse.json({ subscription, billingConfigured: billingConfigured() })
}
