import aiRoutes from './ai';
import { renderBlocks } from '../render/blocks';
import { layout } from '../render/layout';
import { menuPages } from '../lib/db';
import { Hono } from 'hono';
import type { Env, Page, Post } from '../types';
import { requireAuth, hashPassword, verifyPassword, startSession, endSession, currentUser } from '../lib/auth';
import { getSettings, saveSettings, listPages, getPageById, listPosts, getPostById, snapshot, slugify } from '../lib/db';
import { guard, guardDeep } from '../lib/style-guard';
import { BLOCK_TYPES, newBlock } from '../lib/defaults';

type Vars = { Bindings: Env; Variables: { uid: number } };
const api = new Hono<Vars>();

// ---------- Auth ----------
api.get('/auth/me', async (c) => {
  const users = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  const uid = await currentUser(c);
  return c.json({ signedIn: !!uid, needsSetup: (users?.n ?? 0) === 0 });
});

api.post('/auth/setup', async (c) => {
  const users = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((users?.n ?? 0) > 0) return c.json({ error: 'Already set up.' }, 400);
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password || password.length < 10) return c.json({ error: 'Use an email and a password of at least 10 characters.' }, 400);
  const r = await c.env.DB.prepare('INSERT INTO users (email, password_hash) VALUES (?, ?) RETURNING id')
    .bind(email.toLowerCase().trim(), await hashPassword(password)).first<{ id: number }>();
  await startSession(c, r!.id);
  return c.json({ ok: true });
});

api.post('/auth/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const k = `rl:login:${ip}`;
  const tries = Number((await c.env.KV.get(k)) || 0);
  if (tries >= 10) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const u = await c.env.DB.prepare('SELECT id, password_hash FROM users WHERE email = ?').bind(String(email || '').toLowerCase().trim()).first<{ id: number; password_hash: string }>();
  if (!u || !(await verifyPassword(String(password || ''), u.password_hash))) {
    await c.env.KV.put(k, String(tries + 1), { expirationTtl: 900 });
    return c.json({ error: 'That email and password do not match.' }, 401);
  }
  await startSession(c, u.id);
  return c.json({ ok: true });
});

api.post('/auth/logout', async (c) => { await endSession(c); return c.json({ ok: true }); });

// Everything below needs a signed-in owner.
api.use('/*', async (c, next) => (c.req.path.startsWith('/api/auth/') ? next() : requireAuth(c, next)));

api.route('/ai', aiRoutes);

// ---------- Settings ----------
api.get('/settings', async (c) => c.json(await getSettings(c.env)));
api.put('/settings', async (c) => {
  const body = guardDeep(await c.req.json());
  const current = await getSettings(c.env);
  const next = { ...current, ...body, theme: { ...current.theme, ...(body.theme || {}) } };
  await saveSettings(c.env, next);
  return c.json(next);
});

// ---------- Blocks ----------
api.get('/blocks', (c) => c.json(Object.entries(BLOCK_TYPES).map(([type, v]) => ({ type, label: v.label }))));
api.get('/blocks/new/:type', (c) => {
  if (!BLOCK_TYPES[c.req.param('type')]) return c.json({ error: 'Unknown block' }, 404);
  return c.json(newBlock(c.req.param('type')));
});

