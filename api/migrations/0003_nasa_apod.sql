-- Cached NASA APOD candidate pool used to pick the site background layer.
-- Single-row cache: items_json holds the filtered image candidates from the
-- most recent APOD window; expires_at gates refetching the upstream API.
CREATE TABLE IF NOT EXISTS nasa_apod (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  items_json TEXT NOT NULL,
  fetched_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
