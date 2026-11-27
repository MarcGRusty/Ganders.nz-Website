import aiRoutes from './ai';
import { renderBlocks } from '../render/blocks';
import { layout } from '../render/layout';
import { menuPages } from '../lib/db';
import { Hono } from 'hono';
import type { Env, Page, Post } from '../types';
import { requireAuth, hashPassword, verifyPassword, startSession, endSession, loadUser, need, can, audit } from '../lib/auth';
import peopleRoutes from './people';
import inspireRoutes from './inspire';
import { knowledge as knowledgeRoutes, ideas as ideasRoutes } from './ideas';
import { ensureSeed, getSettings, saveSettings, listPages, getPageById, listPosts, getPostById, snapshot, slugify } from '../lib/db';
import { guard, guardDeep } from '../lib/style-guard';
import { BLOCK_TYPES, newBlock } from '../lib/defaults';
import { normalizeTheme, PRESETS } from '../lib/themes';
import { autoFocus } from '../lib/focus';
import { loadFocus } from '../render/focus';
import { sendMail, mailReady, ownerAddress, fromAddress, wrapHtml, textToHtml } from '../lib/mail';

type Vars = { Bindings: Env; Variables: { uid: number; user: any } };
const api = new Hono<Vars>();

// ---------- Auth ----------
// On a deployed site the first Owner comes from the OWNER_EMAIL and ADMIN_PASSWORD secrets, so
// nobody else can claim the site before Marc signs in. Without them, the setup screen does the job.
const presetOwner = (env: Env) => !!(env.OWNER_EMAIL && env.ADMIN_PASSWORD);
async function ensureOwner(env: Env) {
  if (!presetOwner(env)) return;
  const users = await env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((users?.n ?? 0) > 0) return;
  const r = await env.DB.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?) RETURNING id')
    .bind(env.OWNER_EMAIL!.toLowerCase().trim(), await hashPassword(env.ADMIN_PASSWORD!), 'Marc').first<{ id: number }>();
  await env.DB.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'Owner'").bind(r!.id).run();
}

api.get('/auth/me', async (c) => {
  await ensureOwner(c.env);
  const users = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  const u = await loadUser(c);
  return c.json({ signedIn: !!u, needsSetup: (users?.n ?? 0) === 0, user: u ? { id: u.id, email: u.email, name: u.name, perms: [...u.perms], mustChange: u.mustChange } : null });
});

api.post('/auth/setup', async (c) => {
  if (presetOwner(c.env)) return c.json({ error: 'Already set up. Sign in with your email.' }, 400);
  const users = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM users').first<{ n: number }>();
  if ((users?.n ?? 0) > 0) return c.json({ error: 'Already set up.' }, 400);
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  if (!email || !password || password.length < 10) return c.json({ error: 'Use an email and a password of at least 10 characters.' }, 400);
  const r = await c.env.DB.prepare('INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?) RETURNING id')
    .bind(email.toLowerCase().trim(), await hashPassword(password), 'Marc').first<{ id: number }>();
  // The first person is the Owner.
  await c.env.DB.prepare("INSERT INTO user_roles (user_id, role_id) SELECT ?, id FROM roles WHERE name = 'Owner'").bind(r!.id).run();
  await startSession(c, r!.id);
  return c.json({ ok: true });
});

api.post('/auth/login', async (c) => {
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const k = `rl:login:${ip}`;
  const tries = Number((await c.env.KV.get(k)) || 0);
  if (tries >= 10) return c.json({ error: 'Too many attempts. Try again in 15 minutes.' }, 429);
  await ensureOwner(c.env);
  const { email, password } = await c.req.json<{ email: string; password: string }>();
  const u = await c.env.DB.prepare('SELECT id, password_hash, active FROM users WHERE email = ?').bind(String(email || '').toLowerCase().trim()).first<{ id: number; password_hash: string; active: number }>();
  if (!u || !u.active || !(await verifyPassword(String(password || ''), u.password_hash))) {
    await c.env.KV.put(k, String(tries + 1), { expirationTtl: 900 });
    return c.json({ error: 'That email and password do not match.' }, 401);
  }
  await startSession(c, u.id);
  await c.env.DB.prepare("UPDATE users SET last_login = datetime('now') WHERE id = ?").bind(u.id).run();
  return c.json({ ok: true });
});

