// Connections to outside systems: REST APIs Studio can call, outgoing webhooks that tell other
// systems when something happens here, and incoming webhooks that let them send things in.
// Every secret is encrypted with APP_KEY and never sent back to the browser.
import type { Env } from '../types';
import { open } from './crypto';

export const EVENTS: { id: string; label: string }[] = [
  { id: 'post.published', label: 'A post goes live' },
  { id: 'page.published', label: 'A page goes live' },
  { id: 'message.received', label: 'A form message arrives' },
  { id: 'social.sent', label: 'A social share is sent' },
];

export interface Integration {
  id: number; kind: 'api' | 'webhook_out' | 'webhook_in'; name: string; url: string | null;
  auth: 'none' | 'bearer' | 'header' | 'query' | 'basic'; auth_name: string | null; enc_secret: string | null;
  headers: string; events: string; token: string | null; action: string | null; active: number;
}

/** Only public https addresses. Stops anyone pointing a connection at localhost or a private network. */
export function safeUrl(raw: string): URL {
  let u: URL;
  try { u = new URL(String(raw).trim()); } catch { throw new Error('That does not look like a web address.'); }
  if (u.protocol !== 'https:') throw new Error('Use an https:// address.');
  if (u.username || u.password) throw new Error('Put the login in the key field, not in the address.');
  const h = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateIp = /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.)/.test(h);
  if (h === 'localhost' || h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal') || privateIp || h.includes(':') || !h.includes('.'))
    throw new Error('That address is not on the public internet.');
  return u;
}

export async function hmac(secret: string, body: string) {
  const k = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', k, new TextEncoder().encode(body)));
  return [...sig].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Constant-time compare for signatures. */
export function sameText(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

const parseJson = <T>(s: string | null | undefined, d: T): T => { try { return s ? JSON.parse(s) : d; } catch { return d; } };

export async function logIntegration(env: Env, id: number, direction: string, ok: boolean, status: number | null, note: string, event?: string) {
  await env.DB.batch([
    env.DB.prepare('INSERT INTO integration_log (integration_id, direction, event, ok, status, note) VALUES (?, ?, ?, ?, ?, ?)').bind(id, direction, event ?? null, ok ? 1 : 0, status, note.slice(0, 500)),
    env.DB.prepare("UPDATE integrations SET last_ok = ?, last_at = datetime('now'), last_note = ? WHERE id = ?").bind(ok ? 1 : 0, note.slice(0, 200), id),
    env.DB.prepare('DELETE FROM integration_log WHERE integration_id = ? AND id NOT IN (SELECT id FROM integration_log WHERE integration_id = ? ORDER BY id DESC LIMIT 200)').bind(id, id),
  ]).catch(() => {});
}

/** Call a saved API connection. path is added to its base address. */
export async function callApi(env: Env, it: Integration, path = '', init: { method?: string; body?: unknown; timeout?: number } = {}) {
  const base = safeUrl(it.url || '');
  const url = path ? safeUrl(new URL(path.replace(/^\/+/, ''), base.href.endsWith('/') ? base.href : `${base.href}/`).href) : base;
  if (url.hostname !== base.hostname) throw new Error('A path can only point at the same site as the connection.');
  const headers = new Headers({ accept: 'application/json', 'user-agent': 'ganders.nz Studio' });
  for (const [k, v] of Object.entries(parseJson<Record<string, string>>(it.headers, {}))) if (/^[a-z0-9-]{1,60}$/i.test(k)) headers.set(k, String(v));
  const secret = it.enc_secret ? await open(env.APP_KEY, it.enc_secret) : '';
  if (secret) {
    if (it.auth === 'bearer') headers.set('authorization', `Bearer ${secret}`);
    if (it.auth === 'header') headers.set(it.auth_name || 'x-api-key', secret);
    if (it.auth === 'basic') headers.set('authorization', `Basic ${btoa(secret)}`);
    if (it.auth === 'query') url.searchParams.set(it.auth_name || 'api_key', secret);
  }
  let body: string | undefined;
  if (init.body !== undefined) { body = JSON.stringify(init.body); headers.set('content-type', 'application/json'); }
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), init.timeout ?? 15_000);
  try {
    const r = await fetch(url.href, { method: init.method || 'GET', headers, body, signal: ctl.signal, redirect: 'manual' });
    const text = (await r.text()).slice(0, 500_000);
    let data: unknown = text;
    try { data = JSON.parse(text); } catch { /* not JSON */ }
    return { ok: r.ok, status: r.status, data };
  } catch (e) {
    throw new Error(ctl.signal.aborted ? 'It took too long to answer.' : (e as Error).message);
  } finally { clearTimeout(t); }
}

/** Send one webhook. The body is signed so the receiver can check it came from this site. */
export async function sendWebhook(env: Env, it: Integration, event: string, data: unknown, direction = 'out') {
  const body = JSON.stringify({ event, at: new Date().toISOString(), site: env.SITE_URL, data });
  const headers: Record<string, string> = { 'content-type': 'application/json', 'user-agent': 'ganders.nz Studio', 'x-ganders-event': event };
  for (const [k, v] of Object.entries(parseJson<Record<string, string>>(it.headers, {}))) if (/^[a-z0-9-]{1,60}$/i.test(k)) headers[k] = String(v);
  if (it.enc_secret) headers['x-ganders-signature'] = `sha256=${await hmac(await open(env.APP_KEY, it.enc_secret), body)}`;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 10_000);
  try {
    const r = await fetch(safeUrl(it.url || '').href, { method: 'POST', headers, body, signal: ctl.signal, redirect: 'manual' });
    await logIntegration(env, it.id, direction, r.ok, r.status, r.ok ? `Delivered (${r.status}).` : `They answered ${r.status}.`, event);
    return r.ok;
  } catch (e) {
    await logIntegration(env, it.id, direction, false, null, ctl.signal.aborted ? 'No answer within 10 seconds.' : (e as Error).message, event);
    return false;
  } finally { clearTimeout(t); }
}

/** Tell every outgoing webhook that listens for this event. Never throws. */
export async function fireEvent(env: Env, event: string, data: unknown) {
  try {
    const { results } = await env.DB.prepare("SELECT * FROM integrations WHERE kind = 'webhook_out' AND active = 1").all<Integration>();
    const hooks = results.filter((h) => parseJson<string[]>(h.events, []).includes(event));
    await Promise.all(hooks.map((h) => sendWebhook(env, h, event, data)));
  } catch { /* webhooks must never break the thing that triggered them */ }
}

/** Pull a value out of an API answer with a simple path like "items.0.title". */
export function pick(data: unknown, path: string): unknown {
  if (!path) return data;
  return path.split('.').reduce<any>((a, k) => (a == null ? a : a[/^\d+$/.test(k) ? Number(k) : k]), data);
}
