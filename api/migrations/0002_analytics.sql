-- Stores every tracked page access event. Repeated hits can be marked as not counted
-- for PV while still being retained for audit and abuse analysis.
CREATE TABLE IF NOT EXISTS visit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  visited_at TEXT NOT NULL,
  path TEXT NOT NULL,
  ip_address TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  user_agent TEXT,
  accept_language TEXT,
  referer TEXT,
  country TEXT,
  region TEXT,
  city TEXT,
  colo TEXT,
  visitor_key TEXT NOT NULL,
  visitor_id TEXT,
  is_unique_visitor INTEGER NOT NULL DEFAULT 0 CHECK (is_unique_visitor IN (0, 1)),
  counted_as_pageview INTEGER NOT NULL DEFAULT 1 CHECK (counted_as_pageview IN (0, 1)),
  skip_reason TEXT,
  dedupe_key TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

-- Maintains one row per logical visitor so UV/PV totals can be read cheaply.
CREATE TABLE IF NOT EXISTS visitors (
  visitor_key TEXT PRIMARY KEY,
  visitor_id TEXT,
  first_seen_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  first_ip TEXT NOT NULL,
  last_ip TEXT NOT NULL,
  first_country TEXT,
  last_country TEXT,
  visit_count INTEGER NOT NULL DEFAULT 0,
  pageview_count INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_visit_logs_visitor_key_visited_at
  ON visit_logs (visitor_key, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_visit_logs_path_visited_at
  ON visit_logs (path, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_visit_logs_dedupe_key_visited_at
  ON visit_logs (dedupe_key, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_visit_logs_counted_as_pageview_visited_at
  ON visit_logs (counted_as_pageview, visited_at DESC);

CREATE INDEX IF NOT EXISTS idx_visitors_last_seen_at
  ON visitors (last_seen_at DESC);
