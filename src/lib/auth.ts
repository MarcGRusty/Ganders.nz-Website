import type { Context, Next } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { Env } from '../types';

const ITER = 100_000;
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function derive(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITER }, key, 256);
}

export async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64(salt)}$${b64(await derive(password, salt))}`;
}

export async function verifyPassword(password: string, stored: string) {
  const [, , salt, hash] = stored.split('$');
  const got = new Uint8Array(await derive(password, unb64(salt)));
  const want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

const COOKIE = 'gsid';
const TTL = 60 * 60 * 24 * 14;

export async function startSession(c: Context<any>, userId: number) {
  const sid = b64(crypto.getRandomValues(new Uint8Array(32))).replace(/[^a-zA-Z0-9]/g, '');
  await c.env.KV.put(`session:${sid}`, String(userId), { expirationTtl: TTL });
  setCookie(c, COOKIE, sid, { httpOnly: true, secure: true, sameSite: 'Lax', path: '/', maxAge: TTL });
}

export async function endSession(c: Context<any>) {
  const sid = getCookie(c, COOKIE);
  if (sid) await c.env.KV.delete(`session:${sid}`);
  deleteCookie(c, COOKIE, { path: '/' });
}

export async function currentUser(c: Context<any>) {
  const sid = getCookie(c, COOKIE);
  if (!sid) return null;
  const uid = await c.env.KV.get(`session:${sid}`);
  return uid ? Number(uid) : null;
}

export async function requireAuth(c: Context<{ Bindings: Env; Variables: { uid: number } }>, next: Next) {
  const uid = await currentUser(c);
  if (!uid) return c.json({ error: 'Please sign in.' }, 401);
  // Basic CSRF protection for state-changing requests.
  if (c.req.method !== 'GET') {
    const origin = c.req.header('origin');
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: 'Bad origin.' }, 403);
  }
  c.set('uid', uid);
  await next();
}
