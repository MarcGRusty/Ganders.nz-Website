// Studio: connect social accounts, write per-network versions, and share now or later.
import { Hono } from 'hono';
import type { Env } from '../types';
import { need, can, audit } from '../lib/auth';
import { generate, extractJson } from '../ai/router';
import { stripDashes } from '../lib/style-guard';
import { getPostById } from '../lib/db';
import { NETWORKS, OAUTH_APPS, oauthStart, oauthConnect, getApp, saveApp, saveAccount, metaAuthorizeUrl, metaConnect, blueskyLogin, mastodonCheck, processQueue, type Network, type Image } from '../lib/social';

type Vars = { Bindings: Env; Variables: { uid: number; user: any } };
const r = new Hono<Vars>();

const origin = (c: any) => new URL(c.req.url).origin;
const callback = (c: any, p = 'meta') => `${origin(c)}/api/social/${p === 'meta' ? 'meta' : `oauth/${p}`}/callback`;
const isNet = (n: unknown): n is Network => NETWORKS.some((x) => x.id === n);
const textOf = (html: string) => html.replace(/<\/(p|h\d|li|blockquote)>/gi, '\n\n').replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/\n{3,}/g, '\n\n').trim();

r.get('/', need('social.post'), async (c) => {
  const [{ results: accounts }, { results: queue }, meta, x, linkedin] = await Promise.all([
    c.env.DB.prepare('SELECT network, name, ref, connected_at FROM social_accounts').all(),
    c.env.DB.prepare('SELECT s.id, s.batch, s.post_id, s.network, s.body, s.link, s.images, s.status, s.send_at, s.tries, s.result_url, s.error, s.created_at, s.sent_at, p.title AS post_title FROM social_posts s LEFT JOIN posts p ON p.id = s.post_id ORDER BY s.id DESC LIMIT 60').all(),
    getApp(c.env, 'meta'), getApp(c.env, 'x'), getApp(c.env, 'linkedin'),
  ]);
  const oauth = (a: Record<string, string> | null) => (a ? { clientId: a.clientId, hasSecret: !!a.clientSecret } : null);
  return c.json({
    networks: NETWORKS, accounts, queue: queue.map((q: any) => ({ ...q, images: JSON.parse(q.images || '[]') })),
    apps: { meta: meta ? { appId: meta.appId, hasSecret: !!meta.appSecret, graphVersion: meta.graphVersion || '' } : null, x: oauth(x), linkedin: oauth(linkedin) },
    oauthApps: OAUTH_APPS,
    callback: callback(c), callbacks: { x: callback(c, 'x'), linkedin: callback(c, 'linkedin') }, canManage: can(c, 'integrations.manage'), canStoreKeys: !!c.env.APP_KEY,
  });
});

// ---------- Connecting (needs integrations.manage) ----------
r.put('/apps/meta', need('integrations.manage'), async (c) => {
  const b = await c.req.json<{ appId?: string; appSecret?: string; graphVersion?: string; remove?: boolean }>();
  if (!c.env.APP_KEY) return c.json({ error: 'Keys cannot be saved until the APP_KEY secret is set.' }, 400);
  if (b.remove) { await saveApp(c.env, 'meta', null); await audit(c, 'social.app.remove', 'meta'); return c.json({ ok: true }); }
  const cur = await getApp(c.env, 'meta');
  const appId = String(b.appId ?? cur?.appId ?? '').trim();
  if (!/^\d{5,25}$/.test(appId)) return c.json({ error: 'The App ID is the long number at the top of your app in Meta for Developers.' }, 400);
  const appSecret = String(b.appSecret || '').trim() || cur?.appSecret || '';
  if (!appSecret) return c.json({ error: 'Add the App secret too. It is under App settings, Basic.' }, 400);
  const graphVersion = /^v\d+\.\d+$/.test(String(b.graphVersion || '')) ? String(b.graphVersion) : '';
  await saveApp(c.env, 'meta', { appId, appSecret, graphVersion });
  await audit(c, 'social.app.save', 'meta');
  return c.json({ ok: true });
});

r.get('/meta/start', need('integrations.manage'), async (c) => {
  const state = crypto.randomUUID();
  await c.env.KV.put(`oauth:meta:${state}`, String(c.get('uid')), { expirationTtl: 600 });
  try { return c.redirect(await metaAuthorizeUrl(c.env, callback(c), state), 302); }
  catch (e) { return c.redirect(`/admin/social?error=${encodeURIComponent((e as Error).message)}`, 302); }
});

