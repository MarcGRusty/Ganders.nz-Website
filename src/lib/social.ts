// Social sharing: Facebook Page and Instagram (through a Meta app), Bluesky and Mastodon.
// Shares wait in a queue (social_posts) and are sent straight away or by the cron.
import type { Env } from '../types';
import { seal, open } from './crypto';
import { safeUrl, fireEvent } from './integrations';

export type Network = 'facebook' | 'instagram' | 'bluesky' | 'mastodon' | 'x' | 'linkedin';
export const NETWORKS: { id: Network; label: string; limit: number; needsImage?: boolean }[] = [
  { id: 'facebook', label: 'Facebook Page', limit: 5000 },
  { id: 'instagram', label: 'Instagram', limit: 2200, needsImage: true },
  { id: 'bluesky', label: 'Bluesky', limit: 300 },
  { id: 'mastodon', label: 'Mastodon', limit: 500 },
  { id: 'x', label: 'X', limit: 280 },
  { id: 'linkedin', label: 'LinkedIn', limit: 3000 },
];

/** Networks that sign in through an app Marc owns (client id and secret saved in Studio). */
export const OAUTH_APPS: Record<string, { label: string; idLabel: string; secretLabel: string; where: string }> = {
  x: { label: 'X', idLabel: 'Client ID', secretLabel: 'Client secret', where: 'developer.x.com, your app, Keys and tokens, OAuth 2.0 Client ID and Client Secret' },
  linkedin: { label: 'LinkedIn', idLabel: 'Client ID', secretLabel: 'Primary client secret', where: 'linkedin.com/developers, your app, Auth tab' },
};

export interface Image { key: string; url: string; alt?: string }
interface Account { network: Network; name: string; ref: string; enc_token: string; meta: string }
interface Queued { id: number; batch: string; post_id: number | null; network: Network; body: string; link: string | null; images: string; tries: number }

const GRAPH_DEFAULT = 'v24.0';

// ---------- App credentials ----------
export async function getApp(env: Env, provider: string): Promise<Record<string, string> | null> {
  const r = await env.DB.prepare('SELECT enc_value FROM social_apps WHERE provider = ?').bind(provider).first<{ enc_value: string }>();
  if (!r) return null;
  try { return JSON.parse(await open(env.APP_KEY, r.enc_value)); } catch { return null; }
}
export async function saveApp(env: Env, provider: string, v: Record<string, string> | null) {
  if (!v) { await env.DB.prepare('DELETE FROM social_apps WHERE provider = ?').bind(provider).run(); return; }
  await env.DB.prepare("INSERT INTO social_apps (provider, enc_value) VALUES (?, ?) ON CONFLICT(provider) DO UPDATE SET enc_value = excluded.enc_value, updated_at = datetime('now')")
    .bind(provider, await seal(env.APP_KEY, JSON.stringify(v))).run();
}

export async function saveAccount(env: Env, network: Network, name: string, ref: string, tokenPlain: string, meta: Record<string, unknown> = {}) {
  await env.DB.prepare("INSERT INTO social_accounts (network, name, ref, enc_token, meta) VALUES (?, ?, ?, ?, ?) ON CONFLICT(network) DO UPDATE SET name = excluded.name, ref = excluded.ref, enc_token = excluded.enc_token, meta = excluded.meta, connected_at = datetime('now')")
    .bind(network, name, ref, await seal(env.APP_KEY, tokenPlain), JSON.stringify(meta)).run();
}

async function account(env: Env, network: Network) {
  const a = await env.DB.prepare('SELECT * FROM social_accounts WHERE network = ?').bind(network).first<Account>();
  if (!a) throw new Error(`${NETWORKS.find((n) => n.id === network)?.label} is not connected.`);
  let token: string;
  try { token = await open(env.APP_KEY, a.enc_token); } catch { throw new Error(`The saved login for ${a.name} could not be read. Connect it again.`); }
  return { ...a, token, meta: JSON.parse(a.meta || '{}') as Record<string, string> };
}

