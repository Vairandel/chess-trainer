import { readdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { D1Like, D1Statement } from '../functions/_lib/types';

/** A D1 database for tests: Node's built-in SQLite, with the real migrations applied. */
export function sqliteD1(): D1Like {
  const db = new DatabaseSync(':memory:');
  const dir = new URL('../migrations/', import.meta.url);
  for (const file of readdirSync(dir).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL(file, dir), 'utf8'));

  const statement = (sql: string, values: unknown[] = []): D1Statement => {
    const args = values as (string | number | null)[];
    return {
      bind: (...v: unknown[]) => statement(sql, v),
      first: async <T>() => (db.prepare(sql).get(...args) as T | undefined) ?? null,
      all: async <T>() => ({ results: db.prepare(sql).all(...args) as T[] }),
      run: async () => ({ meta: { changes: Number(db.prepare(sql).run(...args).changes) } }),
    };
  };
  return {
    prepare: sql => statement(sql),
    // like D1, a batch is one transaction
    batch: async statements => {
      db.exec('BEGIN');
      try {
        const out = [];
        for (const s of statements) out.push(await s.run());
        db.exec('COMMIT');
        return out;
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
    },
  };
}