// ---------- Pages ----------
api.get('/pages', async (c) => c.json(await listPages(c.env)));
api.get('/pages/:id{[0-9]+}', async (c) => {
  const p = await getPageById(c.env, Number(c.req.param('id')));
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
api.post('/pages', async (c) => {
  const b = guardDeep(await c.req.json<Partial<Page>>());
  const title = b.title?.trim() || 'New page';
  let slug = slugify(b.slug || title);
  const exists = await c.env.DB.prepare('SELECT 1 FROM pages WHERE slug = ?').bind(slug).first();
  if (exists) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const blocks = b.blocks ?? [newBlock('text')];
  const r = await c.env.DB.prepare('INSERT INTO pages (slug, title, blocks, in_menu) VALUES (?, ?, ?, ?) RETURNING id')
    .bind(slug, title, JSON.stringify(blocks), b.in_menu ? 1 : 0).first<{ id: number }>();
  return c.json(await getPageById(c.env, r!.id), 201);
});
api.put('/pages/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPageById(c.env, id);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const b = guardDeep(await c.req.json<Partial<Page>>());
  const next = { ...cur, ...b };
  next.slug = cur.slug === 'home' ? 'home' : slugify(next.slug);
  await snapshot(c.env, 'page', id, cur);
  await c.env.DB.prepare("UPDATE pages SET slug=?, title=?, status=?, in_menu=?, menu_order=?, blocks=?, seo=?, updated_at=datetime('now') WHERE id=?")
    .bind(next.slug, next.title, next.status, next.in_menu ? 1 : 0, next.menu_order ?? 0, JSON.stringify(next.blocks), JSON.stringify(next.seo || {}), id).run();
  return c.json(await getPageById(c.env, id));
});
api.delete('/pages/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPageById(c.env, id);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  if (cur.slug === 'home') return c.json({ error: 'The home page can be edited but not deleted.' }, 400);
  await snapshot(c.env, 'page', id, cur, 'deleted');
  await c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---------- Posts ----------
api.get('/posts', async (c) => c.json(await listPosts(c.env, { status: c.req.query('status') || undefined })));
api.get('/posts/:id{[0-9]+}', async (c) => {
  const p = await getPostById(c.env, Number(c.req.param('id')));
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
api.post('/posts', async (c) => {
  const b = guardDeep(await c.req.json<Partial<Post>>());
  const title = b.title?.trim() || 'Untitled';
  let slug = slugify(b.slug || title);
  if (await c.env.DB.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const r = await c.env.DB.prepare('INSERT INTO posts (slug, title, excerpt, body, status, source, tags) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(slug, title, b.excerpt || '', b.body || '', b.status || 'draft', b.source || 'manual', JSON.stringify(b.tags || [])).first<{ id: number }>();
  return c.json(await getPostById(c.env, r!.id), 201);
});
api.put('/posts/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPostById(c.env, id);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const b = guardDeep(await c.req.json<Partial<Post>>());
  const next = { ...cur, ...b };
  if (cur.slug.startsWith('untitled') && (!b.slug || b.slug === cur.slug) && next.title && next.title !== 'Untitled' && !cur.published_at) next.slug = next.title;
  next.slug = slugify(next.slug);
  if (next.slug !== cur.slug && (await c.env.DB.prepare('SELECT 1 FROM posts WHERE slug = ? AND id != ?').bind(next.slug, id).first())) next.slug = `${next.slug}-${id}`;
  if (next.status === 'published' && !next.published_at) next.published_at = new Date().toISOString().slice(0, 19).replace('T', ' ');
  if (next.status !== 'published') next.published_at = next.status === 'scheduled' ? null : cur.status === 'published' ? null : next.published_at;
  await snapshot(c.env, 'post', id, cur);
  await c.env.DB.prepare("UPDATE posts SET slug=?, title=?, excerpt=?, body=?, cover=?, tags=?, status=?, publish_at=?, published_at=?, updated_at=datetime('now') WHERE id=?")
    .bind(next.slug, next.title, next.excerpt, next.body, next.cover ?? null, JSON.stringify(next.tags || []), next.status, next.publish_at ?? null, next.published_at ?? null, id).run();
  return c.json(await getPostById(c.env, id));
});
api.delete('/posts/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPostById(c.env, id);
  if (cur) await snapshot(c.env, 'post', id, cur, 'deleted');
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---------- Revisions ----------
api.get('/revisions/:entity/:id{[0-9]+}', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, note, created_at FROM revisions WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 50')
    .bind(c.req.param('entity'), Number(c.req.param('id'))).all();
  return c.json(results);
});
api.get('/revision/:rid{[0-9]+}', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM revisions WHERE id = ?').bind(Number(c.req.param('rid'))).first<any>();
  return r ? c.json({ ...r, data: JSON.parse(r.data) }) : c.json({ error: 'Not found' }, 404);
});

// ---------- Media ----------
api.get('/media', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM media ORDER BY id DESC LIMIT 500').all();
  return c.json(results);
});
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)|application\/pdf|video\/(mp4|webm)|audio\/mpeg)$/;
api.post('/media', async (c) => {
  const form = await c.req.parseBody();
  const file = form.file as File | undefined;
  if (!file || typeof file === 'string') return c.json({ error: 'No file.' }, 400);
  if (!ALLOWED.test(file.type)) return c.json({ error: `Files of type ${file.type || 'unknown'} are not allowed.` }, 400);
  if (file.size > 25 * 1024 * 1024) return c.json({ error: 'Files must be under 25 MB.' }, 400);
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '');
  const key = `${new Date().toISOString().slice(0, 7)}/${crypto.randomUUID().slice(0, 8)}-${slugify(file.name.replace(/\.[^.]+$/, ''))}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: file.type } });
  const r = await c.env.DB.prepare('INSERT INTO media (key, name, type, size, alt) VALUES (?, ?, ?, ?, ?) RETURNING *')
    .bind(key, file.name, file.type, file.size, String(form.alt || '')).first();
  return c.json(r, 201);
});
api.put('/media/:id{[0-9]+}', async (c) => {
  const { alt } = guardDeep(await c.req.json<{ alt: string }>());
  await c.env.DB.prepare('UPDATE media SET alt = ? WHERE id = ?').bind(alt || '', Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
api.delete('/media/:id{[0-9]+}', async (c) => {
  const m = await c.env.DB.prepare('SELECT key FROM media WHERE id = ?').bind(Number(c.req.param('id'))).first<{ key: string }>();
  if (m) { await c.env.MEDIA.delete(m.key); await c.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(Number(c.req.param('id'))).run(); }
  return c.json({ ok: true });
});

// ---------- Messages from the contact form ----------
api.get('/messages', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 200').all();
  return c.json(results);
});
api.put('/messages/:id{[0-9]+}', async (c) => {
  await c.env.DB.prepare('UPDATE messages SET read = 1 WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});
api.delete('/messages/:id{[0-9]+}', async (c) => {
  await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

// ---------- Style check ----------
api.post('/guard', async (c) => {
  const { text } = await c.req.json<{ text: string }>();
  return c.json(guard(String(text || '')));
});

// ---------- Dashboard ----------
api.get('/stats', async (c) => {
  const q = (sql: string) => c.env.DB.prepare(sql).first<{ n: number }>().then((r) => r?.n ?? 0);
  const [pages, published, drafts, review, unread] = await Promise.all([
    q('SELECT COUNT(*) n FROM pages'), q("SELECT COUNT(*) n FROM posts WHERE status='published'"),
    q("SELECT COUNT(*) n FROM posts WHERE status='draft'"), q("SELECT COUNT(*) n FROM posts WHERE status IN ('review','idea')"),
    q('SELECT COUNT(*) n FROM messages WHERE read = 0'),
  ]);
  return c.json({ pages, published, drafts, review, unread });
});


// ---------- Live preview for the visual editor ----------
api.post('/preview', async (c) => {
  const b = await c.req.json<{ slug?: string; title?: string; blocks?: any[]; theme?: any; settings?: any; edit?: boolean }>();
  const s = await getSettings(c.env);
  const settings = { ...s, ...(b.settings || {}), theme: { ...s.theme, ...(b.theme || {}) } };
  let blocks = b.blocks;
  if (!blocks) {
    const home = await c.env.DB.prepare("SELECT blocks FROM pages WHERE slug = ?").bind(b.slug || 'home').first<{ blocks: string }>();
    blocks = home ? JSON.parse(home.blocks) : [];
  }
  const [menu, posts] = await Promise.all([menuPages(c.env), listPosts(c.env, { status: 'published', limit: 12 })]);
  const edit = b.edit !== false;
  const html = layout(settings, { title: b.title || '', path: '/' + (b.slug === 'home' ? '' : b.slug || ''), menu, body: renderBlocks(guardDeep(blocks!), { edit, posts }), edit, siteUrl: '' });
  return c.html(html);
});

export default api;