async function req(url: string, init: RequestInit = {}, what = 'The network') {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetch(url, { ...init, signal: ctl.signal });
    const text = await r.text();
    let j: any = {};
    try { j = JSON.parse(text); } catch { j = { raw: text.slice(0, 300) }; }
    if (!r.ok) throw new Error(`${what} said: ${j.error?.message || j.error_description || j.message || j.error || j.raw || r.status}`);
    return j;
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(`${what} took too long to answer.`);
    throw e;
  } finally { clearTimeout(t); }
}

// ---------- Meta (Facebook + Instagram) ----------
async function metaApp(env: Env) {
  const app = await getApp(env, 'meta');
  if (!app?.appId || !app?.appSecret) throw new Error('Add your Meta app ID and secret first.');
  const v = /^v\d+\.\d+$/.test(app.graphVersion || '') ? app.graphVersion : GRAPH_DEFAULT;
  return { appId: app.appId, appSecret: app.appSecret, v };
}
const graph = (v: string, path: string) => `https://graph.facebook.com/${v}/${path.replace(/^\//, '')}`;
async function proof(secret: string, token: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return [...new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(token)))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export const META_SCOPES = 'pages_show_list,pages_read_engagement,pages_manage_posts,business_management,instagram_basic,instagram_content_publish';

export async function metaAuthorizeUrl(env: Env, redirect: string, state: string) {
  const app = await metaApp(env);
  return `https://www.facebook.com/${app.v}/dialog/oauth?${new URLSearchParams({ client_id: app.appId, redirect_uri: redirect, state, response_type: 'code', scope: META_SCOPES })}`;
}

/** Finish the Meta login: swap the code for a long-lived token and save the Page and its Instagram. */
export async function metaConnect(env: Env, code: string, redirect: string) {
  const app = await metaApp(env);
  const short = await req(`${graph(app.v, 'oauth/access_token')}?${new URLSearchParams({ client_id: app.appId, client_secret: app.appSecret, redirect_uri: redirect, code })}`, {}, 'Facebook');
  const long = await req(`${graph(app.v, 'oauth/access_token')}?${new URLSearchParams({ grant_type: 'fb_exchange_token', client_id: app.appId, client_secret: app.appSecret, fb_exchange_token: short.access_token })}`, {}, 'Facebook').catch(() => short);
  const user = long.access_token || short.access_token;
  const pages = await req(`${graph(app.v, 'me/accounts')}?${new URLSearchParams({ fields: 'id,name,access_token,instagram_business_account{id,username}', access_token: user, appsecret_proof: await proof(app.appSecret, user) })}`, {}, 'Facebook');
  const list = (pages.data || []).filter((p: any) => p.access_token);
  const page = list.find((p: any) => p.instagram_business_account?.id) || list[0];
  if (!page) throw new Error('No Facebook Page came back. When Facebook asks, tick the Page you want to post to.');
  // Page tokens made from a long-lived user token do not expire.
  await saveAccount(env, 'facebook', page.name, page.id, page.access_token);
  const names = [page.name];
  if (page.instagram_business_account?.id) {
    await saveAccount(env, 'instagram', `@${page.instagram_business_account.username || 'instagram'}`, page.instagram_business_account.id, page.access_token);
    names.push(`@${page.instagram_business_account.username || 'instagram'}`);
  }
  return { names, instagram: !!page.instagram_business_account?.id };
}

