-- Core state tracking: one row per Notion page
CREATE TABLE IF NOT EXISTS sync_posts (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  notion_page_id    TEXT    NOT NULL UNIQUE,
  project_id        TEXT    NOT NULL,
  late_post_id      TEXT,
  status            TEXT    NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending', 'scheduled', 'published', 'failed', 'failed_retryable')),
  scheduled_for     TEXT,
  published_at      TEXT,
  post_urls         TEXT,   -- JSON array of {platform, url}
  last_error        TEXT,
  retry_count       INTEGER NOT NULL DEFAULT 0,
  next_analytics_at TEXT,
  created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
  updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sync_posts_status ON sync_posts(status);
CREATE INDEX IF NOT EXISTS idx_sync_posts_project ON sync_posts(project_id);
CREATE INDEX IF NOT EXISTS idx_sync_posts_analytics ON sync_posts(next_analytics_at);

-- Time-series metric snapshots per post
CREATE TABLE IF NOT EXISTS analytics_log (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  sync_post_id    INTEGER NOT NULL REFERENCES sync_posts(id),
  impressions     INTEGER DEFAULT 0,
  likes           INTEGER DEFAULT 0,
  comments        INTEGER DEFAULT 0,
  shares          INTEGER DEFAULT 0,
  reach           INTEGER DEFAULT 0,
  clicks          INTEGER DEFAULT 0,
  recorded_at     TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_analytics_log_post ON analytics_log(sync_post_id);

-- Event log for dashboard display
CREATE TABLE IF NOT EXISTS activity_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  level       TEXT    NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  project_id  TEXT,
  message     TEXT    NOT NULL,
  details     TEXT,   -- JSON for extra context
  created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_activity_log_created ON activity_log(created_at);
CREATE INDEX IF NOT EXISTS idx_activity_log_project ON activity_log(project_id);
