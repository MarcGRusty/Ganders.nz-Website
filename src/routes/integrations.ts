// Studio: manage connections to outside systems. Secrets go in, never come back out.
import { Hono } from 'hono';
import type { Env } from '../types';
import { need, audit } from '../lib/auth';
import { seal } from '../lib/crypto';
import { EVENTS, safeUrl, callApi, sendWebhook, logIntegration, type Integration } from '../lib/integrations';

type Vars = { Bindings: Env; Variables: { uid: number; user: any } };
const r = new Hono<Vars>();
r.use('*', need('integrations.manage'));

const KINDS = ['api', 'webhook_out', 'webhook_in'];
const AUTHS = ['none', 'bearer', 'header', 'query', 'basic'];
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 40);

const view = (it: Integration & Record<string, any>, origin: string) => {
  const { enc_secret, token: tk, ...rest } = it;
  return { ...rest, hasSecret: !!enc_secret, headers: JSON.parse(it.headers || '{}'), events: JSON.parse(it.events || '[]'), address: tk ? `${origin}/hook/${tk}` : null };
};

r.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM integrations ORDER BY kind, name').all<Integration>();
  return c.json({ items: results.map((i) => view(i, new URL(c.req.url).origin)), events: EVENTS, canStoreKeys: !!c.env.APP_KEY });
});

async function clean(c: any, b: any, cur?: Integration) {
  const kind = cur?.kind || b.kind;
  if (!KINDS.includes(kind)) throw new Error('Pick what kind of connection this is.');
  const name = String(b.name ?? cur?.name ?? '').trim().slice(0, 80);
  if (!name) throw new Error('Give it a name.');
  let url: string | null = cur?.url ?? null;
  if (kind !== 'webhook_in' && b.url !== undefined) url = safeUrl(b.url).href;
  if (kind !== 'webhook_in' && !url) throw new Error('Add the address.');
  const auth = kind === 'api' ? (AUTHS.includes(b.auth) ? b.auth : cur?.auth || 'none') : 'none';
  const headers: Record<string, string> = {};
  for (const [k, v] of Object.entries(b.headers ?? JSON.parse(cur?.headers || '{}'))) {
    if (!/^[a-z0-9-]{1,60}$/i.test(k)) throw new Error(`"${k}" is not a valid header name.`);
    if (/^(authorization|cookie|host)$/i.test(k)) throw new Error(`Put the ${k} value in the key field so it is stored encrypted.`);
    headers[k] = String(v).slice(0, 500);
  }
  const events = kind === 'webhook_out' ? (Array.isArray(b.events) ? b.events : JSON.parse(cur?.events || '[]')).filter((e: string) => EVENTS.some((x) => x.id === e)) : [];
  let enc = cur?.enc_secret ?? null;
  if (b.secret === null) enc = null;
  else if (typeof b.secret === 'string' && b.secret.trim()) {
    if (!c.env.APP_KEY) throw new Error('Keys cannot be saved until the APP_KEY secret is set.');
    enc = await seal(c.env.APP_KEY, b.secret.trim());
  }
  return {
    kind, name, url, auth, auth_name: String(b.auth_name ?? cur?.auth_name ?? '').trim().slice(0, 60) || null, enc,
    headers: JSON.stringify(headers), events: JSON.stringify(events),
    action: kind === 'webhook_in' ? (b.action === 'knowledge' ? 'knowledge' : b.action === 'inbox' ? 'inbox' : cur?.action || 'inbox') : null,
    active: b.active === undefined ? (cur?.active ?? 1) : b.active ? 1 : 0,
  };
}

r.post('/', async (c) => {
  try {
    const v = await clean(c, await c.req.json());
    const row = await c.env.DB.prepare('INSERT INTO integrations (kind, name, url, auth, auth_name, enc_secret, headers, events, token, action, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *')
      .bind(v.kind, v.name, v.url, v.auth, v.auth_name, v.enc, v.headers, v.events, v.kind === 'webhook_in' ? token() : null, v.action, v.active).first<Integration>();
    await audit(c, 'integration.create', `${v.kind}: ${v.name}`);
    return c.json(view(row!, new URL(c.req.url).origin), 201);
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

r.put('/:id{[0-9]+}', async (c) => {
  const cur = await c.env.DB.prepare('SELECT * FROM integrations WHERE id = ?').bind(Number(c.req.param('id'))).first<Integration>();
  if (!cur) return c.json({ error: 'Not found' }, 404);
  try {
    const b = await c.req.json();
    const v = await clean(c, b, cur);
    const tk = b.newAddress && cur.kind === 'webhook_in' ? token() : cur.token;
    const row = await c.env.DB.prepare("UPDATE integrations SET name=?, url=?, auth=?, auth_name=?, enc_secret=?, headers=?, events=?, token=?, action=?, active=?, updated_at=datetime('now') WHERE id=? RETURNING *")
      .bind(v.name, v.url, v.auth, v.auth_name, v.enc, v.headers, v.events, tk, v.action, v.active, cur.id).first<Integration>();
    await audit(c, 'integration.update', v.name);
    return c.json(view(row!, new URL(c.req.url).origin));
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

r.delete('/:id{[0-9]+}', async (c) => {
  const cur = await c.env.DB.prepare('SELECT name FROM integrations WHERE id = ?').bind(Number(c.req.param('id'))).first<{ name: string }>();
  await c.env.DB.prepare('DELETE FROM integrations WHERE id = ?').bind(Number(c.req.param('id'))).run();
  if (cur) await audit(c, 'integration.delete', cur.name);
  return c.json({ ok: true });
});

r.get('/:id{[0-9]+}/log', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM integration_log WHERE integration_id = ? ORDER BY id DESC LIMIT 50').bind(Number(c.req.param('id'))).all();
  return c.json(results);
});

/** api: call it (optionally a path) and show what came back. webhook_out: send a test event. */
r.post('/:id{[0-9]+}/test', async (c) => {
  const it = await c.env.DB.prepare('SELECT * FROM integrations WHERE id = ?').bind(Number(c.req.param('id'))).first<Integration>();
  if (!it) return c.json({ error: 'Not found' }, 404);
  const { path } = await c.req.json<{ path?: string }>().catch(() => ({ path: '' }));
  if (it.kind === 'webhook_out') {
    const ok = await sendWebhook(c.env, it, 'test.ping', { note: 'A test from Studio. Nothing happened on the site.' }, 'test');
    return c.json({ ok, note: ok ? 'Delivered.' : 'It did not accept the test. See the log for what they answered.' });
  }
  if (it.kind === 'webhook_in') return c.json({ ok: false, note: 'Send something to its address to test an incoming webhook.' });
  try {
    const res = await callApi(c.env, it, String(path || ''));
    await logIntegration(c.env, it.id, 'test', res.ok, res.status, `Answered ${res.status}.`);
    const preview = typeof res.data === 'string' ? res.data.slice(0, 4000) : JSON.stringify(res.data, null, 2).slice(0, 8000);
    return c.json({ ok: res.ok, status: res.status, preview });
  } catch (e) { return c.json({ ok: false, note: (e as Error).message }); }
});

export default r;