async function sendFacebook(env: Env, q: Queued, images: Image[]) {
  const app = await metaApp(env);
  const a = await account(env, 'facebook');
  const auth = { access_token: a.token, appsecret_proof: await proof(app.appSecret, a.token) };
  const form = (o: Record<string, string>) => ({ method: 'POST', body: new URLSearchParams(o) });
  const withLink = q.link && !q.body.includes(q.link) ? `${q.body}\n\n${q.link}` : q.body;
  if (images.length === 1) {
    const r = await req(graph(app.v, `${a.ref}/photos`), form({ url: images[0].url, caption: withLink, ...auth }), 'Facebook');
    const id = r.post_id || r.id;
    return `https://www.facebook.com/${id}`;
  }
  const params: Record<string, string> = { message: images.length ? withLink : q.body, ...auth };
  if (images.length) {
    for (const [i, img] of images.slice(0, 10).entries()) {
      const up = await req(graph(app.v, `${a.ref}/photos`), form({ url: img.url, published: 'false', ...auth }), 'Facebook');
      params[`attached_media[${i}]`] = JSON.stringify({ media_fbid: up.id });
    }
  } else if (q.link) params.link = q.link;
  const r = await req(graph(app.v, `${a.ref}/feed`), form(params), 'Facebook');
  return `https://www.facebook.com/${r.id}`;
}

async function sendInstagram(env: Env, q: Queued, images: Image[]) {
  if (!images.length) throw new Error('Instagram needs at least one photo.');
  if (images.some((i) => !/\.jpe?g$/i.test(i.key))) throw new Error('Instagram only takes JPEG photos. Pick JPEG versions of these photos.');
  const app = await metaApp(env);
  const a = await account(env, 'instagram');
  const auth = { access_token: a.token, appsecret_proof: await proof(app.appSecret, a.token) };
  const post = (path: string, o: Record<string, string>) => req(graph(app.v, path), { method: 'POST', body: new URLSearchParams({ ...o, ...auth }) }, 'Instagram');
  let creation: string;
  if (images.length === 1) creation = (await post(`${a.ref}/media`, { image_url: images[0].url, caption: q.body })).id;
  else {
    const kids: string[] = [];
    for (const img of images.slice(0, 10)) kids.push((await post(`${a.ref}/media`, { image_url: img.url, is_carousel_item: 'true' })).id);
    creation = (await post(`${a.ref}/media`, { media_type: 'CAROUSEL', children: kids.join(','), caption: q.body })).id;
  }
  for (let i = 0; i < 8; i++) {
    const s = await req(`${graph(app.v, creation)}?${new URLSearchParams({ fields: 'status_code', ...auth })}`, {}, 'Instagram');
    if (!s.status_code || s.status_code === 'FINISHED') break;
    if (['ERROR', 'EXPIRED'].includes(s.status_code)) throw new Error(`Instagram could not process the photos (${s.status_code}).`);
    if (i === 7) throw new Error('Instagram is still processing the photos. It will try again shortly.');
    await new Promise((r) => setTimeout(r, 2000));
  }
  const pub = await post(`${a.ref}/media_publish`, { creation_id: creation });
  const link = await req(`${graph(app.v, pub.id)}?${new URLSearchParams({ fields: 'permalink', ...auth })}`, {}, 'Instagram').catch(() => ({}));
  return link.permalink || 'https://www.instagram.com/';
}

// ---------- Bluesky ----------
export async function blueskyLogin(service: string, handle: string, password: string) {
  const host = safeUrl(service || 'https://bsky.social').origin;
  const s = await req(`${host}/xrpc/com.atproto.server.createSession`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ identifier: handle.replace(/^@/, ''), password }) }, 'Bluesky');
  return { host, did: s.did as string, handle: s.handle as string, jwt: s.accessJwt as string };
}

/** Byte ranges of web addresses in the text, so Bluesky shows them as links. */
export function linkFacets(text: string) {
  const enc = new TextEncoder();
  const out: any[] = [];
  for (const m of text.matchAll(/https?:\/\/[^\s)]+[^\s).,!?:;]/g)) {
    const start = enc.encode(text.slice(0, m.index)).length;
    out.push({ index: { byteStart: start, byteEnd: start + enc.encode(m[0]).length }, features: [{ $type: 'app.bsky.richtext.facet#link', uri: m[0] }] });
  }
  return out;
}