api.post('/auth/logout', async (c) => { await endSession(c); return c.json({ ok: true }); });

// Everything below needs a signed-in owner.
api.use('/*', async (c, next) => (c.req.path.startsWith('/api/auth/') ? next() : requireAuth(c, next)));

api.route('/ai', aiRoutes);
api.route('/people', peopleRoutes);
api.route('/inspiration', inspireRoutes);
api.route('/knowledge', knowledgeRoutes);
api.route('/ideas', ideasRoutes);

// ---------- Settings ----------
api.get('/settings', async (c) => c.json(await getSettings(c.env)));
api.put('/settings', async (c) => {
  const body = guardDeep(await c.req.json());
  const designOnly = Object.keys(body).every((k) => ['theme', 'themes', 'logo', 'favicon'].includes(k));
  if (!can(c, designOnly ? 'design.edit' : 'settings.edit')) return c.json({ error: 'Your role does not allow this.' }, 403);
  const current = await getSettings(c.env);
  const next = { ...current, ...body, theme: body.theme ? normalizeTheme({ ...current.theme, ...body.theme }) : current.theme, themes: Array.isArray(body.themes) ? body.themes.slice(0, 30).map(normalizeTheme) : current.themes };
  await saveSettings(c.env, next);
  return c.json(next);
});

api.get('/themes', (c) => c.json(PRESETS));

// ---------- Blocks ----------
api.get('/blocks', (c) => c.json(Object.entries(BLOCK_TYPES).map(([type, v]) => ({ type, label: v.label }))));
api.get('/blocks/new/:type', (c) => {
  if (!BLOCK_TYPES[c.req.param('type')]) return c.json({ error: 'Unknown block' }, 404);
  return c.json(newBlock(c.req.param('type')));
});

