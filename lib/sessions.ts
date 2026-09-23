import { randomUUID } from 'crypto'
import { getSql } from './neon'
import type { Session } from './types'

// Postgres (Neon) now, not a local sessions.json file — that file doesn't
// survive Vercel's ephemeral, per-invocation filesystem. Each session is
// stored as one JSONB row rather than fully normalized into columns; the
// Session shape (scripts, seedancePipeline, pipeline, renders — mostly
// optional, deeply nested) isn't worth relationally modeling for what's
// still an early-stage product, and this keeps the migration low-risk.

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS video_sessions (
          id TEXT PRIMARY KEY,
          user_id TEXT,
          data JSONB NOT NULL,
          created_at TEXT NOT NULL
        )
      `
      await sql`CREATE INDEX IF NOT EXISTS video_sessions_user_idx ON video_sessions(user_id)`
    })()
  }
  return schemaReady
}

// The Neon driver auto-parses JSONB columns into JS objects on read in the
// normal case; this just hedges against getting a raw string back instead.
function parseSessionData(raw: unknown): Session {
  return typeof raw === 'string' ? (JSON.parse(raw) as Session) : (raw as Session)
}

// userId is optional here on purpose — the app allows generating before
// signing up (see app/page.tsx), so a session can start anonymous and get
// claimed by a real account later once onboarding completes.
export async function createSession(userId?: string): Promise<Session> {
  await ensureSchema()
  const sql = getSql()
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    userId,
    renders: [],
  }
  await sql`
    INSERT INTO video_sessions (id, user_id, data, created_at)
    VALUES (${id}, ${userId ?? null}, ${JSON.stringify(session)}::jsonb, ${session.createdAt})
  `
  return session
}

export async function getSession(id: string): Promise<Session | null> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`SELECT data FROM video_sessions WHERE id = ${id}`) as { data: unknown }[]
  return rows[0] ? parseSessionData(rows[0].data) : null
}

export async function updateSession(
  id: string,
  updates: Partial<Omit<Session, 'id' | 'createdAt'>>
): Promise<Session | null> {
  await ensureSchema()
  const sql = getSql()
  const current = await getSession(id)
  if (!current) return null
  const next: Session = { ...current, ...updates }
  await sql`
    UPDATE video_sessions
    SET data = ${JSON.stringify(next)}::jsonb, user_id = ${next.userId ?? null}
    WHERE id = ${id}
  `
  return next
}

// Attaches an anonymous session to a real account — used right after
// signup/onboarding so the video someone generated before creating an
// account doesn't vanish from their library afterward.
export async function claimSession(id: string, userId: string): Promise<Session | null> {
  return updateSession(id, { userId })
}

export async function listSessionsForUser(userId: string): Promise<Session[]> {
  await ensureSchema()
  const sql = getSql()
  const rows = (await sql`
    SELECT data FROM video_sessions WHERE user_id = ${userId} ORDER BY created_at DESC
  `) as { data: unknown }[]
  return rows.map(r => parseSessionData(r.data))
}

// ── Per-session lock ─────────────────────────────────────────────────────
//
// updateSession() itself is atomic (a single UPDATE statement). The real
// race lives one level up: /api/status reads a session, does real async
// work in between (poll Seedance, maybe download and rehost the finished
// video — which can take longer than the 5s poll interval), and only then
// writes the result back. If a second request for the *same* session starts
// before the first one's write lands — an overlapping poll tick, or a
// second browser tab — both can independently decide a render just
// completed, both download the video, and whichever updateSession() call
// lands last silently wins, orphaning the other download and sometimes
// losing the write that would've shown the video in the library at all.
// This serializes any async work scoped to one session id so a second
// caller waits for the first to fully finish (read, act, and write) before
// it even starts.
//
// Caveat on Vercel specifically: this is an in-memory lock, scoped to one
// warm serverless instance. It fully covers the common case (overlapping
// requests reusing the same warm instance) but not two *different* cold
// instances polling the same session at the exact same moment — a real but
// much rarer edge case than the one this was built to fix. A proper fix
// would be a database-level lock (e.g. a row-level `SELECT ... FOR UPDATE`);
// worth doing if this ever shows up in practice, not blocking launch.
const sessionLocks = new Map<string, Promise<void>>()

export async function withSessionLock<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const previous = sessionLocks.get(id) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>(resolve => { release = resolve })
  const ourTail = previous.then(() => current)
  sessionLocks.set(id, ourTail)

  await previous
  try {
    return await fn()
  } finally {
    release()
    // Only clean up if no one queued behind us — if they did, the map
    // entry is their tail now, not ours.
    if (sessionLocks.get(id) === ourTail) {
      sessionLocks.delete(id)
    }
  }
}
