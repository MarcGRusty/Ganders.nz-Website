-- People, roles and permissions.
-- A person can hold several roles; what they can do is everything any of their roles allows.
ALTER TABLE users ADD COLUMN name TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN active INTEGER NOT NULL DEFAULT 1;
ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN last_login TEXT;

CREATE TABLE roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  permissions TEXT NOT NULL DEFAULT '[]',
  system INTEGER NOT NULL DEFAULT 0,  -- built-in roles can't be deleted; Owner can't be changed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE user_roles (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  detail TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO roles (name, description, permissions, system) VALUES
  ('Owner', 'Full control of everything, including people and roles.', '["*"]', 1),
  ('Editor', 'Edits and publishes pages and writing, manages media, uses AI.',
   '["pages.view","pages.edit","pages.publish","posts.view","posts.edit","posts.publish","media.view","media.upload","messages.view","ai.use"]', 1),
  ('Writer', 'Writes drafts and sends them for review. Cannot publish.',
   '["posts.view","posts.edit","media.view","media.upload","ai.use"]', 1),
  ('Viewer', 'Can look around Studio but not change anything.',
   '["pages.view","posts.view","media.view"]', 1);

-- Anyone who already has a login becomes an Owner.
INSERT INTO user_roles (user_id, role_id) SELECT u.id, r.id FROM users u, roles r WHERE r.name = 'Owner';
