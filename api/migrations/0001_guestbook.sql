CREATE TABLE IF NOT EXISTS guestbook_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nickname TEXT NOT NULL,
  email_hash TEXT,
  content TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  fingerprint_hash TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('approved', 'spam')),
  risk_score INTEGER NOT NULL DEFAULT 0,
  risk_flags TEXT NOT NULL DEFAULT '[]',
  ip_hash TEXT NOT NULL,
  ua_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_guestbook_entries_status_id
  ON guestbook_entries (status, id DESC);

CREATE INDEX IF NOT EXISTS idx_guestbook_entries_content_hash
  ON guestbook_entries (content_hash);

CREATE INDEX IF NOT EXISTS idx_guestbook_entries_fingerprint_hash
  ON guestbook_entries (fingerprint_hash);

CREATE INDEX IF NOT EXISTS idx_guestbook_entries_ip_hash_created_at
  ON guestbook_entries (ip_hash, created_at DESC);
