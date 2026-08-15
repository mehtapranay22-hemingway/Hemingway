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

export function createSession(): Session {
  const sessions = readAll()
  const id = randomUUID().replace(/-/g, '').slice(0, 12)
  const session: Session = {
    id,
    createdAt: new Date().toISOString(),
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
