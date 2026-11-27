// Studio: build modules from a description, preview them, save versions, roll back.
import { Hono } from 'hono';
import type { Env } from '../types';
import { need, audit } from '../lib/auth';
import { generate, extractJson } from '../ai/router';
import { guardDeep } from '../lib/style-guard';
import { getSettings, menuPages } from '../lib/db';
import { layout } from '../render/layout';
import { renderBlocks } from '../render/blocks';
import { normalizeModule, rowToModule, moduleData, defaults, type ModuleDef } from '../lib/modules';
import { callApi, type Integration } from '../lib/integrations';

type Vars = { Bindings: Env; Variables: { uid: number; user: any } };
const r = new Hono<Vars>();
// Page editors need a module's fields to fill in its blocks, so this one comes before the module rights check.
r.get('/slug/:slug', need('pages.edit'), async (c) => {
  const row = await c.env.DB.prepare('SELECT id, slug, name, fields, version FROM modules WHERE slug = ?').bind(c.req.param('slug')).first<any>();
  return row ? c.json({ ...row, fields: JSON.parse(row.fields || '[]') }) : c.json({ error: 'Not found' }, 404);
});
r.use('*', need('modules.manage'));

const FORMAT = `Answer with only JSON in this shape:
{
  "name": "Short name, 1 to 3 words",
  "slug": "kebab-case-id",
  "description": "One sentence on what it shows",
  "fields": [ { "key": "snake_case", "label": "What Marc sees", "type": "text|textarea|rich|url|image|number|toggle|list", "default": "...", "help": "optional hint", "fields": [ only for type list: the fields of each item, no nested lists ] } ],
  "template": "HTML using {{placeholders}}",
  "css": "CSS for the module",
  "sample": { example values for every field, used for the preview }
}

Template rules:
- {{key}} prints a field (always escaped). {{key.sub}} reaches inside objects. Fields of type "rich" print formatted text.
- {{#each list}} ... {{/each}} repeats for each item; inside, use the item's own keys, {{this}}, {{@index}} or {{@number}}.
- {{#if key}} ... {{else}} ... {{/if}} and {{#unless key}} ... {{/unless}}.
- If a data feed is given, its answer is available as {{data}} (for example {{#each data.items}}).
- Images: <img src="{{photo}}" alt="{{photo_alt}}">. Links: <a href="{{link}}">.
- Allowed: ordinary HTML and inline SVG. Not allowed (removed automatically): script, style tags, iframes, forms, buttons, inputs and on* attributes. No JavaScript at all.
- Do not include an outer <section> or container. The module sits inside the page's own width.
- Use semantic HTML and give elements short class names.

CSS rules:
- Every rule is scoped to the module automatically. Write selectors as if the module were the whole page; use :scope for the module itself.
- Use the site's theme variables, never hard-coded colours or fonts: var(--paper) background, var(--surface) cards, var(--ink) text, var(--muted) quiet text, var(--line) borders, var(--accent) the one strong colour, var(--on-accent) text on the accent, var(--accent2) supporting colour, var(--display) heading font, var(--body) body font, var(--mono) small labels, var(--r) corner radius.
- Mobile first: base styles for phones, then @media (min-width: 720px) and up.
- Keep it calm and well spaced. No gradients, glows, emoji or stock "AI" styling. It should look like part of the site.`;

async function sampleFeed(env: Env, id?: number, path?: string) {
  if (!id) return null;
  const it = await env.DB.prepare("SELECT * FROM integrations WHERE id = ? AND kind = 'api'").bind(id).first<Integration>();
  if (!it) throw new Error('That API connection was not found.');
  const res = await callApi(env, it, path || '');
  if (!res.ok) throw new Error(`The API answered ${res.status}, so there is no sample data to build from.`);
  return { name: it.name, text: (typeof res.data === 'string' ? res.data : JSON.stringify(res.data, null, 1)).slice(0, 6000) };
}

