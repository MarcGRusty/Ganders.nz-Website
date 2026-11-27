-- Inbox: every form submission is kept here, emailed to the owner, and can be worked on in Studio.
ALTER TABLE messages ADD COLUMN status TEXT NOT NULL DEFAULT 'new';   -- new | open | replied | done | spam
ALTER TABLE messages ADD COLUMN form TEXT NOT NULL DEFAULT 'contact';
ALTER TABLE messages ADD COLUMN page TEXT;
ALTER TABLE messages ADD COLUMN data TEXT;                            -- extra fields as JSON
ALTER TABLE messages ADD COLUMN notes TEXT;
ALTER TABLE messages ADD COLUMN emailed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE messages ADD COLUMN updated_at TEXT;
UPDATE messages SET status = CASE WHEN read = 1 THEN 'open' ELSE 'new' END;

CREATE TABLE message_replies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  message_id INTEGER NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
  body TEXT NOT NULL,
  sent_by INTEGER,
  ok INTEGER NOT NULL DEFAULT 0,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE mail_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  to_addr TEXT NOT NULL,
  subject TEXT NOT NULL,
  kind TEXT NOT NULL,
  ok INTEGER NOT NULL,
  error TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Editors can work the inbox too.
UPDATE roles SET permissions = json_insert(permissions, '$[#]', 'messages.reply') WHERE name = 'Editor';
