-- Where the important part of a photo is (usually a face), as percentages from the top left,
-- so every crop keeps it in frame. Set automatically on upload and adjustable in Studio.
ALTER TABLE media ADD COLUMN focus_x REAL;
ALTER TABLE media ADD COLUMN focus_y REAL;
ALTER TABLE media ADD COLUMN focus_source TEXT;   -- auto | manual | none
ALTER TABLE media ADD COLUMN width INTEGER;
ALTER TABLE media ADD COLUMN height INTEGER;

-- Design inspiration: uploaded files and websites the AI can learn a look from.
CREATE TABLE inspiration (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  kind TEXT NOT NULL,          -- file | url
  media_key TEXT,
  url TEXT,
  title TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  summary TEXT,                -- what the AI took from it
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
