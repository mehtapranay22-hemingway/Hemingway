import { getSql } from './neon'

// Fixed-window rate limiting backed by Postgres — no new service (Upstash
// Redis etc.) needed for launch-scale traffic. One atomic UPSERT per check:
// if the existing window has expired, it resets to a fresh window of 1;
// otherwise it increments in place. This is race-safe under concurrent
// requests because the CASE logic runs inside a single statement, not a
// separate read-then-write.

let schemaReady: Promise<void> | null = null

function ensureSchema(): Promise<void> {
  if (!schemaReady) {
    schemaReady = (async () => {
      const sql = getSql()
      await sql`
        CREATE TABLE IF NOT EXISTS rate_limits (
          key TEXT PRIMARY KEY,
          window_start TIMESTAMPTZ NOT NULL,
          count INTEGER NOT NULL
        )
      `
    })()
  }
  return schemaReady
}

export async function checkRateLimit(
  key: string,
  maxRequests: number,
  windowSeconds: number
): Promise<{ allowed: boolean; retryAfterSeconds?: number }> {
  await ensureSchema()
  const sql = getSql()

  const rows = (await sql`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (${key}, now(), 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN 1
        ELSE rate_limits.count + 1
      END,
      window_start = CASE
        WHEN rate_limits.window_start < now() - make_interval(secs => ${windowSeconds}) THEN now()
        ELSE rate_limits.window_start
      END
    RETURNING count, window_start
  `) as { count: number; window_start: string }[]

  const row = rows[0]
  if (!row || row.count <= maxRequests) return { allowed: true }

  const windowStart = new Date(row.window_start).getTime()
  const retryAfterSeconds = Math.max(1, Math.ceil((windowStart + windowSeconds * 1000 - Date.now()) / 1000))
  return { allowed: false, retryAfterSeconds }
}

// Best-effort real client IP on Vercel — falls back to a constant so
// requests without a forwarded-for header (e.g. local dev) still get
// limited as a single shared bucket rather than throwing.
export function clientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') || 'unknown'
}
