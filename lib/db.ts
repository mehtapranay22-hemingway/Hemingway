import { randomUUID } from 'crypto'
import { getSql } from './neon'

// Postgres (Neon, via Vercel's Storage integration) for account-level data:
// users, auth sessions, client profiles, subscriptions, ad memory.
// Server-only — never import this from a 'use client' file.
//
// Every exported function here is async now (it wasn't when this ran on
// node:sqlite) — every call site needs `await`.

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS users (
          id TEXT PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          password_salt TEXT NOT NULL,
          created_at TEXT NOT NULL
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS auth_sessions (
          token TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS client_profile (
          user_id TEXT PRIMARY KEY,
          full_name TEXT NOT NULL,
          business_name TEXT NOT NULL,
          email TEXT NOT NULL,
          industry TEXT NOT NULL,
          company_size TEXT NOT NULL,
          feedback TEXT,
          created_at TEXT NOT NULL
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS subscriptions (
          user_id TEXT PRIMARY KEY,
          plan TEXT NOT NULL DEFAULT 'free',
          status TEXT NOT NULL DEFAULT 'none',
          provider TEXT,
          provider_customer_id TEXT,
          provider_subscription_id TEXT,
          current_period_end TEXT,
          video_allowance INTEGER,
          videos_used_this_cycle INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        )
      `
      await sql`
        CREATE TABLE IF NOT EXISTS ad_memory (
          id TEXT PRIMARY KEY,
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL UNIQUE,
          mode TEXT NOT NULL,
          hook_line TEXT NOT NULL,
          body TEXT NOT NULL,
          cta TEXT,
          created_at TEXT NOT NULL
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS ad_memory_user_idx ON ad_memory(user_id, created_at)`
    })()
  }
  return schemaReady
}

// ── Users ────────────────────────────────────────────────────────────────

export type User = {
  id: string
  email: string
  passwordHash: string
  passwordSalt: string
  createdAt: string
}

type UserRow = { id: string; email: string; password_hash: string; password_salt: string; created_at: string }

function rowToUser(row: UserRow): User {
  return { id: row.id, email: row.email, passwordHash: row.password_hash, passwordSalt: row.password_salt, createdAt: row.created_at }
}

export async function createUser(email: string, passwordHash: string, passwordSalt: string): Promise<User> {
  await ensureSchema()
  const sql = getSql()
  const id = randomUUID().replace(/-/g, '').slice(0, 16)
  const normalizedEmail = email.toLowerCase()
  const createdAt = new Date().toISOString()
  await sql`
    INSERT INTO users (id, email, password_hash, password_salt, created_at)
    VALUES (${id}, ${normalizedEmail}, ${passwordHash}, ${passwordSalt}, ${createdAt})
  `
  return { id, email: normalizedEmail, passwordHash, passwordSalt, createdAt }
}

export async function getUserByEmail(email: string): Promise<User | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM users WHERE email = ${email.toLowerCase()}`) as UserRow[]
  return rows[0] ? rowToUser(rows[0]) : null
}

export async function getUserById(id: string): Promise<User | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM users WHERE id = ${id}`) as UserRow[]
  return rows[0] ? rowToUser(rows[0]) : null
}

// ── Auth sessions (cookie-backed login sessions — distinct from the video
// generation "sessions" in lib/sessions.ts) ─────────────────────────────
//
// "Stay logged in" like a normal consumer app: a long-lived cookie (a year),
// renewed on a sliding window so anyone who visits at least once every ~11
// months never sees it expire.

const SESSION_TTL_DAYS = 365
const SESSION_REFRESH_AFTER_DAYS = 30 // renew once there's less than this left, not on every request

export async function createAuthSession(userId: string): Promise<{ token: string; expiresAt: string }> {
  await ensureSchema()
  const sql = getSql()
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await sql`
    INSERT INTO auth_sessions (token, user_id, created_at, expires_at)
    VALUES (${token}, ${userId}, ${createdAt.toISOString()}, ${expiresAt.toISOString()})
  `
  return { token, expiresAt: expiresAt.toISOString() }
}

// Pushes a still-valid session's expiry back out to a full year from now —
// called from getUserByToken whenever a session is getting close to expiring,
// so actual usage (not just time since login) is what keeps someone signed in.
async function renewAuthSession(token: string): Promise<string> {
  const sql = getSql()
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  await sql`UPDATE auth_sessions SET expires_at = ${expiresAt.toISOString()} WHERE token = ${token}`
  return expiresAt.toISOString()
}

export async function getUserByToken(token: string): Promise<User | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM auth_sessions WHERE token = ${token}`) as
    { token: string; user_id: string; expires_at: string }[]
  const row = rows[0]
  if (!row) return null

  const expiresAt = new Date(row.expires_at).getTime()
  if (expiresAt < Date.now()) {
    await deleteAuthSession(token)
    return null
  }
  if (expiresAt - Date.now() < SESSION_REFRESH_AFTER_DAYS * 24 * 60 * 60 * 1000) {
    await renewAuthSession(token)
  }
  return getUserById(row.user_id)
}

