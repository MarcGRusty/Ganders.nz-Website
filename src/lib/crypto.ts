// AES-GCM encryption for secrets stored in D1 (API keys, tokens).
// The key comes from the APP_KEY Worker secret: 32 random bytes, base64 encoded.
const enc = new TextEncoder();
const dec = new TextDecoder();
const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

async function key(appKey: string) {
  if (!appKey) throw new Error('APP_KEY is not set, so secrets cannot be stored.');
  const raw = unb64(appKey);
  if (raw.length !== 32) throw new Error('APP_KEY must be 32 bytes, base64 encoded.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(appKey: string, plain: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await key(appKey), enc.encode(plain)));
  return `v1.${b64(iv)}.${b64(ct)}`;
}

export async function open(appKey: string, sealed: string) {
  const [v, iv, ct] = sealed.split('.');
  if (v !== 'v1') throw new Error('Unknown secret format.');
  return dec.decode(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await key(appKey), unb64(ct)));
}
