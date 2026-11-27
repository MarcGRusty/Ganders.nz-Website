// Modules: page blocks built from a description. A module is data, not code: a list of fields,
// an HTML template with {{placeholders}}, scoped CSS, and optionally a data feed from a saved
// API connection. Templates are cleaned to an allowlist on save and again when rendered, so a
// module can never run scripts or reach outside its own block.
import type { Env, Block } from '../types';
import { callApi, pick, type Integration } from './integrations';
import { clean } from '../render/html';

export type FieldType = 'text' | 'textarea' | 'rich' | 'url' | 'image' | 'number' | 'toggle' | 'list';
export interface Field { key: string; label: string; type: FieldType; default?: unknown; fields?: Field[]; help?: string }
export interface Source { integration: number; path: string; cache: number }
export interface ModuleDef {
  id?: number; slug: string; name: string; description: string; fields: Field[]; template: string; css: string;
  source: Source | null; sample: Record<string, unknown>; version?: number; active?: number;
}

const TYPES: FieldType[] = ['text', 'textarea', 'rich', 'url', 'image', 'number', 'toggle', 'list'];
const keyOk = (k: string) => /^[a-z][a-z0-9_]{0,39}$/.test(k) && !['module', 'data', 'this', 'constructor', 'prototype', '__proto__'].includes(k);

export function cleanFields(list: unknown, depth = 0): Field[] {
  if (!Array.isArray(list)) return [];
  const out: Field[] = [];
  for (const f of list.slice(0, 30)) {
    const key = String(f?.key || '').trim().toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!keyOk(key) || out.some((o) => o.key === key)) continue;
    const type = TYPES.includes(f.type) ? f.type : 'text';
    if (type === 'list' && depth > 0) continue;
    const field: Field = { key, label: String(f.label || key).slice(0, 60), type };
    if (f.help) field.help = String(f.help).slice(0, 160);
    if (type === 'list') field.fields = cleanFields(f.fields, 1).filter((s) => s.type !== 'list');
    if (f.default !== undefined) field.default = type === 'list' ? (Array.isArray(f.default) ? f.default.slice(0, 20) : []) : type === 'number' ? Number(f.default) || 0 : type === 'toggle' ? !!f.default : String(f.default).slice(0, 5000);
    out.push(field);
  }
  return out;
}

export function defaults(fields: Field[]): Record<string, unknown> {
  const o: Record<string, unknown> = {};
  for (const f of fields) o[f.key] = f.default ?? (f.type === 'list' ? [] : f.type === 'number' ? 0 : f.type === 'toggle' ? false : '');
  return o;
}

// ---------- HTML allowlist ----------
const TAGS = new Set(['div', 'span', 'p', 'a', 'strong', 'em', 'b', 'i', 'u', 's', 'small', 'mark', 'sup', 'sub', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'img', 'figure', 'figcaption', 'blockquote', 'cite', 'q', 'section', 'article', 'header', 'footer', 'aside', 'nav', 'time', 'br', 'hr', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'dl', 'dt', 'dd', 'details', 'summary', 'picture', 'code', 'pre', 'abbr', 'address', 'meter', 'progress',
  'svg', 'g', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'text', 'tspan', 'title', 'defs', 'lineargradient', 'radialgradient', 'stop', 'use', 'symbol']);
