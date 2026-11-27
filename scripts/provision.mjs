// Run by the Preview workflow. Creates the Cloudflare database, storage bucket and key store the
// first time (and finds them after that), then writes wrangler.deploy.jsonc with their real ids.
// Needs CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID. Never touches DNS or ganders.nz itself.
import { readFileSync, writeFileSync, appendFileSync } from 'node:fs';

const token = process.env.CLOUDFLARE_API_TOKEN;
const account = process.env.CLOUDFLARE_ACCOUNT_ID;
if (!token || !account) { console.error('CLOUDFLARE_API_TOKEN and CLOUDFLARE_ACCOUNT_ID are needed.'); process.exit(1); }
const NAME = 'ganders-nz';

async function cf(method, path, body) {
  const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`, {
    method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok && data.success !== false, status: res.status, data };
}
const why = (r) => `${r.status} ${JSON.stringify(r.data?.errors || r.data).slice(0, 300)}`;

// Database
let d1 = (await cf('GET', `/d1/database?name=${NAME}`)).data?.result?.find((d) => d.name === NAME);
if (!d1) {
  const r = await cf('POST', '/d1/database', { name: NAME });
  if (!r.ok) throw new Error(`Could not create the database (token needs Account, D1, Edit): ${why(r)}`);
  d1 = r.data.result; console.log('Created database', d1.uuid);
} else console.log('Found database', d1.uuid);

// Key store (sessions, rate limits)
const kvList = await cf('GET', '/storage/kv/namespaces?per_page=100');
let kv = kvList.data?.result?.find((n) => n.title === `${NAME}-kv`);
if (!kv) {
  const r = await cf('POST', '/storage/kv/namespaces', { title: `${NAME}-kv` });
  if (!r.ok) throw new Error(`Could not create the key store: ${why(r)}`);
  kv = r.data.result; console.log('Created key store', kv.id);
} else console.log('Found key store', kv.id);

// Media bucket
const bucket = `${NAME}-media`;
const b = await cf('GET', `/r2/buckets/${bucket}`);
if (!b.ok) {
  const r = await cf('POST', '/r2/buckets', { name: bucket });
  if (!r.ok) throw new Error(`Could not create the media bucket (is R2 switched on, and does the token have Workers R2 Storage, Edit?): ${why(r)}`);
  console.log('Created bucket', bucket);
} else console.log('Found bucket', bucket);

// Preview address
const sub = (await cf('GET', '/workers/subdomain')).data?.result?.subdomain;
const url = sub ? `https://${NAME}.${sub}.workers.dev` : '';
console.log('Preview address', url || '(workers.dev subdomain not set up yet)');

let cfg = readFileSync('wrangler.jsonc', 'utf8')
  .replace(/("database_id":\s*")REPLACE_AT_DEPLOY"/, `$1${d1.uuid}"`)
  .replace(/("id":\s*")REPLACE_AT_DEPLOY"/, `$1${kv.id}"`);
if (url) cfg = cfg.replace(/"SITE_URL":\s*"[^"]*"/, `"SITE_URL": "${url}"`);
writeFileSync('wrangler.deploy.jsonc', cfg);

// Which secrets the worker already has, so APP_KEY is made once and never replaced.
const sec = await cf('GET', `/workers/scripts/${NAME}/secrets`);
const have = new Set((sec.data?.result || []).map((s) => s.name));
if (process.env.GITHUB_OUTPUT) {
  appendFileSync(process.env.GITHUB_OUTPUT, `url=${url}\nhas_app_key=${have.has('APP_KEY') ? 'yes' : 'no'}\n`);
}
