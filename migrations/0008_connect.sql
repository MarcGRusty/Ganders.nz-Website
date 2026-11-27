-- Phase 4: integrations, webhooks, social sharing and AI-built modules.

-- Outside systems. kind: api (a REST API Studio can call), webhook_out (Studio tells it when
-- something happens), webhook_in (it sends things to the site). Secrets are encrypted with APP_KEY.
CREATE TABLE integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,
  name TEXT NOT NULL,
  url TEXT,                         -- api: base address; webhook_out: where to send
  auth TEXT NOT NULL DEFAULT 'none', -- none | bearer | header | query | basic
  auth_name TEXT,                   -- header or query parameter name
  enc_secret TEXT,                  -- api key, token, or signing secret
  headers TEXT NOT NULL DEFAULT '{}',
  events TEXT NOT NULL DEFAULT '[]',  -- webhook_out: which events to send
  token TEXT UNIQUE,                -- webhook_in: the secret part of its address
  action TEXT,                      -- webhook_in: inbox | knowledge
  active INTEGER NOT NULL DEFAULT 1,
  last_ok INTEGER,
  last_at TEXT,
  last_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE integration_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  integration_id INTEGER NOT NULL REFERENCES integrations(id) ON DELETE CASCADE,
  direction TEXT NOT NULL,          -- in | out | test
  event TEXT,
  ok INTEGER NOT NULL,
  status INTEGER,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX integration_log_by ON integration_log (integration_id, id DESC);

-- App credentials for social networks (for example a Meta app id and secret), encrypted.
CREATE TABLE social_apps (
  provider TEXT PRIMARY KEY,
  enc_value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Connected accounts: facebook, instagram, bluesky, mastodon. Tokens encrypted.
CREATE TABLE social_accounts (
  network TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ref TEXT NOT NULL,                -- page id, instagram user id, handle, or instance
  enc_token TEXT NOT NULL,
  meta TEXT NOT NULL DEFAULT '{}',
  connected_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- The share queue. One row per network per share.
CREATE TABLE social_posts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch TEXT NOT NULL,
  post_id INTEGER,
  network TEXT NOT NULL,
  body TEXT NOT NULL,
  link TEXT,
  images TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'queued', -- queued | sending | sent | failed
  send_at TEXT NOT NULL DEFAULT (datetime('now')),
  tries INTEGER NOT NULL DEFAULT 0,
  result_url TEXT,
  error TEXT,
  created_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  sent_at TEXT
);
CREATE INDEX social_posts_due ON social_posts (status, send_at);

-- Modules: blocks built from a plain-English description. Templates and CSS are sanitised on save.
CREATE TABLE modules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  fields TEXT NOT NULL DEFAULT '[]',
  template TEXT NOT NULL DEFAULT '',
  css TEXT NOT NULL DEFAULT '',
  source TEXT,                      -- optional data feed: {integration, path, cache}
  sample TEXT NOT NULL DEFAULT '{}',
  version INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  made_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE module_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  module_id INTEGER NOT NULL REFERENCES modules(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  data TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