async function sendBluesky(env: Env, q: Queued, images: Image[]) {
  const a = await account(env, 'bluesky');
  const s = await blueskyLogin(a.meta.service || 'https://bsky.social', a.ref, a.token);
  const auth = { authorization: `Bearer ${s.jwt}` };
  const record: any = { $type: 'app.bsky.feed.post', text: q.body, createdAt: new Date().toISOString(), langs: ['en-NZ'] };
  const facets = linkFacets(q.body);
  if (facets.length) record.facets = facets;
  const blobs: any[] = [];
  for (const img of images.slice(0, 4)) {
    const obj = await env.MEDIA.get(img.key);
    if (!obj || obj.size > 976_000) continue; // Bluesky's limit is just under 1 MB per photo
    const up = await req(`${s.host}/xrpc/com.atproto.repo.uploadBlob`, { method: 'POST', headers: { ...auth, 'content-type': obj.httpMetadata?.contentType || 'image/jpeg' }, body: await obj.arrayBuffer() }, 'Bluesky');
    blobs.push({ image: up.blob, alt: img.alt || '' });
  }
  if (blobs.length) record.embed = { $type: 'app.bsky.embed.images', images: blobs };
  else if (q.link) record.embed = { $type: 'app.bsky.embed.external', external: { uri: q.link, title: q.link.replace(/^https?:\/\//, ''), description: '' } };
  const r = await req(`${s.host}/xrpc/com.atproto.repo.createRecord`, { method: 'POST', headers: { ...auth, 'content-type': 'application/json' }, body: JSON.stringify({ repo: s.did, collection: 'app.bsky.feed.post', record }) }, 'Bluesky');
  return `https://bsky.app/profile/${s.handle}/post/${String(r.uri).split('/').pop()}`;
}

// ---------- Mastodon ----------
export async function mastodonCheck(instance: string, token: string) {
  const host = safeUrl(/^https?:\/\//.test(instance) ? instance : `https://${instance}`).origin;
  const me = await req(`${host}/api/v1/accounts/verify_credentials`, { headers: { authorization: `Bearer ${token}` } }, 'Mastodon');
  return { host, name: `@${me.acct}@${new URL(host).hostname}` };
}

async function sendMastodon(env: Env, q: Queued, images: Image[]) {
  const a = await account(env, 'mastodon');
  const auth = { authorization: `Bearer ${a.token}` };
  const ids: string[] = [];
  for (const img of images.slice(0, 4)) {
    const obj = await env.MEDIA.get(img.key);
    if (!obj) continue;
    const fd = new FormData();
    fd.append('file', new Blob([await obj.arrayBuffer()], { type: obj.httpMetadata?.contentType || 'image/jpeg' }), img.key.split('/').pop());
    if (img.alt) fd.append('description', img.alt.slice(0, 1500));
    ids.push((await req(`${a.ref}/api/v2/media`, { method: 'POST', headers: auth, body: fd }, 'Mastodon')).id);
  }
  const status = q.link && !q.body.includes(q.link) ? `${q.body}\n\n${q.link}` : q.body;
  const body = new URLSearchParams({ status, visibility: 'public', language: 'en' });
  ids.forEach((id) => body.append('media_ids[]', id));
  const r = await req(`${a.ref}/api/v1/statuses`, { method: 'POST', headers: { ...auth, 'idempotency-key': `ganders-${q.id}` }, body }, 'Mastodon');
  return r.url as string;
}

// ---------- X and LinkedIn (OAuth 2.0 apps) ----------
async function oauthApp(env: Env, provider: 'x' | 'linkedin') {
  const app = await getApp(env, provider);
  if (!app?.clientId || !app?.clientSecret) throw new Error(`Add your ${OAUTH_APPS[provider].label} app details first.`);
  return app as { clientId: string; clientSecret: string };
}
const b64url = (u: Uint8Array) => btoa(String.fromCharCode(...u)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

/** The sign-in address, plus the PKCE verifier to keep until the callback (X needs it). */
export async function oauthStart(env: Env, provider: 'x' | 'linkedin', redirect: string, state: string) {
  const app = await oauthApp(env, provider);
  if (provider === 'linkedin') {
    return { verifier: '', url: `https://www.linkedin.com/oauth/v2/authorization?${new URLSearchParams({ response_type: 'code', client_id: app.clientId, redirect_uri: redirect, state, scope: 'openid profile w_member_social' })}` };
  }
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(48)));
  const challenge = b64url(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier))));
  const q = new URLSearchParams({ response_type: 'code', client_id: app.clientId, redirect_uri: redirect, scope: 'tweet.read tweet.write users.read offline.access', state, code_challenge: challenge, code_challenge_method: 'S256' });
  return { verifier, url: `https://x.com/i/oauth2/authorize?${q.toString().replace(/\+/g, '%20')}` };
}

