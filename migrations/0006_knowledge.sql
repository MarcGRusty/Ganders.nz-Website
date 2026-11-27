-- Knowledge base: Marc's own notes, documents and links that post ideas are drawn from.
CREATE TABLE knowledge (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,              -- note | url | file
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',   -- the text the AI reads
  url TEXT,
  file_key TEXT,                   -- PDFs kept in storage, shown to AI services that can read them
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
-- Full text search so ideas on a topic pull the most relevant material.
CREATE VIRTUAL TABLE knowledge_fts USING fts5(title, body);

-- Why an idea was suggested: angle, outline and which knowledge it came from.
ALTER TABLE posts ADD COLUMN meta TEXT;
