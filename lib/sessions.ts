import fs from 'fs'
import path from 'path'
import { randomUUID } from 'crypto'
import type { Session } from './types'

const DATA_FILE = path.join(process.cwd(), 'data', 'sessions.json')

function readAll(): Record<string, Session> {
  try {
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'))
  } catch {
    return {}
  }
}

function writeAll(sessions: Record<string, Session>): void {
  fs.writeFileSync(DATA_FILE, JSON.stringify(sessions, null, 2))
}

// userId is optional here on purpose — the app allows generating before
// signing up (see app/page.tsx), so a session can start anonymous and get
// claimed by a real account later once onboarding completes.
export function createSession(userId?: string): Session {
  const sessions = readAll()
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
    userId,
    renders: [],
  }
  sessions[id] = session
  writeAll(sessions)
  return session
}

export function getSession(id: string): Session | null {
  const sessions = readAll()
  return sessions[id] ?? null
}

export function updateSession(
  id: string,
  updates: Partial<Omit<Session, 'id' | 'createdAt'>>
): Session | null {
  const sessions = readAll()
  if (!sessions[id]) return null
  sessions[id] = { ...sessions[id], ...updates }
  writeAll(sessions)
  return sessions[id]
}

// Attaches an anonymous session to a real account — used right after
// signup/onboarding so the video someone generated before creating an
// account doesn't vanish from their library afterward.
export function claimSession(id: string, userId: string): Session | null {
  return updateSession(id, { userId })
}

export function listSessionsForUser(userId: string): Session[] {
  const sessions = readAll()
  return Object.values(sessions).filter(s => s.userId === userId)
}

// ── Per-session lock ─────────────────────────────────────────────────────
//
// updateSession() itself is atomic (synchronous read+write, nothing else
// can interleave). The real race lives one level up: /api/status reads a
// session, does real async work in between (poll Seedance, maybe download
// and rehost the finished video — which can take longer than the 5s poll
// interval), and only then writes the result back. If a second request for
// the *same* session starts before the first one's write lands — an
// overlapping poll tick, or a second browser tab — both can independently
// decide a render just completed, both download the video, and whichever
// updateSession() call lands last silently wins, orphaning the other
// download and sometimes losing the write that would've shown the video
// in the library at all. This serializes any async work scoped to one
// session id so a second caller waits for the first to fully finish
// (read, act, and write) before it even starts.
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
