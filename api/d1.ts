import Database from 'better-sqlite3';

/**
 * Minimal Cloudflare D1-compatible adapter over better-sqlite3.
 *
 * Covers the exact surface used by server/lib (prepare → bind → all/first/run)
 * so the ported Pages Functions logic runs unchanged on a self-hosted VPS.
 * Like D1, statement execution is async at the call sites and throws on error.
 */
export type SqlValue = string | number | bigint | Uint8Array | null;

const toSqlValue = (value: unknown): SqlValue => {
  if (value === undefined || value === null) return null;
  if (value === true) return 1;
  if (value === false) return 0;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'bigint') return value;
  if (value instanceof Uint8Array) return value;
  if (value instanceof Buffer) return new Uint8Array(value);
  throw new TypeError(`Unsupported SQLite binding: ${typeof value}`);
};

export class D1PreparedStatement {
  constructor(
    private readonly db: Database.Database,
    private readonly sql: string,
    private readonly params: SqlValue[] = [],
  ) {}

  bind(...values: unknown[]): D1PreparedStatement {
    return new D1PreparedStatement(this.db, this.sql, values.map(toSqlValue));
  }

  async all<T>(): Promise<{ results: T[]; success: boolean }> {
    const results = this.db.prepare(this.sql).all(...this.params) as T[];
    return { results, success: true };
  }

  async first<T>(): Promise<T | null> {
    const row = this.db.prepare(this.sql).get(...this.params) as T | undefined;
    return row ?? null;
  }

  async run(): Promise<{ success: boolean }> {
    this.db.prepare(this.sql).run(...this.params);
    return { success: true };
  }
}

export class D1Database {
  private constructor(private readonly db: Database.Database) {}

  static open(path: string): D1Database {
    const db = new Database(path);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.pragma('foreign_keys = ON');
    return new D1Database(db);
  }

  prepare(query: string): D1PreparedStatement {
    return new D1PreparedStatement(this.db, query);
  }

  exec(script: string): void {
    this.db.exec(script);
  }

  close(): void {
    this.db.close();
  }
}