const DROP_WITH_CONTENT = new Set(['script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript', 'textarea', 'select', 'form', 'input', 'button', 'link', 'meta', 'base', 'frame', 'frameset', 'applet', 'math', 'foreignobject', 'animate', 'set', 'animatetransform', 'animatemotion', 'handler', 'xmp', 'plaintext', 'noembed', 'noframes']);
const VOID = new Set(['img', 'br', 'hr', 'path', 'circle', 'ellipse', 'rect', 'line', 'polyline', 'polygon', 'stop', 'use']);
const ATTRS = new Set(['class', 'id', 'href', 'src', 'srcset', 'sizes', 'alt', 'title', 'width', 'height', 'loading', 'decoding', 'datetime', 'role', 'open', 'colspan', 'rowspan', 'scope', 'target', 'rel', 'lang', 'dir', 'value', 'min', 'max', 'low', 'high', 'optimum', 'style', 'start', 'reversed',
  'viewbox', 'd', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'stroke-dashoffset', 'opacity', 'fill-opacity', 'stroke-opacity', 'fill-rule', 'clip-rule', 'cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'x1', 'y1', 'x2', 'y2', 'points', 'transform', 'xmlns', 'preserveaspectratio', 'text-anchor', 'font-size', 'font-weight', 'dominant-baseline', 'offset', 'stop-color', 'stop-opacity', 'gradientunits', 'gradienttransform', 'pathlength', 'focusable']);

const safeHref = (v: string) => {
  const s = v.trim().replace(/[\u0000-\u001F\u007F\s]+/g, '');
  if (/^\{\{[^}]+\}\}$/.test(v.trim())) return v.trim(); // a placeholder: checked again after rendering
  return /^(https?:|mailto:|tel:|\/(?!\/)|#|\.\/)/i.test(s) || !/^[a-z][a-z0-9+.-]*:/i.test(s) ? v.trim() : '';
};
const safeSrc = (v: string) => {
  const s = v.trim();
  if (/^\{\{[^}]+\}\}$/.test(s)) return s;
  return /^(https:\/\/|\/media\/|\/(?!\/))/i.test(s) ? s : '';
};

/** Clean HTML down to the allowlist. Used on templates at save time and on every rendered module. */
export function sanitizeHtml(html: string): string {
  let s = String(html || '').replace(/<!--[\s\S]*?-->/g, '').replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<![^>]*>/g, '').replace(/<\?[\s\S]*?\?>/g, '');
  // Remove dangerous elements with their content.
  for (const t of DROP_WITH_CONTENT) s = s.replace(new RegExp(`<${t}\\b[\\s\\S]*?(<\\/${t}\\s*>|$)`, 'gi'), '').replace(new RegExp(`<\\/?${t}\\b[^>]*>`, 'gi'), '');
  // Anything that looks like the start of a tag but is not a complete one is escaped, so a broken
  // tag can't swallow the markup that follows it.
  return s.replace(/<(\/?)([a-zA-Z][\w:-]*)((?:[^<>"']|"[^"]*"|'[^']*')*)>|</g, (_m, close: string, rawTag: string | undefined, rawAttrs: string) => {
    if (rawTag === undefined) return '&lt;';
    const tag = rawTag.toLowerCase();
    if (!TAGS.has(tag)) return '';
    if (close) return VOID.has(tag) && tag !== 'path' ? '' : `</${tag}>`;
    const out: string[] = [];
    let blank = false;
    for (const m of rawAttrs.matchAll(/([^\s"'>\/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g)) {
      const name = m[1].toLowerCase();
      let v = m[2] ?? m[3] ?? m[4] ?? '';
      if (name.startsWith('on') || name === 'xlink:href' || name === 'formaction') continue;
      const aria = /^(aria|data)-[a-z0-9-]{1,40}$/.test(name);
      if (!ATTRS.has(name) && !aria) continue;
      if (name === 'href') { v = safeHref(v); if (!v) continue; }
      if (name === 'src') { v = safeSrc(v); if (!v) continue; }
      if (name === 'srcset' && /javascript:|data:/i.test(v)) continue;
      if (name === 'style') { v = cleanDecls(v); if (!v) continue; }
      if (name === 'target') { if (v !== '_blank') continue; blank = true; }
      if (name === 'rel') continue; // set below
      if (tag === 'use' && name === 'href' && !v.startsWith('#')) continue;
      out.push(`${name}="${v.replace(/"/g, '&quot;').replace(/</g, '&lt;')}"`);
    }
    if (blank) out.push('rel="noopener noreferrer"');
    const selfClose = /\/\s*$/.test(rawAttrs) && (tag !== 'img' && tag !== 'br' && tag !== 'hr');
    return `<${tag}${out.length ? ` ${out.join(' ')}` : ''}${selfClose ? ' /' : ''}>`;
  });
}

// ---------- CSS ----------
/** Declarations only: no imports, no scripts, images only from https or this site. */
function cleanDecls(css: string) {
  let s = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/[<>]/g, '');
  if (/expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import|\\/i.test(s)) s = s.replace(/[^;]*(expression\s*\(|javascript:|vbscript:|behaviou?r\s*:|-moz-binding|@import|\\)[^;]*;?/gi, '');
  s = s.replace(/url\(\s*(['"]?)(.*?)\1\s*\)/gi, (m, _q, u) => (/^(https:\/\/|\/media\/)/i.test(u.trim()) ? `url("${u.trim().replace(/"/g, '')}")` : 'none'));
  return s.trim();
}

/** Scope every rule to the module's own class, so a module can only style itself. */
export function scopeCss(css: string, scope: string): string {
  const src = String(css || '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/<\/?style[^>]*>/gi, '').replace(/@(import|charset|namespace|font-face)[^;{]*(;|\{[^}]*\})/gi, '');
  let i = 0;
  const out: string[] = [];
  const read = (until: string): string => { let depth = 0, buf = ''; while (i < src.length) { const ch = src[i++]; if (ch === '{') depth++; if (ch === '}') { if (depth === 0) { if (until === '}') return buf; } else depth--; } buf += ch; } return buf; };
  const block = (inner: string) => scopeCss(inner, scope);
  while (i < src.length) {
    const open = src.indexOf('{', i);
    if (open < 0) break;
    const sel = src.slice(i, open).trim();
    i = open + 1;
    const body = read('}');
    if (!sel) continue;
    if (/^@(media|supports|container|layer)\b/i.test(sel)) { out.push(`${sel.replace(/[<>]/g, '')}{${block(body)}}`); continue; }
    if (/^@keyframes\s+[\w-]+$/i.test(sel)) { out.push(`${sel}{${body.replace(/[^{}]*\{[^}]*\}/g, (r) => r.replace(/\{([^}]*)\}/, (_x, d) => `{${cleanDecls(d)}}`))}}`); continue; }
    if (sel.startsWith('@')) continue;
    const sels = sel.split(',').map((x) => x.trim()).filter(Boolean).map((x) => {
      if (x === ':scope' || x === '&' || x === ':host') return scope;
      if (/^(:scope|&)/.test(x)) return `${scope}${x.replace(/^(:scope|&)/, '')}`;
      if (/^(html|body|:root)\b/.test(x)) return `${scope} ${x.replace(/^(html|body|:root)\s*/, '')}`.trim();
      return `${scope} ${x}`;
    });
    out.push(`${sels.join(',')}{${cleanDecls(body)}}`);
  }
  return out.join('\n');
}

// ---------- Templates ----------
// {{key}} prints a value (escaped). {{key.sub}} reaches inside. Rich text fields print cleaned HTML.
// {{#each list}}...{{/each}} repeats, with {{this}} or the item's own keys, {{@index}} and {{@number}}.
// {{#if key}}...{{else}}...{{/if}} and {{#unless key}}...{{/unless}} show parts only when a value is set.
const escHtml = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
type Scope = { vars: Record<string, unknown>; parent?: Scope; rich: Set<string> };
const lookup = (sc: Scope, path: string): unknown => {
  if (path === 'this') return sc.vars.this;
  const [head, ...rest] = path.split('.');
  let s: Scope | undefined = sc;
  while (s && !(head in s.vars)) s = s.parent;
  const base = s ? s.vars[head] : undefined;
  return rest.length ? pick(base, rest.join('.')) : base;
};
const truthy = (v: unknown) => (Array.isArray(v) ? v.length > 0 : !!v && v !== '0' && v !== 'false');

export function renderTemplate(tpl: string, vars: Record<string, unknown>, rich: Set<string> = new Set()): string {
  return run(String(tpl || ''), { vars, rich });
}

function run(tpl: string, sc: Scope): string {
  let out = '';
  let i = 0;
  while (i < tpl.length) {
    const open = tpl.indexOf('{{', i);
    if (open < 0) { out += tpl.slice(i); break; }
    out += tpl.slice(i, open);
    const close = tpl.indexOf('}}', open);
    if (close < 0) { out += tpl.slice(open); break; }
    const tag = tpl.slice(open + 2, close).trim();
    i = close + 2;
    const blk = tag.match(/^#(each|if|unless)\s+([\w.@]+)$/);
    if (blk) {
      const [, kind, path] = blk;
      const end = findEnd(tpl, i, kind);
      const inner = tpl.slice(i, end.start);
      i = end.after;
      const [yes, no] = splitElse(inner);
      const v = lookup(sc, path);
      if (kind === 'each') {
        const list = Array.isArray(v) ? v.slice(0, 100) : [];
        out += list.length ? list.map((item, n) => run(yes, { vars: { ...(item && typeof item === 'object' ? item as object : {}), this: item, '@index': n, '@number': n + 1, '@first': n === 0, '@last': n === list.length - 1 }, parent: sc, rich: sc.rich })).join('') : run(no, sc);
      } else out += (kind === 'if' ? truthy(v) : !truthy(v)) ? run(yes, sc) : run(no, sc);
      continue;
    }
    if (/^[\w.@]+$/.test(tag)) {
      const v = lookup(sc, tag);
      const last = tag.split('.').pop()!;
      out += sc.rich.has(last) && typeof v === 'string' ? clean(v) : escHtml(typeof v === 'object' && v !== null ? '' : v);
    }
  }
  return out;
}

function findEnd(tpl: string, from: number, kind: string) {
  const re = /\{\{\s*([#/])(each|if|unless)\b[^}]*\}\}/g;
  re.lastIndex = from;
  let depth = 0, m: RegExpExecArray | null;
  while ((m = re.exec(tpl))) {
    if (m[1] === '#') depth++;
    else if (depth === 0) return { start: m.index, after: m.index + m[0].length };
    else depth--;
  }
  void kind;
  return { start: tpl.length, after: tpl.length };
}

function splitElse(inner: string): [string, string] {
  const re = /\{\{\s*(#(?:each|if|unless)\b[^}]*|\/(?:each|if|unless)|else)\s*\}\}/g;
  let depth = 0, m: RegExpExecArray | null;
  while ((m = re.exec(inner))) {
    if (m[1].startsWith('#')) depth++;
    else if (m[1].startsWith('/')) depth--;
    else if (depth === 0) return [inner.slice(0, m.index), inner.slice(m.index + m[0].length)];
  }
  return [inner, ''];
}

// ---------- Loading and rendering ----------
export function normalizeModule(raw: any): ModuleDef {
  const slug = String(raw.slug || raw.name || 'module').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'module';
  const fields = cleanFields(raw.fields);
  let source: Source | null = null;
  if (raw.source && Number(raw.source.integration)) source = { integration: Number(raw.source.integration), path: String(raw.source.path || '').slice(0, 300), cache: Math.min(1440, Math.max(5, Number(raw.source.cache) || 60)) };
  return {
    slug, name: String(raw.name || 'Module').slice(0, 60), description: String(raw.description || '').slice(0, 2000), fields,
    template: sanitizeHtml(String(raw.template || '')).slice(0, 40_000), css: String(raw.css || '').slice(0, 30_000), source,
    sample: raw.sample && typeof raw.sample === 'object' ? raw.sample : {},
  };
}

export const rowToModule = (r: any): ModuleDef => ({ ...r, fields: JSON.parse(r.fields || '[]'), source: r.source ? JSON.parse(r.source) : null, sample: JSON.parse(r.sample || '{}') });

/** The feed a module reads from, cached in KV for the module's cache time. */
export async function moduleData(env: Env, m: ModuleDef, fresh = false): Promise<unknown> {
  if (!m.source) return null;
  const k = `mod:data:${m.slug}:${m.source.integration}:${m.source.path}`;
  if (!fresh) { const hit = await env.KV.get(k, 'json').catch(() => null); if (hit) return (hit as any).v; }
  const it = await env.DB.prepare("SELECT * FROM integrations WHERE id = ? AND kind = 'api' AND active = 1").bind(m.source.integration).first<Integration>();
  if (!it) return null;
  try {
    const r = await callApi(env, it, m.source.path, { timeout: 6000 });
    if (!r.ok) return null;
    await env.KV.put(k, JSON.stringify({ v: r.data }), { expirationTtl: Math.max(60, m.source.cache * 60) }).catch(() => {});
    return r.data;
  } catch { return null; }
}

export interface LoadedModule { def: ModuleDef; data: unknown }

/** Load every module a set of blocks uses, with its feed. Called before rendering a page. */
export async function loadModules(env: Env, blocks: Block[]): Promise<Map<string, LoadedModule>> {
  const slugs = [...new Set(blocks.filter((b) => b.type === 'module' && b.data?.module).map((b) => String(b.data.module)))];
  const map = new Map<string, LoadedModule>();
  if (!slugs.length) return map;
  const { results } = await env.DB.prepare(`SELECT * FROM modules WHERE active = 1 AND slug IN (${slugs.map(() => '?').join(',')})`).bind(...slugs).all();
  await Promise.all(results.map(async (r) => { const def = rowToModule(r); map.set(def.slug, { def, data: await moduleData(env, def) }); }));
  return map;
}

export function renderModule(m: LoadedModule, values: Record<string, unknown>) {
  const rich = new Set(m.def.fields.flatMap((f) => [f, ...(f.fields || [])]).filter((f) => f.type === 'rich').map((f) => f.key));
  const vars = { ...defaults(m.def.fields), ...values, data: m.data };
  const scope = `.m-${m.def.slug}`;
  const html = sanitizeHtml(renderTemplate(m.def.template, vars, rich));
  return { html, css: scopeCss(m.def.css, scope) };
}