const xBasic = (app: { clientId: string; clientSecret: string }) => `Basic ${btoa(`${encodeURIComponent(app.clientId)}:${encodeURIComponent(app.clientSecret)}`)}`;
const expiresAt = (secs: unknown) => (Number(secs) ? new Date(Date.now() + Number(secs) * 1000).toISOString() : '');

export async function oauthConnect(env: Env, provider: 'x' | 'linkedin', code: string, redirect: string, verifier: string) {
  const app = await oauthApp(env, provider);
  if (provider === 'linkedin') {
    const t = await req('https://www.linkedin.com/oauth/v2/accessToken', { method: 'POST', body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: app.clientId, client_secret: app.clientSecret }) }, 'LinkedIn');
    const me = await req('https://api.linkedin.com/v2/userinfo', { headers: { authorization: `Bearer ${t.access_token}` } }, 'LinkedIn');
    if (!me.sub) throw new Error('LinkedIn did not say who you are. Check the app has "Sign In with LinkedIn using OpenID Connect".');
    await saveAccount(env, 'linkedin', me.name || 'LinkedIn', `urn:li:person:${me.sub}`, t.access_token, { expires: expiresAt(t.expires_in) });
    return me.name || 'LinkedIn';
  }
  const t = await req('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { authorization: xBasic(app) }, body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: redirect, code_verifier: verifier, client_id: app.clientId }) }, 'X');
  const me = await req('https://api.x.com/2/users/me', { headers: { authorization: `Bearer ${t.access_token}` } }, 'X');
  const username = me.data?.username || 'x';
  await saveAccount(env, 'x', `@${username}`, String(me.data?.id || ''), t.access_token, { username, refresh: t.refresh_token || '', expires: expiresAt(t.expires_in || 7200) });
  return `@${username}`;
}

/** X tokens last two hours. Refresh when close, and save the new refresh token straight away (X rotates them). */
async function xToken(env: Env) {
  const a = await account(env, 'x');
  if (a.meta.expires && Date.parse(a.meta.expires) > Date.now() + 120_000) return a;
  if (!a.meta.refresh) throw new Error('The X connection expired. Connect it again.');
  const app = await oauthApp(env, 'x');
  const t = await req('https://api.x.com/2/oauth2/token', { method: 'POST', headers: { authorization: xBasic(app) }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: a.meta.refresh, client_id: app.clientId }) }, 'X');
  const meta: Record<string, string> = { ...a.meta, refresh: t.refresh_token || a.meta.refresh, expires: expiresAt(t.expires_in || 7200) };
  await saveAccount(env, 'x', a.name, a.ref, t.access_token, meta);
  return { ...a, token: t.access_token as string, meta };
}

