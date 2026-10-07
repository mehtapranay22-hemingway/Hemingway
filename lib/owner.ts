import 'server-only'
import type { User } from './db'
import { checkRateLimit } from './ratelimit'

// Owner exemption — lets the account owner generate sample/demo videos
// without the subscription/credit gate, while still paying the real
// BytePlus cost per render. Fails closed: no OWNER_EMAILS configured means
// nobody is exempt, not "everybody is."
//
// OWNER_EMAILS is intentionally server-only (no NEXT_PUBLIC_ prefix) — see
// the production-bundle check in the verification steps for this feature.

function ownerEmails(): string[] {
  return (process.env.OWNER_EMAILS || '')
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean)
}

// Email verification was removed from the app — this now just matches the
// signed-in account's email against OWNER_EMAILS. Email uniqueness at
// signup (lib/db.ts createUser) still means only one account can ever hold
// a given email at all.
export function isOwner(user: Pick<User, 'email'> | null): boolean {
  if (!user) return false
  const emails = ownerEmails()
  if (emails.length === 0) return false
  return emails.includes(user.email.toLowerCase())
}

const DEFAULT_DAILY_LIMIT = 10

function ownerDailyLimit(): number {
  const raw = Number(process.env.OWNER_DAILY_RENDER_LIMIT)
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_DAILY_LIMIT
}

// Keyed by the current UTC calendar date (not a rolling 24h window from
// first use) so "10 a day" means what it says — a fresh 10 at each UTC
// midnight, not 10-per-rolling-window.
export async function checkOwnerDailyLimit(userId: string): Promise<{ allowed: boolean }> {
  const utcDate = new Date().toISOString().slice(0, 10)
  const { allowed } = await checkRateLimit(`owner-render:${userId}:${utcDate}`, ownerDailyLimit(), 86400)
  return { allowed }
}

// USD per second of generated video, by resolution — update here if Ark's
// pricing changes. This pipeline currently sends no resolution parameter
// to Seedance at all (see lib/seedance.ts submitShot — fixed 9:16 ratio,
// nothing else configurable), so every render is logged against
// ASSUMED_RESOLUTION below rather than a real per-render value. Correct
// that constant (and wire a real value through if the pipeline ever adds
// resolution selection) rather than trusting this as measured fact.
export const RENDER_COST_PER_SECOND_USD: Record<'480p' | '720p' | '1080p', number> = {
  '480p': 0.10,
  '720p': 0.23,
  '1080p': 0.57,
}
export const ASSUMED_RESOLUTION: keyof typeof RENDER_COST_PER_SECOND_USD = '1080p'

export type RenderLogEntry = {
  timestamp: string
  userId: string | null
  isOwner: boolean
  resolution: string
  durationSeconds: number
  estimatedCostUsd: number
  purpose: 'customer' | 'owner_sample'
  status: 'submitted' | 'failed'
}

// No per-render cost table exists yet (see lib/sessions.ts / lib/db.ts —
// renders live in a JSONB blob, nothing tracks $ per render). Logs one
// JSON line per real Seedance submission instead, visible in Vercel's
// function logs. Recommended next step if you want this queryable instead
// of log-only: a small `render_cost_log` Postgres table (same `getSql()`
// pattern as everything else in lib/db.ts) — deliberately not added here
// since you asked not to add a database without asking first.
export function logRenderCost(params: {
  userId: string | null
  isOwner: boolean
  durationSeconds: number
  status: 'submitted' | 'failed'
}): void {
  const resolution = ASSUMED_RESOLUTION
  const entry: RenderLogEntry = {
    timestamp: new Date().toISOString(),
    userId: params.userId,
    isOwner: params.isOwner,
    resolution,
    durationSeconds: params.durationSeconds,
    estimatedCostUsd: Number((params.durationSeconds * RENDER_COST_PER_SECOND_USD[resolution]).toFixed(4)),
    purpose: params.isOwner ? 'owner_sample' : 'customer',
    status: params.status,
  }
  console.log('[render-cost]', JSON.stringify(entry))
}
