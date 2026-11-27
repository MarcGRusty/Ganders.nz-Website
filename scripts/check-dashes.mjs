// Fails if a literal em dash character appears in any source, copy or doc file.
// The site's rule: no em dashes anywhere. Code that needs to match one uses the backslash-u-2014 escape.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const SKIP = new Set(['node_modules', '.git', '.wrangler', 'app.js']);
const EXT = /\.(ts|js|mjs|json|jsonc|html|css|md|sql|txt|yml|yaml)$/;
const DASH = String.fromCharCode(0x2014);
const bad = [];
const walk = (dir) => {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name) || name === 'package-lock.json') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p);
    else if (EXT.test(name)) readFileSync(p, 'utf8').split('\n').forEach((line, i) => { if (line.includes(DASH)) bad.push(`${p}:${i + 1}`); });
  }
};
walk('.');
if (bad.length) { console.error('Em dashes found (use a comma, full stop or a backslash-u-2014 escape):\n' + bad.join('\n')); process.exit(1); }
console.log('No em dashes found.');