export async function deleteAuthSession(token: string): Promise<void> {
  const sql = getSql()
  await sql`DELETE FROM auth_sessions WHERE token = ${token}`
}

// ── Client profile (per-user onboarding data) ───────────────────────────

export type ClientProfile = {
  userId: string
  fullName: string
  businessName: string
  email: string
  industry: string
  companySize: string
  feedback: string | null
  createdAt: string
}

type ClientProfileRow = {
  user_id: string
  full_name: string
  business_name: string
  email: string
  industry: string
  company_size: string
  feedback: string | null
  created_at: string
}

function rowToProfile(row: ClientProfileRow): ClientProfile {
  return {
    userId: row.user_id,
    fullName: row.full_name,
    businessName: row.business_name,
    email: row.email,
    industry: row.industry,
    companySize: row.company_size,
    feedback: row.feedback,
    createdAt: row.created_at,
  }
}

export async function getClientProfile(userId: string): Promise<ClientProfile | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM client_profile WHERE user_id = ${userId}`) as ClientProfileRow[]
  return rows[0] ? rowToProfile(rows[0]) : null
}

export async function saveClientProfile(profile: {
  userId: string
  fullName: string
  businessName: string
  email: string
  industry: string
  companySize: string
  feedback: string | null
}): Promise<ClientProfile> {
  await ensureSchema()
  const sql = getSql()
  const createdAt = new Date().toISOString()
  await sql`
    INSERT INTO client_profile (user_id, full_name, business_name, email, industry, company_size, feedback, created_at)
    VALUES (${profile.userId}, ${profile.fullName}, ${profile.businessName}, ${profile.email}, ${profile.industry}, ${profile.companySize}, ${profile.feedback}, ${createdAt})
    ON CONFLICT (user_id) DO UPDATE SET
      full_name = excluded.full_name,
      business_name = excluded.business_name,
      email = excluded.email,
      industry = excluded.industry,
      company_size = excluded.company_size,
      feedback = excluded.feedback
  `
  return { ...profile, createdAt }
}

// ── Subscription (billing state — provider-agnostic) ───────────────────────
//
// This table only tracks *state*; lib/billing.ts owns the actual Lemon
// Squeezy calls. Every account gets an implicit 'free' / 'none' row (see
// getSubscription's default) until a real subscription is activated.

export type SubscriptionStatus = 'none' | 'active' | 'trialing' | 'past_due' | 'canceled'

export type Subscription = {
  userId: string
  plan: string // a TierId ('minimum' | 'growth' | 'scale' | 'enterprise'), or 'free' with no row yet
  status: SubscriptionStatus
  provider: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
  currentPeriodEnd: string | null // doubles as "cycle renews at"
  videoAllowance: number | null // null until a real tier is active
  videosUsedThisCycle: number
  createdAt: string
  updatedAt: string
}

type SubscriptionRow = {
  user_id: string
  plan: string
  status: string
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
  current_period_end: string | null
  video_allowance: number | null
  videos_used_this_cycle: number
  created_at: string
  updated_at: string
}

function rowToSubscription(row: SubscriptionRow): Subscription {
  return {
    userId: row.user_id,
    plan: row.plan,
    status: row.status as SubscriptionStatus,
    provider: row.provider,
    providerCustomerId: row.provider_customer_id,
    providerSubscriptionId: row.provider_subscription_id,
    currentPeriodEnd: row.current_period_end,
    videoAllowance: row.video_allowance,
    videosUsedThisCycle: row.videos_used_this_cycle,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

// Never returns null — an account with no row yet just means "free / none,"
// which is a real, valid state, not a missing-data error.
export async function getSubscription(userId: string): Promise<Subscription> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM subscriptions WHERE user_id = ${userId}`) as SubscriptionRow[]
  if (rows[0]) return rowToSubscription(rows[0])
  const now = new Date().toISOString()
  return {
    userId, plan: 'free', status: 'none',
    provider: null, providerCustomerId: null, providerSubscriptionId: null, currentPeriodEnd: null,
    videoAllowance: null, videosUsedThisCycle: 0,
    createdAt: now, updatedAt: now,
  }
}

