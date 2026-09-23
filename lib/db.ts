import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import { DatabaseSync } from 'node:sqlite'

// Real SQLite database (Node's built-in node:sqlite — no extra dependency,
// no native build step) for account-level data: users, auth sessions, and
// each user's onboarding profile. Server-only — never import this from a
// 'use client' file.

const DB_FILE = path.join(process.cwd(), 'data', 'hemingway.db')

let db: InstanceType<typeof DatabaseSync> | null = null

function getDb() {
  if (db) return db
  fs.mkdirSync(path.dirname(DB_FILE), { recursive: true })
  db = new DatabaseSync(DB_FILE)
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      token TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS client_profile (
      user_id TEXT PRIMARY KEY,
      full_name TEXT NOT NULL,
      business_name TEXT NOT NULL,
      email TEXT NOT NULL,
      industry TEXT NOT NULL,
      company_size TEXT NOT NULL,
      feedback TEXT,
      created_at TEXT NOT NULL
    );

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
    );

    CREATE TABLE IF NOT EXISTS ad_memory (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL UNIQUE,
      mode TEXT NOT NULL,
      hook_line TEXT NOT NULL,
      body TEXT NOT NULL,
      cta TEXT,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS ad_memory_user_idx ON ad_memory(user_id, created_at);
  `)

  // CREATE TABLE IF NOT EXISTS is a no-op against a subscriptions table that
  // already existed before video_allowance/videos_used_this_cycle were
  // added — this backfills those columns onto a pre-existing db file.
  const existingCols = new Set(
    (db.prepare('PRAGMA table_info(subscriptions)').all() as { name: string }[]).map(c => c.name)
  )
  if (!existingCols.has('video_allowance')) {
    db.exec('ALTER TABLE subscriptions ADD COLUMN video_allowance INTEGER')
  }
  if (!existingCols.has('videos_used_this_cycle')) {
    db.exec('ALTER TABLE subscriptions ADD COLUMN videos_used_this_cycle INTEGER NOT NULL DEFAULT 0')
  }

  return db
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

export function createUser(email: string, passwordHash: string, passwordSalt: string): User {
  const id = randomUUID().replace(/-/g, '').slice(0, 16)
  const createdAt = new Date().toISOString()
  getDb().prepare(
    'INSERT INTO users (id, email, password_hash, password_salt, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(id, email.toLowerCase(), passwordHash, passwordSalt, createdAt)
  return { id, email: email.toLowerCase(), passwordHash, passwordSalt, createdAt }
}

export function getUserByEmail(email: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE email = ?').get(email.toLowerCase()) as UserRow | undefined
  return row ? rowToUser(row) : null
}

export function getUserById(id: string): User | null {
  const row = getDb().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined
  return row ? rowToUser(row) : null
}

// ── Auth sessions (cookie-backed login sessions — distinct from the video
// generation "sessions" in lib/sessions.ts) ─────────────────────────────
//
// "Stay logged in" like a normal consumer app: a long-lived cookie (a year),
// renewed on a sliding window so anyone who visits at least once every ~11
// months never sees it expire. Only actually goes stale if the account sits
// completely untouched for a year — closing the browser/restarting the
// machine never logs anyone out on its own (the cookie has a real Expires
// date, not a session-only one — confirmed live against a real response).

const SESSION_TTL_DAYS = 365
const SESSION_REFRESH_AFTER_DAYS = 30 // renew once there's less than this left, not on every request

export function createAuthSession(userId: string): { token: string; expiresAt: string } {
  const token = randomUUID().replace(/-/g, '') + randomUUID().replace(/-/g, '')
  const createdAt = new Date()
  const expiresAt = new Date(createdAt.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  getDb().prepare('INSERT INTO auth_sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(token, userId, createdAt.toISOString(), expiresAt.toISOString())
  return { token, expiresAt: expiresAt.toISOString() }
}

// Pushes a still-valid session's expiry back out to a full year from now —
// called from getUserByToken whenever a session is getting close to expiring,
// so actual usage (not just time since login) is what keeps someone signed in.
function renewAuthSession(token: string): string {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  getDb().prepare('UPDATE auth_sessions SET expires_at = ? WHERE token = ?').run(expiresAt.toISOString(), token)
  return expiresAt.toISOString()
}

export function getUserByToken(token: string): User | null {
  const row = getDb().prepare('SELECT * FROM auth_sessions WHERE token = ?').get(token) as
    | { token: string; user_id: string; expires_at: string }
    | undefined
  if (!row) return null
  if (new Date(row.expires_at).getTime() < Date.now()) {
    deleteAuthSession(token)
    return null
  }
  return getUserById(row.user_id)
}

export function deleteAuthSession(token: string): void {
  getDb().prepare('DELETE FROM auth_sessions WHERE token = ?').run(token)
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

export function getClientProfile(userId: string): ClientProfile | null {
  const row = getDb().prepare('SELECT * FROM client_profile WHERE user_id = ?').get(userId) as ClientProfileRow | undefined
  return row ? rowToProfile(row) : null
}

export function saveClientProfile(profile: {
  userId: string
  fullName: string
  businessName: string
  email: string
  industry: string
  companySize: string
  feedback: string | null
}): ClientProfile {
  const createdAt = new Date().toISOString()
  getDb().prepare(`
    INSERT INTO client_profile (user_id, full_name, business_name, email, industry, company_size, feedback, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      full_name = excluded.full_name,
      business_name = excluded.business_name,
      email = excluded.email,
      industry = excluded.industry,
      company_size = excluded.company_size,
      feedback = excluded.feedback
  `).run(profile.userId, profile.fullName, profile.businessName, profile.email, profile.industry, profile.companySize, profile.feedback, createdAt)

  return { ...profile, createdAt }
}

// ── Subscription (billing state — provider-agnostic) ───────────────────────
//
// This table only tracks *state*, not payment logic — no Stripe/PayPal/etc.
// calls happen here or anywhere in lib/billing.ts yet. Every account gets an
// implicit 'free' / 'none' row (see getSubscription's default) until a real
// provider is wired in. Designed so wiring one in later is "fill in
// `provider`/checkout logic," not "redesign the schema."

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
export function getSubscription(userId: string): Subscription {
  const row = getDb().prepare('SELECT * FROM subscriptions WHERE user_id = ?').get(userId) as SubscriptionRow | undefined
  if (row) return rowToSubscription(row)
  const now = new Date().toISOString()
  return {
    userId, plan: 'free', status: 'none',
    provider: null, providerCustomerId: null, providerSubscriptionId: null, currentPeriodEnd: null,
    videoAllowance: null, videosUsedThisCycle: 0,
    createdAt: now, updatedAt: now,
  }
}

export function upsertSubscription(userId: string, updates: Partial<Omit<Subscription, 'userId' | 'createdAt' | 'updatedAt'>>): Subscription {
  const current = getSubscription(userId)
  const next: Subscription = { ...current, ...updates, userId, updatedAt: new Date().toISOString() }

  getDb().prepare(`
    INSERT INTO subscriptions (user_id, plan, status, provider, provider_customer_id, provider_subscription_id, current_period_end, video_allowance, videos_used_this_cycle, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(user_id) DO UPDATE SET
      plan = excluded.plan,
      status = excluded.status,
      provider = excluded.provider,
      provider_customer_id = excluded.provider_customer_id,
      provider_subscription_id = excluded.provider_subscription_id,
      current_period_end = excluded.current_period_end,
      video_allowance = excluded.video_allowance,
      videos_used_this_cycle = excluded.videos_used_this_cycle,
      updated_at = excluded.updated_at
  `).run(
    next.userId, next.plan, next.status, next.provider,
    next.providerCustomerId, next.providerSubscriptionId, next.currentPeriodEnd,
    next.videoAllowance, next.videosUsedThisCycle,
    current.createdAt, next.updatedAt
  )

  return next
}

// Finds the subscription row owned by a given Stripe customer or
// subscription id — webhooks identify accounts by Stripe id, not our own
// user id, so this is how an incoming event maps back to a user.
export function getSubscriptionByProviderId(providerCustomerId: string): Subscription | null {
  const row = getDb().prepare('SELECT * FROM subscriptions WHERE provider_customer_id = ?').get(providerCustomerId) as SubscriptionRow | undefined
  return row ? rowToSubscription(row) : null
}

// Called the moment a generation actually completes successfully (not on
// submission — a render that fails after retries shouldn't cost the client
// a video from their allowance). A no-op if the account has no subscription
// row yet, which shouldn't happen in practice since generation is gated on
// an active subscription before this could ever be reached.
export function incrementVideosUsed(userId: string): void {
  getDb().prepare(
    'UPDATE subscriptions SET videos_used_this_cycle = videos_used_this_cycle + 1, updated_at = ? WHERE user_id = ?'
  ).run(new Date().toISOString(), userId)
}

// Called on cycle renewal (Stripe's invoice.payment_succeeded for a
// recurring invoice, or the dev-simulated equivalent) — unused videos do not
// roll over, so this is a hard reset to 0, not a top-up.
export function resetVideosUsedThisCycle(userId: string): void {
  getDb().prepare(
    'UPDATE subscriptions SET videos_used_this_cycle = 0, updated_at = ? WHERE user_id = ?'
  ).run(new Date().toISOString(), userId)
}

// ── Ad memory (lightweight, no ML) ──────────────────────────────────────────
//
// The signal is deliberately simple: "did this client download the finished
// video." That's an explicit, unambiguous keep decision — unlike navigating
// away, which could mean anything. Each kept ad gets recorded once (keyed by
// session_id, so clicking Download twice doesn't duplicate it) and the most
// recent ones for a client are fed back into the script/prompt system prompt
// as few-shot examples of what's already worked for them — see
// getRecentKeptAds and its callers in app/api/quickgen/route.ts. This is
// retrieval into the prompt, not model training; there's no learning across
// different clients, only within one client's own history.

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

export function recordKeptAd(params: {
  userId: string
  sessionId: string
  mode: AdMode
  hookLine: string
  body: string
  cta: string | null
}): void {
  const id = randomUUID().replace(/-/g, '').slice(0, 16)
  const createdAt = new Date().toISOString()
  getDb().prepare(`
    INSERT OR IGNORE INTO ad_memory (id, user_id, session_id, mode, hook_line, body, cta, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, params.userId, params.sessionId, params.mode, params.hookLine, params.body, params.cta, createdAt)
}

export function getRecentKeptAds(userId: string, mode: AdMode, limit = 3): KeptAd[] {
  const rows = getDb().prepare(
    'SELECT * FROM ad_memory WHERE user_id = ? AND mode = ? ORDER BY created_at DESC LIMIT ?'
  ).all(userId, mode, limit) as AdMemoryRow[]
  return rows.map(rowToKeptAd)
}