// ---------- Pages ----------
api.get('/pages', need('pages.view'), async (c) => { await ensureSeed(c.env); return c.json(await listPages(c.env)); });
api.get('/pages/:id{[0-9]+}', need('pages.view'), async (c) => {
  const p = await getPageById(c.env, Number(c.req.param('id')));
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
api.post('/pages', need('pages.delete'), async (c) => {
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
api.put('/pages/:id{[0-9]+}', need('pages.edit'), async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPageById(c.env, id);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const b = guardDeep(await c.req.json<Partial<Page>>());
  const next = { ...cur, ...b };
  // Changing a live page, or putting one live, needs publish rights.
  if ((cur.status === 'published' || next.status === 'published') && !can(c, 'pages.publish'))
    return c.json({ error: 'This page is live, so saving it needs publish rights. Ask the site owner.' }, 403);
  next.slug = cur.slug === 'home' ? 'home' : slugify(next.slug);
  await snapshot(c.env, 'page', id, cur);
  await c.env.DB.prepare("UPDATE pages SET slug=?, title=?, status=?, in_menu=?, menu_order=?, blocks=?, seo=?, updated_at=datetime('now') WHERE id=?")
    .bind(next.slug, next.title, next.status, next.in_menu ? 1 : 0, next.menu_order ?? 0, JSON.stringify(next.blocks), JSON.stringify(next.seo || {}), id).run();
  return c.json(await getPageById(c.env, id));
});
api.delete('/pages/:id{[0-9]+}', need('pages.delete'), async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPageById(c.env, id);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  if (cur.slug === 'home') return c.json({ error: 'The home page can be edited but not deleted.' }, 400);
  await snapshot(c.env, 'page', id, cur, 'deleted');
  await c.env.DB.prepare('DELETE FROM pages WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---------- Posts ----------
api.get('/posts', need('posts.view'), async (c) => c.json(await listPosts(c.env, { status: c.req.query('status') || undefined })));
api.get('/posts/:id{[0-9]+}', need('posts.view'), async (c) => {
  const p = await getPostById(c.env, Number(c.req.param('id')));
  return p ? c.json(p) : c.json({ error: 'Not found' }, 404);
});
api.post('/posts', need('posts.edit'), async (c) => {
  const b = guardDeep(await c.req.json<Partial<Post>>());
  const title = b.title?.trim() || 'Untitled';
  let slug = slugify(b.slug || title);
  if (await c.env.DB.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const r = await c.env.DB.prepare('INSERT INTO posts (slug, title, excerpt, body, status, source, tags) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(slug, title, b.excerpt || '', b.body || '', b.status || 'draft', b.source || 'manual', JSON.stringify(b.tags || [])).first<{ id: number }>();
  return c.json(await getPostById(c.env, r!.id), 201);
});
api.put('/posts/:id{[0-9]+}', need('posts.edit'), async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPostById(c.env, id);
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const b = guardDeep(await c.req.json<Partial<Post>>());
  const next = { ...cur, ...b };
  if ((['published', 'scheduled'].includes(cur.status) || ['published', 'scheduled'].includes(next.status)) && !can(c, 'posts.publish'))
    return c.json({ error: 'Publishing and scheduling need publish rights. Set it to "Ready for review" instead.' }, 403);
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
api.delete('/posts/:id{[0-9]+}', need('posts.delete'), async (c) => {
  const id = Number(c.req.param('id'));
  const cur = await getPostById(c.env, id);
  if (cur) await snapshot(c.env, 'post', id, cur, 'deleted');
  await c.env.DB.prepare('DELETE FROM posts WHERE id = ?').bind(id).run();
  return c.json({ ok: true });
});

// ---------- Revisions ----------
api.get('/revisions/:entity/:id{[0-9]+}', async (c) => {
  if (!can(c, `${c.req.param('entity') === 'post' ? 'posts' : c.req.param('entity') === 'settings' ? 'settings' : 'pages'}.${c.req.param('entity') === 'settings' ? 'edit' : 'view'}`)) return c.json({ error: 'Not allowed.' }, 403);
  const { results } = await c.env.DB.prepare('SELECT id, note, created_at FROM revisions WHERE entity = ? AND entity_id = ? ORDER BY id DESC LIMIT 50')
    .bind(c.req.param('entity'), Number(c.req.param('id'))).all();
  return c.json(results);
});
api.get('/revision/:rid{[0-9]+}', async (c) => {
  const r = await c.env.DB.prepare('SELECT * FROM revisions WHERE id = ?').bind(Number(c.req.param('rid'))).first<any>();
  return r ? c.json({ ...r, data: JSON.parse(r.data) }) : c.json({ error: 'Not found' }, 404);
});

// ---------- Media ----------
api.get('/media', need('media.view'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM media ORDER BY id DESC LIMIT 500').all();
  return c.json(results);
});
const ALLOWED = /^(image\/(png|jpe?g|gif|webp|avif|svg\+xml|x-icon|vnd\.microsoft\.icon)|application\/pdf|video\/(mp4|webm)|audio\/mpeg)$/;
api.post('/media', need('media.upload'), async (c) => {
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
  // Find faces for smart cropping in the background, so the upload returns straight away.
  if (/^image\/(jpe?g|png|webp)$/.test(file.type)) c.executionCtx.waitUntil(autoFocus(c.env, key));
  return c.json(r, 201);
});
api.put('/media/:id{[0-9]+}', need('media.upload'), async (c) => {
  const b = guardDeep(await c.req.json<{ alt?: string; focus?: { x: number; y: number } | null }>());
  const id = Number(c.req.param('id'));
  if (b.alt !== undefined) await c.env.DB.prepare('UPDATE media SET alt = ? WHERE id = ?').bind(b.alt || '', id).run();
  if (b.focus === null) await c.env.DB.prepare("UPDATE media SET focus_x = NULL, focus_y = NULL, focus_source = 'manual' WHERE id = ?").bind(id).run();
  else if (b.focus) {
    const clamp = (v: number) => Math.round(Math.min(100, Math.max(0, Number(v) || 0)) * 10) / 10;
    await c.env.DB.prepare("UPDATE media SET focus_x = ?, focus_y = ?, focus_source = 'manual' WHERE id = ?").bind(clamp(b.focus.x), clamp(b.focus.y), id).run();
  }
  return c.json(await c.env.DB.prepare('SELECT * FROM media WHERE id = ?').bind(id).first());
});
api.post('/media/:id{[0-9]+}/focus', need('media.upload'), async (c) => {
  const m = await c.env.DB.prepare('SELECT key FROM media WHERE id = ?').bind(Number(c.req.param('id'))).first<{ key: string }>();
  if (!m) return c.json({ error: 'Not found' }, 404);
  if (!c.env.AI) return c.json({ error: 'Face finding runs on the live site, not in local testing.' }, 400);
  const f = await autoFocus(c.env, m.key, true);
  return c.json({ focus: f, media: await c.env.DB.prepare('SELECT * FROM media WHERE key = ?').bind(m.key).first() });
});
api.delete('/media/:id{[0-9]+}', need('media.delete'), async (c) => {
  const m = await c.env.DB.prepare('SELECT key FROM media WHERE id = ?').bind(Number(c.req.param('id'))).first<{ key: string }>();
  if (m) { await c.env.MEDIA.delete(m.key); await c.env.DB.prepare('DELETE FROM media WHERE id = ?').bind(Number(c.req.param('id'))).run(); }
  return c.json({ ok: true });
});

// ---------- Inbox: everything people send through forms ----------
const STATUSES = ['new', 'open', 'replied', 'done', 'spam'];
api.get('/messages', need('messages.view'), async (c) => {
  const st = c.req.query('status');
  const q = st && STATUSES.includes(st)
    ? c.env.DB.prepare('SELECT * FROM messages WHERE status = ? ORDER BY id DESC LIMIT 300').bind(st)
    : st === 'all' ? c.env.DB.prepare('SELECT * FROM messages ORDER BY id DESC LIMIT 300')
    : c.env.DB.prepare("SELECT * FROM messages WHERE status NOT IN ('done','spam') ORDER BY id DESC LIMIT 300");
  const { results } = await q.all();
  const counts = await c.env.DB.prepare('SELECT status, COUNT(*) n FROM messages GROUP BY status').all<{ status: string; n: number }>();
  return c.json({ items: results, counts: Object.fromEntries(counts.results.map((r) => [r.status, r.n])), mail: mailReady(c.env) });
});
api.get('/messages/:id{[0-9]+}', need('messages.view'), async (c) => {
  const id = Number(c.req.param('id'));
  const m = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<any>();
  if (!m) return c.json({ error: 'Not found' }, 404);
  if (m.status === 'new' && can(c, 'messages.reply')) {
    await c.env.DB.prepare("UPDATE messages SET status = 'open', read = 1, updated_at = datetime('now') WHERE id = ?").bind(id).run();
    m.status = 'open';
  }
  const { results } = await c.env.DB.prepare('SELECT r.*, u.name AS by_name FROM message_replies r LEFT JOIN users u ON u.id = r.sent_by WHERE message_id = ? ORDER BY r.id').bind(id).all();
  return c.json({ ...m, data: m.data ? JSON.parse(m.data) : null, replies: results, mail: mailReady(c.env) });
});
api.put('/messages/:id{[0-9]+}', need('messages.reply'), async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ status?: string; notes?: string }>().catch(() => ({} as any));
  if (b.status && !STATUSES.includes(b.status)) return c.json({ error: 'Unknown status.' }, 400);
  await c.env.DB.prepare("UPDATE messages SET status = COALESCE(?, status), notes = COALESCE(?, notes), read = 1, updated_at = datetime('now') WHERE id = ?")
    .bind(b.status ?? null, b.notes != null ? guard(String(b.notes)).text.slice(0, 5000) : null, id).run();
  if (b.status) await audit(c, 'message.status', `#${id} ${b.status}`);
  return c.json({ ok: true });
});
api.post('/messages/:id{[0-9]+}/reply', need('messages.reply'), async (c) => {
  const id = Number(c.req.param('id'));
  const m = await c.env.DB.prepare('SELECT * FROM messages WHERE id = ?').bind(id).first<any>();
  if (!m) return c.json({ error: 'Not found' }, 404);
  const { body } = await c.req.json<{ body: string }>();
  const text = guard(String(body || '')).text.trim();
  if (!text) return c.json({ error: 'Write a reply first.' }, 400);
  const settings = await getSettings(c.env);
  const replyTo = await ownerAddress(c.env, settings.email);
  const quoted = m.body.split('\n').map((l: string) => `> ${l}`).join('\n');
  const r = await sendMail(c.env, {
    to: m.email, subject: `Re: your message to ${settings.name}`, replyTo: replyTo || undefined, kind: 'reply',
    text: `${text}\n\n${quoted}`,
    html: wrapHtml(`${textToHtml(text)}<div style="margin-top:22px;padding-left:12px;border-left:3px solid #D5DBDA;color:#55646B">${textToHtml(m.body)}</div>`),
  }, settings.name);
  await c.env.DB.prepare('INSERT INTO message_replies (message_id, body, sent_by, ok, error) VALUES (?, ?, ?, ?, ?)').bind(id, text, c.get('uid'), r.ok ? 1 : 0, r.error ?? null).run();
  if (!r.ok) return c.json({ error: `The email did not send. ${r.error || ''}`.trim() }, 502);
  await c.env.DB.prepare("UPDATE messages SET status = 'replied', read = 1, updated_at = datetime('now') WHERE id = ?").bind(id).run();
  await audit(c, 'message.reply', `#${id} to ${m.email}`);
  return c.json({ ok: true });
});
api.delete('/messages/:id{[0-9]+}', need('messages.delete'), async (c) => {
  await c.env.DB.prepare('DELETE FROM message_replies WHERE message_id = ?').bind(Number(c.req.param('id'))).run();
  await c.env.DB.prepare('DELETE FROM messages WHERE id = ?').bind(Number(c.req.param('id'))).run();
  await audit(c, 'message.delete', `#${c.req.param('id')}`);
  return c.json({ ok: true });
});

// ---------- Email ----------
api.get('/mail', need('mail.manage'), async (c) => {
  const s = await getSettings(c.env);
  const { results } = await c.env.DB.prepare('SELECT * FROM mail_log ORDER BY id DESC LIMIT 30').all();
  return c.json({ ready: mailReady(c.env), from: fromAddress(c.env, s.name), to: await ownerAddress(c.env, s.email), log: results });
});
api.post('/mail/test', need('mail.manage'), async (c) => {
  const s = await getSettings(c.env);
  const user = c.get('user');
  const r = await sendMail(c.env, { to: user.email, subject: 'Test email from your website', kind: 'test', text: `Kia ora ${user.name || ''},\n\nThis is a test from ${s.name}. If you are reading it, email from the site works.` }, s.name);
  return r.ok ? c.json({ ok: true, to: user.email }) : c.json({ error: `The email did not send. ${r.error || ''}`.trim() }, 502);
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
    q("SELECT COUNT(*) n FROM messages WHERE status = 'new'"),
  ]);
  return c.json({ pages, published, drafts, review, unread });
});


// ---------- Live preview for the visual editor ----------
api.post('/preview', async (c) => {
  const b = await c.req.json<{ slug?: string; title?: string; blocks?: any[]; theme?: any; settings?: any; edit?: boolean }>();
  const s = await getSettings(c.env);
  await loadFocus(c.env);
  const settings = { ...s, ...(b.settings || {}), theme: b.theme ? normalizeTheme({ ...s.theme, ...b.theme }) : s.theme };
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
