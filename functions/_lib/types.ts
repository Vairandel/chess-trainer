/**
 * The parts of the Cloudflare Pages Functions API this backend uses. Declared here rather than
 * depending on @cloudflare/workers-types; the tests implement D1Like with node:sqlite.
 */

export interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
  run(): Promise<{ meta: { changes: number } }>;
}

export interface D1Like {
  prepare(sql: string): D1Statement;
  batch(statements: D1Statement[]): Promise<unknown[]>;
}

export interface Env {
  DB?: D1Like;
  /** Set with `wrangler pages secret put ADMIN_PASSWORD`. */
  ADMIN_PASSWORD?: string;
  /** A long random secret mixed into every PIN hash (`wrangler pages secret put PIN_PEPPER`). */
  PIN_PEPPER?: string;
}

export interface Context {
  request: Request;
  env: Env;
  params: Record<string, string | string[]>;
  next?: () => Promise<Response>;
}

export type Handler = (context: Context) => Promise<Response>;