r.get('/meta/callback', need('integrations.manage'), async (c) => {
  const state = c.req.query('state') || '';
  const who = state ? await c.env.KV.get(`oauth:meta:${state}`) : null;
  if (state) await c.env.KV.delete(`oauth:meta:${state}`);
  const back = (q: string) => c.redirect(`/admin/social?${q}`, 302);
  if (!who || who !== String(c.get('uid'))) return back(`error=${encodeURIComponent('That sign-in link expired. Try Connect again.')}`);
  if (c.req.query('error')) return back(`error=${encodeURIComponent(c.req.query('error_description') || 'Facebook sign-in was cancelled.')}`);
  try {
    const res = await metaConnect(c.env, c.req.query('code') || '', callback(c));
    await audit(c, 'social.connect', res.names.join(' + '));
    return back(`connected=${encodeURIComponent(res.names.join(' and '))}${res.instagram ? '' : '&noig=1'}`);
  } catch (e) { return back(`error=${encodeURIComponent((e as Error).message)}`); }
});

// ---------- X and LinkedIn ----------
const isOauth = (p: string): p is 'x' | 'linkedin' => p === 'x' || p === 'linkedin';

r.put('/apps/:provider{(x|linkedin)}', need('integrations.manage'), async (c) => {
  const provider = c.req.param('provider') as 'x' | 'linkedin';
  if (!c.env.APP_KEY) return c.json({ error: 'Keys cannot be saved until the APP_KEY secret is set.' }, 400);
  const b = await c.req.json<{ clientId?: string; clientSecret?: string; remove?: boolean }>();
  if (b.remove) { await saveApp(c.env, provider, null); await audit(c, 'social.app.remove', provider); return c.json({ ok: true }); }
  const cur = await getApp(c.env, provider);
  const clientId = String(b.clientId ?? cur?.clientId ?? '').trim();
  const clientSecret = String(b.clientSecret || '').trim() || cur?.clientSecret || '';
  if (!/^[\w.-]{6,120}$/.test(clientId)) return c.json({ error: `Paste the ${OAUTH_APPS[provider].idLabel}. It is under ${OAUTH_APPS[provider].where}.` }, 400);
  if (!clientSecret) return c.json({ error: `Add the ${OAUTH_APPS[provider].secretLabel} too.` }, 400);
  await saveApp(c.env, provider, { clientId, clientSecret });
  await audit(c, 'social.app.save', provider);
  return c.json({ ok: true });
});

r.get('/oauth/:provider{(x|linkedin)}/start', need('integrations.manage'), async (c) => {
  const provider = c.req.param('provider') || '';
  if (!isOauth(provider)) return c.notFound();
  const state = crypto.randomUUID();
  try {
    const s = await oauthStart(c.env, provider, callback(c, provider), state);
    await c.env.KV.put(`oauth:${provider}:${state}`, JSON.stringify({ uid: String(c.get('uid')), verifier: s.verifier }), { expirationTtl: 600 });
    return c.redirect(s.url, 302);
  } catch (e) { return c.redirect(`/admin/social?error=${encodeURIComponent((e as Error).message)}`, 302); }
});

r.get('/oauth/:provider{(x|linkedin)}/callback', need('integrations.manage'), async (c) => {
  const provider = c.req.param('provider') || '';
  if (!isOauth(provider)) return c.notFound();
  const back = (q: string) => c.redirect(`/admin/social?${q}`, 302);
  const state = c.req.query('state') || '';
  const saved = state ? await c.env.KV.get<{ uid: string; verifier: string }>(`oauth:${provider}:${state}`, 'json') : null;
  if (state) await c.env.KV.delete(`oauth:${provider}:${state}`);
  if (!saved || saved.uid !== String(c.get('uid'))) return back(`error=${encodeURIComponent('That sign-in link expired. Try Connect again.')}`);
  if (c.req.query('error')) return back(`error=${encodeURIComponent(c.req.query('error_description') || `${OAUTH_APPS[provider].label} sign-in was cancelled.`)}`);
  try {
    const name = await oauthConnect(c.env, provider, c.req.query('code') || '', callback(c, provider), saved.verifier);
    await audit(c, 'social.connect', `${provider} ${name}`);
    return back(`connected=${encodeURIComponent(`${name} on ${OAUTH_APPS[provider].label}`)}`);
  } catch (e) { return back(`error=${encodeURIComponent((e as Error).message)}`); }
});

