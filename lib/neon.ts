import { neon } from '@neondatabase/serverless'

// Shared Postgres connection helper (Neon, via Vercel's Storage integration)
// for every server-only data module (lib/db.ts, lib/sessions.ts,
// lib/avatars.ts). neon()'s HTTP driver has no persistent connection to
// manage — no pool/client lifecycle to worry about across serverless
// invocations, which is exactly the shape Vercel functions need (a
// long-lived Pool/Client can't safely outlive a single request there).
//
// Replaces node:sqlite + local files, which don't survive Vercel's
// ephemeral, per-invocation filesystem.

export function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL
  if (!url) {
    throw new Error(
      'DATABASE_URL is not set — provision Postgres in the Vercel project\'s Storage tab (or set DATABASE_URL in .env.local for local dev).'
    )
  }
  return neon(url)
}