r.get('/', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, slug, name, description, version, active, made_by, updated_at FROM modules ORDER BY name').all();
  const { results: pages } = await c.env.DB.prepare('SELECT id, title, blocks FROM pages').all<{ id: number; title: string; blocks: string }>();
  const used = (slug: string) => pages.filter((p) => p.blocks.includes(`"module":"${slug}"`)).map((p) => ({ id: p.id, title: p.title }));
  return c.json(results.map((m: any) => ({ ...m, usedOn: used(m.slug) })));
});

r.get('/:id{[0-9]+}', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM modules WHERE id = ?').bind(Number(c.req.param('id'))).first();
  return row ? c.json(rowToModule(row)) : c.json({ error: 'Not found' }, 404);
});

/** Build a new module, or change an existing one, from plain English. Nothing is saved yet. */
r.post('/build', need('ai.use'), async (c) => {
  const b = await c.req.json<{ description: string; current?: ModuleDef; choice?: string; source?: { integration?: number; path?: string; cache?: number } }>();
  const ask = String(b.description || '').trim();
  if (ask.length < 8) return c.json({ error: 'Describe what you want in a sentence or two.' }, 400);
  let feed: { name: string; text: string } | null = null;
  try { feed = await sampleFeed(c.env, Number(b.source?.integration) || undefined, b.source?.path); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  const prompt = b.current
    ? `Here is an existing module:\n${JSON.stringify({ name: b.current.name, slug: b.current.slug, description: b.current.description, fields: b.current.fields, template: b.current.template, css: b.current.css, sample: b.current.sample })}\n\nChange it like this: ${ask}\n\nKeep the same slug and keep existing field keys where they still make sense, so blocks already on pages keep their content.`
    : `Build a module for Marc's personal website: ${ask}`;
  try {
    const res = await generate(c.env, {
      task: 'module', choice: b.choice,
      system: `You design small, well-made content blocks for a personal website builder.\n\n${FORMAT}`,
      prompt: `${prompt}${feed ? `\n\nIt shows live data from the "${feed.name}" API. A sample of its answer:\n${feed.text}` : ''}`,
    });
    const def = normalizeModule({ ...extractJson(res.text), ...(b.current ? { slug: b.current.slug } : {}) });
    if (!def.template.trim()) throw new Error('The AI answer had no template. Try again, or describe it differently.');
    if (b.source?.integration) def.source = { integration: Number(b.source.integration), path: String(b.source.path || ''), cache: Math.min(1440, Math.max(5, Number(b.source.cache) || 60)) };
    else if (b.current?.source) def.source = b.current.source;
    return c.json({ def: guardDeep(def), provider: res.provider, model: res.model, flags: res.flags, tried: res.tried });
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

/** A full page with just this module on it, in the site's own theme. */
r.post('/preview', async (c) => {
  const b = await c.req.json<{ def: ModuleDef; values?: Record<string, unknown> }>();
  const def = normalizeModule(b.def);
  def.source = b.def.source ? normalizeModule({ source: b.def.source }).source : null;
  const [s, menu, data] = await Promise.all([getSettings(c.env), menuPages(c.env), moduleData(c.env, def).catch(() => null)]);
  const modules = new Map([[def.slug, { def, data }]]);
  const values = b.values || { ...defaults(def.fields), ...def.sample };
  const body = `<div style="height:24px"></div>${renderBlocks([{ id: 'preview', type: 'module', data: { ...values, module: def.slug } }], { edit: false, posts: [], modules })}`;
  return c.html(layout(s, { title: def.name, path: '/', menu, body, siteUrl: '' }));
});

async function saveVersion(env: Env, id: number, note: string) {
  const cur = await env.DB.prepare('SELECT * FROM modules WHERE id = ?').bind(id).first<any>();
  if (cur) await env.DB.prepare('INSERT INTO module_versions (module_id, version, data, note) VALUES (?, ?, ?, ?)').bind(id, cur.version, JSON.stringify(rowToModule(cur)), note).run();
  return cur;
}

r.post('/', async (c) => {
  const b = await c.req.json<{ def: ModuleDef; made_by?: string }>();
  const def = guardDeep(normalizeModule(b.def));
  def.source = b.def.source ? normalizeModule({ source: b.def.source }).source : null;
  let slug = def.slug;
  if (await c.env.DB.prepare('SELECT 1 FROM modules WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
  const row = await c.env.DB.prepare('INSERT INTO modules (slug, name, description, fields, template, css, source, sample, made_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *')
    .bind(slug, def.name, def.description, JSON.stringify(def.fields), def.template, def.css, def.source ? JSON.stringify(def.source) : null, JSON.stringify(def.sample), String(b.made_by || '').slice(0, 80) || null).first();
  await audit(c, 'module.create', def.name);
  return c.json(rowToModule(row), 201);
});

r.put('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ def: ModuleDef; note?: string; made_by?: string }>();
  const cur = await saveVersion(c.env, id, String(b.note || 'Before an edit').slice(0, 200));
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const def = guardDeep(normalizeModule({ ...b.def, slug: cur.slug }));
  def.source = b.def.source ? normalizeModule({ source: b.def.source }).source : null;
  const row = await c.env.DB.prepare("UPDATE modules SET name=?, description=?, fields=?, template=?, css=?, source=?, sample=?, version=version+1, made_by=COALESCE(?, made_by), updated_at=datetime('now') WHERE id=? RETURNING *")
    .bind(def.name, def.description, JSON.stringify(def.fields), def.template, def.css, def.source ? JSON.stringify(def.source) : null, JSON.stringify(def.sample), String(b.made_by || '').slice(0, 80) || null, id).first();
  await c.env.KV.delete(`mod:data:${cur.slug}`).catch(() => {});
  await audit(c, 'module.update', def.name);
  return c.json(rowToModule(row));
});

r.put('/:id{[0-9]+}/active', async (c) => {
  const { active } = await c.req.json<{ active: boolean }>();
  await c.env.DB.prepare("UPDATE modules SET active = ?, updated_at = datetime('now') WHERE id = ?").bind(active ? 1 : 0, Number(c.req.param('id'))).run();
  await audit(c, active ? 'module.on' : 'module.off', c.req.param('id'));
  return c.json({ ok: true });
});

r.get('/:id{[0-9]+}/versions', async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, version, note, created_at FROM module_versions WHERE module_id = ? ORDER BY id DESC LIMIT 50').bind(Number(c.req.param('id'))).all();
  return c.json(results);
});

r.post('/:id{[0-9]+}/restore/:vid{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const v = await c.env.DB.prepare('SELECT * FROM module_versions WHERE id = ? AND module_id = ?').bind(Number(c.req.param('vid')), id).first<{ data: string; version: number }>();
  if (!v) return c.json({ error: 'Not found' }, 404);
  const cur = await saveVersion(c.env, id, `Before going back to version ${v.version}`);
  const def = normalizeModule({ ...JSON.parse(v.data), slug: cur.slug });
  def.source = JSON.parse(v.data).source ?? null;
  const row = await c.env.DB.prepare("UPDATE modules SET name=?, description=?, fields=?, template=?, css=?, source=?, sample=?, version=version+1, updated_at=datetime('now') WHERE id=? RETURNING *")
    .bind(def.name, def.description, JSON.stringify(def.fields), def.template, def.css, def.source ? JSON.stringify(def.source) : null, JSON.stringify(def.sample), id).first();
  await audit(c, 'module.restore', `${def.name} v${v.version}`);
  return c.json(rowToModule(row));
});

r.delete('/:id{[0-9]+}', async (c) => {
  const id = Number(c.req.param('id'));
  const m = await c.env.DB.prepare('SELECT slug, name FROM modules WHERE id = ?').bind(id).first<{ slug: string; name: string }>();
  if (!m) return c.json({ ok: true });
  const used = await c.env.DB.prepare('SELECT title FROM pages WHERE blocks LIKE ?').bind(`%"module":"${m.slug}"%`).all<{ title: string }>();
  if (used.results.length) return c.json({ error: `It is still on ${used.results.map((p) => p.title).join(', ')}. Remove it from those pages first, or switch it off instead.` }, 400);
  await c.env.DB.prepare('DELETE FROM modules WHERE id = ?').bind(id).run();
  await audit(c, 'module.delete', m.name);
  return c.json({ ok: true });
});

export default r;
