-- AI providers: keys are encrypted with the APP_KEY Worker secret before they are stored.
CREATE TABLE ai_providers (
  id TEXT PRIMARY KEY,             -- claude | openai | grok | gemini | workers
  enabled INTEGER NOT NULL DEFAULT 1,
  enc_key TEXT,                    -- AES-GCM ciphertext, never returned to the browser
  model TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE ai_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  ok INTEGER NOT NULL,
  ms INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX ai_log_recent ON ai_log(id DESC);
