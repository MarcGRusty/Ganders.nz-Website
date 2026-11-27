// Design inspiration: files and websites Marc likes, which the AI turns into a theme.
import { Hono } from 'hono';
import type { Env } from '../types';
import { need, audit } from '../lib/auth';
import { generate, extractJson } from '../ai/router';
import { normalizeTheme, contrast, FONT_SPECS } from '../lib/themes';
import { guard } from '../lib/style-guard';

type Vars = { Bindings: Env; Variables: { uid: number; user: any } };
const r = new Hono<Vars>();
const ok = need('design.edit');

r.get('/', ok, async (c) => {
  const { results } = await c.env.DB.prepare('SELECT * FROM inspiration ORDER BY id DESC LIMIT 60').all();
  return c.json(results);
});

r.post('/', ok, async (c) => {
  const b = await c.req.json<{ kind: string; url?: string; media_key?: string; title?: string; note?: string; palette?: string[] }>();
  const note = guard(String(b.note || '')).text.slice(0, 500);
  if (b.kind === 'url') {
    let u: URL;
    try { u = new URL(String(b.url || '').trim().match(/^https?:\/\//i) ? String(b.url).trim() : `https://${String(b.url || '').trim()}`); } catch { return c.json({ error: 'That does not look like a web address.' }, 400); }
    if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) return c.json({ error: 'That does not look like a web address.' }, 400);
    const row = await c.env.DB.prepare("INSERT INTO inspiration (kind, url, title, note) VALUES ('url', ?, ?, ?) RETURNING *").bind(u.toString(), u.hostname.replace(/^www\./, ''), note).first();
    return c.json(row, 201);
  }
  if (b.kind === 'file' && b.media_key) {
    const m = await c.env.DB.prepare('SELECT key, name FROM media WHERE key = ?').bind(b.media_key).first<{ key: string; name: string }>();
    if (!m) return c.json({ error: 'File not found.' }, 404);
    const palette = (b.palette || []).filter((x) => /^#[0-9a-f]{6}$/i.test(x)).slice(0, 8);
    const row = await c.env.DB.prepare("INSERT INTO inspiration (kind, media_key, title, note, summary) VALUES ('file', ?, ?, ?, ?) RETURNING *")
      .bind(m.key, String(b.title || m.name).slice(0, 120), note, palette.length ? JSON.stringify({ palette }) : null).first();
    return c.json(row, 201);
  }
  return c.json({ error: 'Add a file or a web address.' }, 400);
});

r.put('/:id{[0-9]+}', ok, async (c) => {
  const { note } = await c.req.json<{ note: string }>();
  await c.env.DB.prepare('UPDATE inspiration SET note = ? WHERE id = ?').bind(guard(String(note || '')).text.slice(0, 500), Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

r.delete('/:id{[0-9]+}', ok, async (c) => {
  await c.env.DB.prepare('DELETE FROM inspiration WHERE id = ?').bind(Number(c.req.param('id'))).run();
  return c.json({ ok: true });
});

/** Pull colours, fonts and tone from a web page without running it. */
async function readSite(url: string) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const res = await fetch(url, { signal: ctl.signal, headers: { 'user-agent': 'Mozilla/5.0 (compatible; GandersStudio/1.0; design reference)', accept: 'text/html' }, redirect: 'follow' });
    if (!res.ok) return `Could not open (${res.status}).`;
    const html = (await res.text()).slice(0, 400_000);
    const title = html.match(/<title[^>]*>([^<]{0,120})/i)?.[1]?.trim() || '';
    const desc = html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']{0,200})/i)?.[1] || '';
    const themeColor = html.match(/<meta[^>]+name=["']theme-color["'][^>]+content=["']([^"']+)/i)?.[1] || '';
    // Up to two linked stylesheets on the same site, for colours and fonts.
    let css = [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/gi)].map((m) => m[1]).join('\n');
    const links = [...html.matchAll(/<link[^>]+rel=["']stylesheet["'][^>]*>/gi)].map((m) => m[0].match(/href=["']([^"']+)/i)?.[1]).filter(Boolean) as string[];
    const googleFonts = links.filter((h) => h.includes('fonts.googleapis.com')).flatMap((h) => [...decodeURIComponent(h).matchAll(/family=([^:&]+)/g)].map((m) => m[1].replace(/\+/g, ' ')));
    for (const href of links.filter((h) => !h.includes('fonts.googleapis.com')).slice(0, 2)) {
      try {
        const cr = await fetch(new URL(href, url).toString(), { signal: ctl.signal });
        if (cr.ok) css += '\n' + (await cr.text()).slice(0, 300_000);
      } catch { /* skip */ }
    }
    const count = (re: RegExp) => { const m = new Map<string, number>(); for (const x of css.matchAll(re)) { const k = x[1].toLowerCase(); m.set(k, (m.get(k) || 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
    const colours = count(/(#[0-9a-f]{6})\b/gi).slice(0, 14).map(([k]) => k);
    const fonts = count(/font-family\s*:\s*["']?([^;,"'}]+)/gi).map(([k]) => k.trim()).filter((f) => !/inherit|var\(|system-ui|sans-serif|serif|monospace/i.test(f)).slice(0, 6);
    const radii = count(/border-radius\s*:\s*([0-9.]+(?:px|rem|em|%))/gi).slice(0, 4).map(([k]) => k);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 700);
    return [`Title: ${title}`, desc && `Description: ${desc}`, themeColor && `Theme colour: ${themeColor}`, colours.length && `Most used colours: ${colours.join(', ')}`,
      (googleFonts.length || fonts.length) && `Fonts: ${[...new Set([...googleFonts, ...fonts])].join(', ')}`, radii.length && `Corner radii used: ${radii.join(', ')}`, `Opening text: ${text}`].filter(Boolean).join('\n');
  } catch (e) {
    return `Could not open (${(e as Error).name === 'AbortError' ? 'took too long' : 'blocked'}).`;
  } finally { clearTimeout(t); }
}

function b64(bytes: Uint8Array) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

r.post('/theme', need('design.edit', 'ai.use'), async (c) => {
  const { brief, choice } = await c.req.json<{ brief?: string; choice?: string }>().catch(() => ({} as any));
  const { results } = await c.env.DB.prepare('SELECT * FROM inspiration ORDER BY id DESC LIMIT 12').all<any>();
  if (!results.length) return c.json({ error: 'Add some files or websites first.' }, 400);

  const notes: string[] = [];
  const files: { mime: string; data: string; name?: string }[] = [];
  for (const it of results) {
    if (it.kind === 'url') {
      const info = await readSite(it.url);
      await c.env.DB.prepare('UPDATE inspiration SET summary = ? WHERE id = ?').bind(info.slice(0, 2000), it.id).run();
      notes.push(`Website ${it.url}${it.note ? ` (Marc says: ${it.note})` : ''}\n${info}`);
    } else {
      const m = await c.env.DB.prepare('SELECT key, type, name, size FROM media WHERE key = ?').bind(it.media_key).first<any>();
      const pal = it.summary ? (JSON.parse(it.summary).palette || []) : [];
      notes.push(`File "${it.title}"${it.note ? ` (Marc says: ${it.note})` : ''}${pal.length ? `\nMain colours: ${pal.join(', ')}` : ''}`);
      if (m && files.length < 6 && m.size <= 4_500_000 && (/^image\/(png|jpeg|webp|gif)$/.test(m.type) || m.type === 'application/pdf')) {
        const obj = await c.env.MEDIA.get(m.key);
        if (obj) files.push({ mime: m.type, data: b64(new Uint8Array(await obj.arrayBuffer())), name: m.name });
      }
    }
  }

  const prompt = `Design a website theme for Marc's personal site, ganders.nz, drawn from the inspiration below. Take the mood, colour relationships, type character and shape from it; do not copy any one site exactly.
${brief ? `\nWhat Marc wants: ${brief}\n` : ''}
Inspiration:
${notes.join('\n\n')}

Rules:
- Give it a quiet New Zealand feel where it fits (light, coast, weather, bush, bach, harbour), without Maori patterns or motifs such as koru or kowhaiwhai.
- Avoid the generic AI look: no purple or violet accents, no cream background with a serif and terracotta, no big rounded corners everywhere, no soft glows.
- Text on background must reach at least 7:1 contrast, quiet text 4.5:1, text on the accent 4.5:1, in both light and dark.
- Design the dark palette on its own terms (a warmer or lighter accent at night), not an inversion.
- Fonts must be on Google Fonts. Prefer these when they suit: ${Object.keys(FONT_SPECS).join(', ')}.

Answer with JSON only, in this shape:
{"name": "two or three words", "why": "two sentences on what you took from the inspiration",
 "light": {"paper":"#RRGGBB","surface":"#RRGGBB","ink":"#RRGGBB","muted":"#RRGGBB","line":"#RRGGBB","accent":"#RRGGBB","onAccent":"#RRGGBB","accent2":"#RRGGBB"},
 "dark": {same keys},
 "displayFont": "...", "bodyFont": "...", "monoFont": "...", "displayWeight": 400-900, "displayWidth": 75-125, "displayUpper": true|false, "displayItalic": true|false,
 "radius": 0-24 or 999 for pill buttons, "border": 0-3, "shadow": "none"|"hard"|"soft", "texture": "none"|"contour"|"dots"|"grain"}`;

  try {
    const out = await generate(c.env, { task: 'design', prompt, choice, files, system: 'You are a careful visual designer. You answer with valid JSON only.' });
    const raw = extractJson<any>(out.text);
    const theme = normalizeTheme({ ...raw, preset: `custom-${Date.now().toString(36)}`, name: String(raw.name || 'From inspiration').slice(0, 40), mode: 'auto', toggle: true, motion: true, maxWidth: 1120, textureStrength: 0.6 });
    // Nudge any colour pair that misses the contrast floor rather than handing back a hard-to-read theme.
    const warnings: string[] = [];
    for (const k of ['light', 'dark'] as const) {
      const p = theme[k];
      if (contrast(p.ink, p.paper) < 7) warnings.push(`${k} text contrast is ${contrast(p.ink, p.paper).toFixed(1)}:1`);
      if (contrast(p.onAccent, p.accent) < 4.5) p.onAccent = contrast('#FFFFFF', p.accent) >= contrast(p.paper, p.accent) ? '#FFFFFF' : p.paper;
    }
    await audit(c, 'design.inspire', theme.name);
    return c.json({ theme, why: guard(String(raw.why || '')).text, provider: out.provider, model: out.model, tried: out.tried, seen: files.length, warnings });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

export default r;
