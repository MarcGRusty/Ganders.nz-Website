import type { Env, Page, Post, SiteSettings } from '../types';
import { DEFAULT_SETTINGS, DEFAULT_HOME, DEFAULT_ABOUT, DEFAULT_CONTACT } from './defaults';

const parsePage = (r: any): Page => ({ ...r, blocks: JSON.parse(r.blocks || '[]'), seo: JSON.parse(r.seo || '{}') });
const parsePost = (r: any): Post => ({ ...r, tags: JSON.parse(r.tags || '[]') });

export async function getSettings(env: Env): Promise<SiteSettings> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'site'").first<{ value: string }>();
  if (!row) return DEFAULT_SETTINGS;
  const saved = JSON.parse(row.value);
  return { ...DEFAULT_SETTINGS, ...saved, theme: { ...DEFAULT_SETTINGS.theme, ...(saved.theme || {}) } };
}

export async function saveSettings(env: Env, s: SiteSettings) {
  await env.DB.prepare(
    "INSERT INTO settings (key, value, updated_at) VALUES ('site', ?1, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')"
  ).bind(JSON.stringify(s)).run();
  await snapshot(env, 'settings', 0, s);
}

let seeded = false;
/**
 * First run: create the starter pages (Home, About, Contact). Runs once per install, so a page
 * Marc deletes later stays deleted. Home always exists.
 */
export async function ensureSeed(env: Env) {
  if (seeded) return;
  const done = await env.DB.prepare("SELECT 1 FROM settings WHERE key = 'seeded'").first();
  const starters: [string, string, number, number, unknown][] = [
    ['home', 'Home', 0, 0, DEFAULT_HOME],
    ['about', 'About', 1, 10, DEFAULT_ABOUT],
    ['contact', 'Contact', 1, 90, DEFAULT_CONTACT],
  ];
  for (const [slug, title, inMenu, order, blocks] of done ? starters.slice(0, 1) : starters) {
    await env.DB.prepare("INSERT OR IGNORE INTO pages (slug, title, status, in_menu, menu_order, blocks) VALUES (?, ?, 'published', ?, ?, ?)")
      .bind(slug, title, inMenu, order, JSON.stringify(blocks)).run();
  }
  if (!done) await env.DB.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('seeded', '1')").run();
  seeded = true;
}

export async function getPage(env: Env, slug: string, includeDrafts = false): Promise<Page | null> {
  const r = await env.DB.prepare(`SELECT * FROM pages WHERE slug = ? ${includeDrafts ? '' : "AND status = 'published'"}`).bind(slug).first();
  return r ? parsePage(r) : null;
}
export async function getPageById(env: Env, id: number) {
  const r = await env.DB.prepare('SELECT * FROM pages WHERE id = ?').bind(id).first();
  return r ? parsePage(r) : null;
}
export async function listPages(env: Env) {
  const { results } = await env.DB.prepare('SELECT * FROM pages ORDER BY menu_order, title').all();
  return results.map(parsePage);
}
export async function menuPages(env: Env) {
  const { results } = await env.DB.prepare("SELECT slug, title, menu_order FROM pages WHERE status = 'published' AND in_menu = 1 AND slug != 'home' ORDER BY menu_order, title").all<{ slug: string; title: string; menu_order: number }>();
  // Writing is built in and sits at position 50, so pages can go before or after it.
  return [{ slug: '', title: 'Home', menu_order: -1 }, ...results, { slug: 'writing', title: 'Writing', menu_order: 50 }]
    .sort((a, b) => a.menu_order - b.menu_order)
    .map(({ slug, title }) => ({ slug, title }));
}

export async function listPosts(env: Env, opts: { status?: string; limit?: number } = {}) {
  const where = opts.status ? 'WHERE status = ?' : '';
  const order = opts.status === 'published' ? 'published_at DESC' : 'updated_at DESC';
  const stmt = env.DB.prepare(`SELECT * FROM posts ${where} ORDER BY ${order} LIMIT ${opts.limit ?? 200}`);
  const { results } = await (opts.status ? stmt.bind(opts.status) : stmt).all();
  return results.map(parsePost);
}
export async function getPost(env: Env, slug: string, includeDrafts = false): Promise<Post | null> {
  const r = await env.DB.prepare(`SELECT * FROM posts WHERE slug = ? ${includeDrafts ? '' : "AND status = 'published'"}`).bind(slug).first();
  return r ? parsePost(r) : null;
}
export async function getPostById(env: Env, id: number) {
  const r = await env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first();
  return r ? parsePost(r) : null;
}

export async function snapshot(env: Env, entity: string, entityId: number, data: unknown, note?: string) {
  await env.DB.prepare('INSERT INTO revisions (entity, entity_id, data, note) VALUES (?, ?, ?, ?)')
    .bind(entity, entityId, JSON.stringify(data), note ?? null).run();
  // Keep the newest 50 revisions per item.
  await env.DB.prepare(
    'DELETE FROM revisions WHERE entity = ?1 AND entity_id = ?2 AND id NOT IN (SELECT id FROM revisions WHERE entity = ?1 AND entity_id = ?2 ORDER BY id DESC LIMIT 50)'
  ).bind(entity, entityId).run();
}

export const slugify = (s: string) =>
  s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'untitled';