async function sendX(env: Env, q: Queued) {
  const a = await xToken(env);
  const text = q.link && !q.body.includes(q.link) ? `${q.body}\n\n${q.link}` : q.body;
  const r = await req('https://api.x.com/2/tweets', { method: 'POST', headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json' }, body: JSON.stringify({ text }) }, 'X');
  return `https://x.com/${a.meta.username || 'i'}/status/${r.data?.id}`;
}

/** LinkedIn's post text treats these characters as markup, so they are escaped to post as written. */
export const linkedinText = (t: string) => t.replace(/([\\|{}@\[\]()<>#*_~])/g, '\\$1');

async function sendLinkedIn(env: Env, q: Queued) {
  const a = await account(env, 'linkedin');
  if (a.meta.expires && Date.parse(a.meta.expires) < Date.now()) throw new Error('The LinkedIn connection expired (they last 60 days). Connect it again.');
  const body: any = {
    author: a.ref, commentary: linkedinText(q.body), visibility: 'PUBLIC', lifecycleState: 'PUBLISHED', isReshareDisabledByAuthor: false,
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
  };
  if (q.link) body.content = { article: { source: q.link, title: q.link.replace(/^https?:\/\//, '').slice(0, 200) } };
  if (q.post_id) {
    const p = await env.DB.prepare('SELECT title FROM posts WHERE id = ?').bind(q.post_id).first<{ title: string }>();
    if (p && body.content) body.content.article.title = p.title.slice(0, 200);
  }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 30_000);
  try {
    const r = await fetch('https://api.linkedin.com/rest/posts', { method: 'POST', signal: ctl.signal, headers: { authorization: `Bearer ${a.token}`, 'content-type': 'application/json', 'LinkedIn-Version': '202509', 'X-Restli-Protocol-Version': '2.0.0' }, body: JSON.stringify(body) });
    if (r.status !== 201) { const j: any = await r.json().catch(() => ({})); throw new Error(`LinkedIn said: ${j.message || r.status}`); }
    const urn = r.headers.get('x-restli-id') || '';
    return urn ? `https://www.linkedin.com/feed/update/${urn}/` : 'https://www.linkedin.com/feed/';
  } catch (e) { if (ctl.signal.aborted) throw new Error('LinkedIn took too long to answer.'); throw e; } finally { clearTimeout(t); }
}

// ---------- Queue ----------
const SENDERS: Record<Network, (env: Env, q: Queued, images: Image[]) => Promise<string>> = {
  facebook: sendFacebook, instagram: sendInstagram, bluesky: sendBluesky, mastodon: sendMastodon, x: sendX, linkedin: sendLinkedIn,
};

/** Send whatever is due (or one batch). Each row is claimed first so two runs never double-post. */
export async function processQueue(env: Env, batch?: string) {
  const { results } = await env.DB.prepare(`SELECT * FROM social_posts WHERE status = 'queued' AND send_at <= datetime('now') ${batch ? 'AND batch = ?' : ''} ORDER BY id LIMIT 10`)
    .bind(...(batch ? [batch] : [])).all<Queued>();
  for (const q of results) {
    const claim = await env.DB.prepare("UPDATE social_posts SET status = 'sending', tries = tries + 1, send_at = datetime('now') WHERE id = ? AND status = 'queued'").bind(q.id).run();
    if (!claim.meta.changes) continue;
    try {
      const url = await SENDERS[q.network](env, q, JSON.parse(q.images || '[]'));
      await env.DB.prepare("UPDATE social_posts SET status = 'sent', result_url = ?, error = NULL, sent_at = datetime('now') WHERE id = ?").bind(url, q.id).run();
      await fireEvent(env, 'social.sent', { network: q.network, url, post_id: q.post_id });
    } catch (e) {
      const msg = (e as Error).message.slice(0, 500);
      // Retry twice, 10 then 20 minutes later, unless the problem needs a person to fix it.
      const fixable = /not connected|Connect it again|Add your|expired|only takes JPEG|needs at least one photo|said: .*(token|permission|OAuth)/i.test(msg);
      const retry = q.tries + 1 < 3 && !fixable;
      await env.DB.prepare(`UPDATE social_posts SET status = ?, error = ?, send_at = ${retry ? "datetime('now', ?)" : 'send_at'} WHERE id = ?`)
        .bind(...(retry ? ['queued', msg, `+${(q.tries + 1) * 10} minutes`, q.id] : ['failed', msg, q.id])).run();
    }
  }
}

/** Shares stuck in "sending" (a run that died part way) go back to the queue after 15 minutes. */
export async function unstick(env: Env) {
  await env.DB.prepare("UPDATE social_posts SET status = 'failed', error = 'Sending was interrupted. Check the network before trying again, in case it went out.' WHERE status = 'sending' AND send_at <= datetime('now', '-15 minutes')").run();
}
