// Minimal ambient types for Node's built-in experimental `node:sqlite`
// module — the installed @types/node (^20) predates this API (added in
// Node 22.5+), and bumping that dependency for one narrow experimental
// surface isn't worth the broader blast radius. Only declares what lib/db.ts
// actually uses.
declare module 'node:sqlite' {
  export class StatementSync {
    run(...params: unknown[]): { changes: number; lastInsertRowid: number | bigint }
    get(...params: unknown[]): unknown
    all(...params: unknown[]): unknown[]
  }

  export class DatabaseSync {
    constructor(location: string, options?: Record<string, unknown>)
    exec(sql: string): void
    prepare(sql: string): StatementSync
    close(): void
  }
}
