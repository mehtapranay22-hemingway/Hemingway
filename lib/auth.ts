import { randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'
import { createAuthSession, deleteAuthSession, getUserByToken, type User } from './db'

export const SESSION_COOKIE = 'hw_session'

// scrypt (Node built-in, no bcrypt dependency needed) with a random salt
// per password — a real KDF, not a bare hash.
export function hashPassword(password: string): { hash: string; salt: string } {
  const salt = randomBytes(16).toString('hex')
  const hash = scryptSync(password, salt, 64).toString('hex')
  return { hash, salt }
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  const candidate = scryptSync(password, salt, 64)
  const stored = Buffer.from(hash, 'hex')
  if (candidate.length !== stored.length) return false
  return timingSafeEqual(candidate, stored)
}

export async function getCurrentUser(req: NextRequest): Promise<User | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (!token) return null
  return getUserByToken(token)
}

// Logs a user in by minting a session and attaching the cookie to the given
// response — call this on the response you're about to return from signup/signin.
export async function attachSession(res: NextResponse, userId: string): Promise<NextResponse> {
  const { token, expiresAt } = await createAuthSession(userId)
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: new Date(expiresAt),
  })
  return res
}

export async function clearSession(req: NextRequest, res: NextResponse): Promise<NextResponse> {
  const token = req.cookies.get(SESSION_COOKIE)?.value
  if (token) await deleteAuthSession(token)
  res.cookies.set(SESSION_COOKIE, '', { httpOnly: true, sameSite: 'lax', path: '/', expires: new Date(0) })
  return res
}