r.post('/bluesky', need('integrations.manage'), async (c) => {
  const b = await c.req.json<{ handle: string; password: string; service?: string }>();
  if (!c.env.APP_KEY) return c.json({ error: 'Keys cannot be saved until the APP_KEY secret is set.' }, 400);
  if (!b.handle || !b.password) return c.json({ error: 'Add your handle and an app password.' }, 400);
  try {
    const s = await blueskyLogin(b.service || 'https://bsky.social', b.handle.trim(), b.password.trim());
    await saveAccount(c.env, 'bluesky', `@${s.handle}`, s.handle, b.password.trim(), { service: s.host, did: s.did });
    await audit(c, 'social.connect', `bluesky @${s.handle}`);
    return c.json({ ok: true, name: `@${s.handle}` });
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

r.post('/mastodon', need('integrations.manage'), async (c) => {
  const b = await c.req.json<{ instance: string; token: string }>();
  if (!c.env.APP_KEY) return c.json({ error: 'Keys cannot be saved until the APP_KEY secret is set.' }, 400);
  if (!b.instance || !b.token) return c.json({ error: 'Add your server and an access token.' }, 400);
  try {
    const m = await mastodonCheck(b.instance.trim(), b.token.trim());
    await saveAccount(c.env, 'mastodon', m.name, m.host, b.token.trim());
    await audit(c, 'social.connect', `mastodon ${m.name}`);
    return c.json({ ok: true, name: m.name });
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

r.delete('/accounts/:network', need('integrations.manage'), async (c) => {
  const n = c.req.param('network');
  await c.env.DB.prepare('DELETE FROM social_accounts WHERE network = ?').bind(n).run();
  await audit(c, 'social.disconnect', n);
  return c.json({ ok: true });
});

// ---------- Writing and sharing ----------
r.post('/write', need('social.post', 'ai.use'), async (c) => {
  const b = await c.req.json<{ post_id?: number; text?: string; networks: string[]; choice?: string }>();
  const nets = (b.networks || []).filter(isNet);
  if (!nets.length) return c.json({ error: 'Pick at least one network.' }, 400);
  let source = String(b.text || '').trim();
  let title = '';
  if (b.post_id) {
    const p = await getPostById(c.env, Number(b.post_id));
    if (!p) return c.json({ error: 'That post was not found.' }, 404);
    title = p.title;
    source = `Title: ${p.title}\nSummary: ${p.excerpt}\n\n${textOf(p.body).slice(0, 6000)}`;
  }
  if (!source) return c.json({ error: 'Write something, or pick a post to share.' }, 400);
  const rules = NETWORKS.filter((n) => nets.includes(n.id)).map((n) => {
    if (n.id === 'instagram') return `- instagram: up to 900 characters, a caption to sit under a photo. No web addresses (they do not work there). No hashtags.`;
    if (n.id === 'bluesky') return `- bluesky: under 260 characters (a link is added separately). Plain, conversational.`;
    if (n.id === 'mastodon') return `- mastodon: under 420 characters (a link is added separately). Friendly and plain.`;
    if (n.id === 'x') return `- x: under 240 characters (a link is added separately). One clear thought, no thread, no hashtags.`;
    if (n.id === 'linkedin') return `- linkedin: 3 to 6 short paragraphs, first person, a practical takeaway, professional but still Marc. No hashtags, no "I'm excited to share", no one-line-per-sentence broetry.`;
    return `- facebook: 1 to 3 short paragraphs, warm and personal. The link is added separately.`;
  }).join('\n');
  try {
    const res = await generate(c.env, {
      task: 'social', choice: b.choice,
      system: 'You write social posts for Marc to share his own website posts. Write as Marc, first person. Each network gets its own version, not a copy. No hashtags, no emoji strings, no "link in bio", no clickbait.',
      prompt: `Write one version for each of these networks:\n${rules}\n\nAnswer with only JSON: an object whose keys are the network names above and whose values are the post text.\n\nWhat to share${title ? ' (a post on Marc\'s website)' : ''}:\n${source}`,
    });
    const out = extractJson<Record<string, string>>(res.text);
    const versions: Record<string, string> = {};
    for (const n of nets) if (typeof out[n] === 'string') versions[n] = stripDashes(out[n]).trim();
    return c.json({ versions, provider: res.provider, model: res.model, flags: res.flags, tried: res.tried });
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

r.post('/share', need('social.post'), async (c) => {
  const b = await c.req.json<{ post_id?: number; link?: string; images?: string[]; items: { network: string; body: string }[]; send_at?: string }>();
  const items = (b.items || []).filter((i) => isNet(i.network) && String(i.body || '').trim());
  if (!items.length) return c.json({ error: 'Write something for at least one network.' }, 400);
  const { results: accts } = await c.env.DB.prepare('SELECT network FROM social_accounts').all<{ network: string }>();
  const missing = items.filter((i) => !accts.some((a) => a.network === i.network));
  if (missing.length) return c.json({ error: `Connect ${missing.map((m) => NETWORKS.find((n) => n.id === m.network)!.label).join(' and ')} first.` }, 400);
  for (const i of items) {
    const n = NETWORKS.find((x) => x.id === i.network)!;
    if (i.body.length > n.limit) return c.json({ error: `${n.label} allows ${n.limit} characters. That version has ${i.body.length}.` }, 400);
    // X counts any link as 23 characters, plus the blank line before it.
    if (n.id === 'x' && (b.post_id || b.link) && i.body.length > 255) return c.json({ error: `With the link added, X allows 255 characters of text. That version has ${i.body.length}.` }, 400);
  }
  let link = '';
  if (b.post_id) {
    const p = await getPostById(c.env, Number(b.post_id));
    if (!p) return c.json({ error: 'That post was not found.' }, 404);
    if (p.status !== 'published' && p.status !== 'scheduled') return c.json({ error: 'Publish the post first, so the link works.' }, 400);
    link = `${origin(c)}/writing/${p.slug}`;
  } else if (b.link) {
    try { const u = new URL(b.link); if (!/^https?:$/.test(u.protocol)) throw 0; link = u.href; } catch { return c.json({ error: 'That link does not look right.' }, 400); }
  }
  const keys = (b.images || []).map(String).filter((k) => /^[\w./-]+$/.test(k) && !k.includes('..')).slice(0, 10);
  const images: Image[] = [];
  for (const k of keys) {
    const m = await c.env.DB.prepare('SELECT key, alt FROM media WHERE key = ?').bind(k).first<{ key: string; alt: string }>();
    if (m) images.push({ key: m.key, url: `${origin(c)}/media/${m.key}`, alt: m.alt || '' });
  }
  if (items.some((i) => i.network === 'instagram') && !images.length) return c.json({ error: 'Instagram needs at least one photo.' }, 400);
  let sendAt = "datetime('now')";
  const binds: unknown[] = [];
  if (b.send_at) {
    const d = new Date(b.send_at);
    if (isNaN(+d)) return c.json({ error: 'That time does not look right.' }, 400);
    sendAt = '?';
    binds.push(d.toISOString().slice(0, 19).replace('T', ' '));
  }
  const batch = crypto.randomUUID().slice(0, 12);
  await c.env.DB.batch(items.map((i) => c.env.DB.prepare(`INSERT INTO social_posts (batch, post_id, network, body, link, images, send_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ${sendAt}, ?)`)
    .bind(batch, b.post_id ?? null, i.network, i.body.trim(), link || null, JSON.stringify(images), ...binds, c.get('uid'))));
  await audit(c, 'social.share', `${items.map((i) => i.network).join(', ')}${b.send_at ? ` at ${b.send_at}` : ''}`);
  if (!b.send_at || new Date(b.send_at) <= new Date()) c.executionCtx.waitUntil(processQueue(c.env, batch));
  return c.json({ ok: true, batch, later: !!b.send_at && new Date(b.send_at) > new Date() });
});

r.post('/queue/:id{[0-9]+}/retry', need('social.post'), async (c) => {
  const id = Number(c.req.param('id'));
  const row = await c.env.DB.prepare("UPDATE social_posts SET status = 'queued', send_at = datetime('now'), error = NULL, tries = 0 WHERE id = ? AND status = 'failed' RETURNING batch").bind(id).first<{ batch: string }>();
  if (!row) return c.json({ error: 'Only failed shares can be retried.' }, 400);
  c.executionCtx.waitUntil(processQueue(c.env, row.batch));
  return c.json({ ok: true });
});

r.delete('/queue/:id{[0-9]+}', need('social.post'), async (c) => {
  const res = await c.env.DB.prepare("DELETE FROM social_posts WHERE id = ? AND status IN ('queued', 'failed')").bind(Number(c.req.param('id'))).run();
  if (!res.meta.changes) return c.json({ error: 'Sent shares stay in the list. Delete them on the network itself.' }, 400);
  return c.json({ ok: true });
});

export default r;
