import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { D1Database } from './d1';

interface MigrationRow {
  name: string;
}

/**
 * Applies migrations/*.sql in filename order, once each, tracked in _migrations.
 * Migration files are written idempotently (IF NOT EXISTS) so re-running a
 * partially applied file is safe.
 */
export const applyMigrations = async (db: D1Database, dir: string): Promise<string[]> => {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
      name TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`,
  );

  const appliedRows = await db
    .prepare('SELECT name FROM _migrations')
    .all<MigrationRow>();
  const applied = new Set(appliedRows.results.map((row) => row.name));

  const files = readdirSync(dir)
    .filter((file) => file.endsWith('.sql'))
    .sort();

  const appliedNow: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    db.exec(readFileSync(join(dir, file), 'utf8'));
    await db.prepare('INSERT INTO _migrations (name) VALUES (?)').bind(file).run();
    appliedNow.push(file);
  }
  return appliedNow;
};