export async function upsertSubscription(
  userId: string,
  updates: Partial<Omit<Subscription, 'userId' | 'createdAt' | 'updatedAt'>>
): Promise<Subscription> {
  await ensureSchema()
  const sql = getSql()
  const current = await getSubscription(userId)
  const next: Subscription = { ...current, ...updates, userId, updatedAt: new Date().toISOString() }

  await sql`
    INSERT INTO subscriptions (user_id, plan, status, provider, provider_customer_id, provider_subscription_id, current_period_end, video_allowance, videos_used_this_cycle, created_at, updated_at)
    VALUES (${next.userId}, ${next.plan}, ${next.status}, ${next.provider}, ${next.providerCustomerId}, ${next.providerSubscriptionId}, ${next.currentPeriodEnd}, ${next.videoAllowance}, ${next.videosUsedThisCycle}, ${current.createdAt}, ${next.updatedAt})
    ON CONFLICT (user_id) DO UPDATE SET
      plan = excluded.plan,
      status = excluded.status,
      provider = excluded.provider,
      provider_customer_id = excluded.provider_customer_id,
      provider_subscription_id = excluded.provider_subscription_id,
      current_period_end = excluded.current_period_end,
      video_allowance = excluded.video_allowance,
      videos_used_this_cycle = excluded.videos_used_this_cycle,
      updated_at = excluded.updated_at
  `
  return next
}

// Finds the subscription row owned by a given Lemon Squeezy customer id —
// webhooks identify accounts by that id, not our own user id, so this is
// how an incoming event maps back to a user.
export async function getSubscriptionByProviderId(providerCustomerId: string): Promise<Subscription | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT * FROM subscriptions WHERE provider_customer_id = ${providerCustomerId}`) as SubscriptionRow[]
  return rows[0] ? rowToSubscription(rows[0]) : null
}

// Called the moment a generation actually completes successfully (not on
// submission — a render that fails after retries shouldn't cost the client
// a video from their allowance).
export async function incrementVideosUsed(userId: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE subscriptions
    SET videos_used_this_cycle = videos_used_this_cycle + 1, updated_at = ${new Date().toISOString()}
    WHERE user_id = ${userId}
  `
}

// Called on cycle renewal — unused videos do not roll over, so this is a
// hard reset to 0, not a top-up.
export async function resetVideosUsedThisCycle(userId: string): Promise<void> {
  const sql = getSql()
  await sql`
    UPDATE subscriptions
    SET videos_used_this_cycle = 0, updated_at = ${new Date().toISOString()}
    WHERE user_id = ${userId}
  `
}

// ── Ad memory (lightweight, no ML) ──────────────────────────────────────────
//
// The signal is deliberately simple: "did this client download the finished
// video." Each kept ad gets recorded once (keyed by session_id, so clicking
// Download twice doesn't duplicate it) and the most recent ones for a client
// are fed back into the script/prompt system prompt as few-shot examples —
// see getRecentKeptAds and its callers in app/api/quickgen/route.ts.

export type AdMode = 'dialogue' | 'cinematic'

export type KeptAd = {
  id: string
  userId: string
  sessionId: string
  mode: AdMode
  hookLine: string
  body: string
  cta: string | null
  createdAt: string
}

type AdMemoryRow = {
  id: string
  user_id: string
  session_id: string
  mode: string
  hook_line: string
  body: string
  cta: string | null
  created_at: string
}

function rowToKeptAd(row: AdMemoryRow): KeptAd {
  return {
    id: row.id,
    userId: row.user_id,
    sessionId: row.session_id,
    mode: row.mode as AdMode,
    hookLine: row.hook_line,
    body: row.body,
    cta: row.cta,
    createdAt: row.created_at,
  }
}

export async function recordKeptAd(params: {
  userId: string
  sessionId: string
  mode: AdMode
  hookLine: string
  body: string
  cta: string | null
}): Promise<void> {
  await ensureSchema()
  const sql = getSql()
  const id = randomUUID().replace(/-/g, '').slice(0, 16)
  const createdAt = new Date().toISOString()
  await sql`
    INSERT INTO ad_memory (id, user_id, session_id, mode, hook_line, body, cta, created_at)
    VALUES (${id}, ${params.userId}, ${params.sessionId}, ${params.mode}, ${params.hookLine}, ${params.body}, ${params.cta}, ${createdAt})
    ON CONFLICT (session_id) DO NOTHING
  `
}

export async function getRecentKeptAds(userId: string, mode: AdMode, limit = 3): Promise<KeptAd[]> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`
    SELECT * FROM ad_memory WHERE user_id = ${userId} AND mode = ${mode}
    ORDER BY created_at DESC LIMIT ${limit}
  `) as AdMemoryRow[]
  return rows.map(rowToKeptAd)
}
