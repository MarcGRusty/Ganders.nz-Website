// Knowledge base and Create Ideas: Marc's own material becomes post ideas, then drafts that
// wait in review until he approves them. Nothing is published without a person.
import { Hono } from 'hono';
import type { Env } from '../types';
import { need, audit } from '../lib/auth';
import { generate, extractJson } from '../ai/router';
import { guard, stripDashes } from '../lib/style-guard';
import { getPostById, slugify, getSettings } from '../lib/db';
import { pageText } from '../lib/pagetext';

type Vars = { Bindings: Env; Variables: { uid: number; user: any } };
export const knowledge = new Hono<Vars>();
export const ideas = new Hono<Vars>();

// ---------------- Knowledge base ----------------
async function index(env: Env, id: number, title: string, body: string) {
  await env.DB.prepare('DELETE FROM knowledge_fts WHERE rowid = ?').bind(id).run();
  await env.DB.prepare('INSERT INTO knowledge_fts (rowid, title, body) VALUES (?, ?, ?)').bind(id, title, body).run();
}

knowledge.get('/', need('ideas.use'), async (c) => {
  const { results } = await c.env.DB.prepare('SELECT id, kind, title, url, file_key, active, length(body) AS chars, substr(body, 1, 240) AS snippet, created_at, updated_at FROM knowledge ORDER BY id DESC LIMIT 500').all();
  return c.json(results);
});

knowledge.get('/:id{[0-9]+}', need('ideas.use'), async (c) => {
  const k = await c.env.DB.prepare('SELECT * FROM knowledge WHERE id = ?').bind(Number(c.req.param('id'))).first();
  return k ? c.json(k) : c.json({ error: 'Not found' }, 404);
});

knowledge.post('/', need('ideas.use'), async (c) => {
  const b = await c.req.json<{ kind: string; title?: string; body?: string; url?: string }>();
  let kind = b.kind, title = String(b.title || '').trim(), body = String(b.body || '').trim(), url: string | null = null;
  if (kind === 'url') {
    try { url = new URL(/^https?:\/\//i.test(String(b.url).trim()) ? String(b.url).trim() : `https://${String(b.url || '').trim()}`).toString(); } catch { return c.json({ error: 'That does not look like a web address.' }, 400); }
    try { const p = await pageText(url); title = title || p.title; body = p.text; } catch (e) { return c.json({ error: (e as Error).message }, 400); }
    if (body.length < 80) return c.json({ error: 'Could not find readable text on that page. Copy the text into a note instead.' }, 400);
  } else {
    kind = 'note';
    if (!body) return c.json({ error: 'Write something first.' }, 400);
    title = title || body.split('\n')[0].slice(0, 80);
  }
  body = stripDashes(body).slice(0, 60_000);
  title = stripDashes(title).slice(0, 200);
  const r = await c.env.DB.prepare('INSERT INTO knowledge (kind, title, body, url) VALUES (?, ?, ?, ?) RETURNING id').bind(kind, title, body, url).first<{ id: number }>();
  await index(c.env, r!.id, title, body);
  await audit(c, 'knowledge.add', title);
  return c.json({ id: r!.id, title, kind, chars: body.length }, 201);
});

// Text files are read straight in; PDFs are kept and shown to AI services that can read them.
knowledge.post('/upload', need('ideas.use'), async (c) => {
  const form = await c.req.parseBody();
  const file = form.file as File | undefined;
  if (!file || typeof file === 'string') return c.json({ error: 'No file.' }, 400);
  if (file.size > 15 * 1024 * 1024) return c.json({ error: 'Files must be under 15 MB.' }, 400);
  const title = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').slice(0, 200);
  let body = '', fileKey: string | null = null;
  if (/^text\/|\.(md|txt|csv)$/i.test(file.type || file.name)) body = stripDashes(await file.text()).slice(0, 60_000);
  else if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name)) {
    fileKey = `kb/${crypto.randomUUID().slice(0, 8)}-${slugify(title)}.pdf`;
    await c.env.MEDIA.put(fileKey, file.stream(), { httpMetadata: { contentType: 'application/pdf' } });
    body = String(form.note || '');
  } else return c.json({ error: 'Add text, Markdown or PDF files here. Photos go in Media.' }, 400);
  const r = await c.env.DB.prepare("INSERT INTO knowledge (kind, title, body, file_key) VALUES ('file', ?, ?, ?) RETURNING id").bind(title, body, fileKey).first<{ id: number }>();
  await index(c.env, r!.id, title, body);
  await audit(c, 'knowledge.add', title);
  return c.json({ id: r!.id, title }, 201);
});

knowledge.put('/:id{[0-9]+}', need('ideas.use'), async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ title?: string; body?: string; active?: boolean }>();
  const cur = await c.env.DB.prepare('SELECT title, body FROM knowledge WHERE id = ?').bind(id).first<{ title: string; body: string }>();
  if (!cur) return c.json({ error: 'Not found' }, 404);
  const title = b.title !== undefined ? stripDashes(String(b.title)).slice(0, 200) : cur.title;
  const body = b.body !== undefined ? stripDashes(String(b.body)).slice(0, 60_000) : cur.body;
  await c.env.DB.prepare("UPDATE knowledge SET title = ?, body = ?, active = COALESCE(?, active), updated_at = datetime('now') WHERE id = ?")
    .bind(title, body, b.active === undefined ? null : b.active ? 1 : 0, id).run();
  await index(c.env, id, title, body);
  return c.json({ ok: true });
});

knowledge.delete('/:id{[0-9]+}', need('ideas.use'), async (c) => {
  const id = Number(c.req.param('id'));
  const k = await c.env.DB.prepare('SELECT title, file_key FROM knowledge WHERE id = ?').bind(id).first<{ title: string; file_key: string | null }>();
  if (k?.file_key) await c.env.MEDIA.delete(k.file_key);
  await c.env.DB.prepare('DELETE FROM knowledge WHERE id = ?').bind(id).run();
  await c.env.DB.prepare('DELETE FROM knowledge_fts WHERE rowid = ?').bind(id).run();
  await audit(c, 'knowledge.delete', k?.title || `#${id}`);
  return c.json({ ok: true });
});

// ---------------- Context for the AI ----------------
interface KRow { id: number; title: string; body: string; file_key: string | null }

/** The most relevant knowledge for a topic, or a spread of recent and older material. */
async function gather(env: Env, topic: string, budget = 14_000) {
  let rows: KRow[] = [];
  const words = topic.toLowerCase().match(/[a-z0-9À-ɏ]{3,}/g) || [];
  if (words.length) {
    const q = [...new Set(words)].slice(0, 12).map((w) => `"${w}"`).join(' OR ');
    rows = (await env.DB.prepare('SELECT k.id, k.title, k.body, k.file_key FROM knowledge_fts f JOIN knowledge k ON k.id = f.rowid WHERE knowledge_fts MATCH ? AND k.active = 1 ORDER BY rank LIMIT 8')
      .bind(q).all<KRow>().catch(() => ({ results: [] as KRow[] }))).results;
  }
  if (rows.length < 4) {
    const seen = new Set(rows.map((r) => r.id));
    const more = (await env.DB.prepare('SELECT id, title, body, file_key FROM (SELECT * FROM knowledge WHERE active = 1 ORDER BY id DESC LIMIT 6) UNION SELECT id, title, body, file_key FROM (SELECT * FROM knowledge WHERE active = 1 ORDER BY random() LIMIT 6)').all<KRow>()).results;
    rows = [...rows, ...more.filter((r) => !seen.has(r.id))].slice(0, 10);
  }
  const per = Math.max(600, Math.floor(budget / Math.max(rows.length, 1)));
  const text = rows.map((r) => `[K${r.id}] ${r.title}\n${r.body.slice(0, per)}`).join('\n\n---\n\n');
  const files: { mime: string; data: string; name: string }[] = [];
  for (const r of rows.filter((x) => x.file_key).slice(0, 2)) {
    const obj = await env.MEDIA.get(r.file_key!);
    if (!obj || obj.size > 4_500_000) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    files.push({ mime: 'application/pdf', data: btoa(s), name: `K${r.id} ${r.title}` });
  }
  return { text, files, ids: rows.map((r) => r.id) };
}

async function recentTitles(env: Env) {
  const { results } = await env.DB.prepare("SELECT title FROM posts WHERE status != 'idea' OR created_at > datetime('now', '-30 days') ORDER BY id DESC LIMIT 40").all<{ title: string }>();
  return results.map((r) => r.title);
}

// ---------------- Create Ideas ----------------
ideas.post('/create', need('ideas.use', 'ai.use', 'posts.edit'), async (c) => {
  const b = await c.req.json<{ topic?: string; count?: number; choice?: string }>().catch(() => ({} as any));
  const topic = String(b.topic || '').trim().slice(0, 300);
  const count = Math.min(8, Math.max(1, Number(b.count) || 5));
  const kb = await gather(c.env, topic);
  const s = await getSettings(c.env);
  const avoid = await recentTitles(c.env);
  if (!kb.text && !topic) return c.json({ error: 'Add a few notes or links to your knowledge base first, or type a topic.' }, 400);
  const prompt = `Suggest ${count} blog post ideas for ${s.name}'s personal website.${topic ? `\nFocus: ${topic}` : ''}

Ground every idea in Marc's own material below. Prefer specific stories, lessons and opinions that only he could write, over general advice anyone could find. Mix practical, personal and reflective pieces.
${avoid.length ? `\nAlready written or planned (do not repeat these):\n${avoid.map((t) => `- ${t}`).join('\n')}\n` : ''}
Marc's material:
${kb.text || '(none yet, use the focus above)'}

Answer with a JSON array only. Each item:
{"title": "specific, honest, no clickbait", "angle": "one sentence on the point of the piece", "outline": ["3 to 5 short section ideas"], "sources": ["K12"], "why": "one sentence on why this suits Marc now"}`;
  try {
    const out = await generate(c.env, { task: 'ideas', choice: b.choice, prompt, files: kb.files, system: 'You are an editor who knows Marc well. You answer with valid JSON only.' });
    const list = extractJson<any[]>(out.text);
    if (!Array.isArray(list) || !list.length) throw new Error('The AI did not return any ideas. Try again.');
    const made: any[] = [];
    for (const it of list.slice(0, count)) {
      const title = stripDashes(String(it.title || '').trim()).slice(0, 200);
      if (!title) continue;
      const outline = (Array.isArray(it.outline) ? it.outline : []).map((x: any) => stripDashes(String(x))).slice(0, 6);
      const sources = (Array.isArray(it.sources) ? it.sources : []).map((x: any) => Number(String(x).replace(/\D/g, ''))).filter((n: number) => kb.ids.includes(n));
      let slug = slugify(title);
      if (await c.env.DB.prepare('SELECT 1 FROM posts WHERE slug = ?').bind(slug).first()) slug = `${slug}-${Date.now().toString(36).slice(-4)}`;
      const body = outline.length ? `<ul>${outline.map((o: string) => `<li>${o.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : '';
      const r = await c.env.DB.prepare("INSERT INTO posts (slug, title, excerpt, body, status, source, meta) VALUES (?, ?, ?, ?, 'idea', 'ai', ?) RETURNING id")
        .bind(slug, title, stripDashes(String(it.angle || '')).slice(0, 300), body, JSON.stringify({ outline, sources, why: stripDashes(String(it.why || '')), topic, provider: out.provider, model: out.model })).first<{ id: number }>();
      made.push(await getPostById(c.env, r!.id));
    }
    await audit(c, 'ideas.create', `${made.length} ideas${topic ? ` on ${topic}` : ''}`);
    return c.json({ items: made, provider: out.provider, model: out.model, tried: out.tried });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

const HTML_RULES = 'Return only the article body as clean HTML using <p>, <h2>, <h3>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em> and <a>. No <html>, <body>, <h1>, title, code fences or commentary.';

/** Turn an idea into a full draft. It lands in "To review", never live. */
ideas.post('/:id{[0-9]+}/draft', need('ideas.use', 'ai.use', 'posts.edit'), async (c) => {
  const id = Number(c.req.param('id'));
  const b = await c.req.json<{ choice?: string; notes?: string }>().catch(() => ({} as any));
  const p = await c.env.DB.prepare('SELECT * FROM posts WHERE id = ?').bind(id).first<any>();
  if (!p) return c.json({ error: 'Not found' }, 404);
  const meta = p.meta ? JSON.parse(p.meta) : {};
  const kb = await gather(c.env, `${p.title} ${p.excerpt} ${(meta.outline || []).join(' ')}`, 18_000);
  const prompt = `Write a blog post for Marc's personal website.
Title: ${p.title}
Point of the piece: ${p.excerpt || '(work it out from the title)'}
${meta.outline?.length ? `Rough outline: ${meta.outline.join('; ')}` : ''}
${b.notes ? `Marc's extra notes: ${b.notes}` : ''}

Use Marc's own material below for facts, stories and opinions. Do not invent experiences, clients, numbers or quotes that are not in it; where something is missing, write around it or leave a short [check: ...] note for Marc.

Marc's material:
${kb.text || '(none)'}

Aim for 600 to 1000 words. Open with something specific, not a general statement.`;
  try {
    const out = await generate(c.env, { task: 'draft', choice: b.choice, prompt, files: kb.files, system: HTML_RULES });
    const body = guard(out.text.replace(/^```(?:html)?\s*|```\s*$/g, '')).text;
    await c.env.DB.prepare("UPDATE posts SET body = ?, status = 'review', meta = ?, updated_at = datetime('now') WHERE id = ?")
      .bind(body, JSON.stringify({ ...meta, drafted: { provider: out.provider, model: out.model, at: new Date().toISOString().slice(0, 19).replace('T', ' '), sources: kb.ids } }), id).run();
    await audit(c, 'ideas.draft', p.title);
    return c.json({ post: await getPostById(c.env, id), provider: out.provider, model: out.model, tried: out.tried, flags: out.flags });
  } catch (e) {
    return c.json({ error: (e as Error).message }, 502);
  }
});

ideas.get('/', need('ideas.use'), async (c) => {
  const { results } = await c.env.DB.prepare("SELECT id, slug, title, excerpt, status, source, meta, updated_at FROM posts WHERE status IN ('idea','review') ORDER BY CASE status WHEN 'review' THEN 0 ELSE 1 END, id DESC LIMIT 200").all<any>();
  const { results: kc } = await c.env.DB.prepare('SELECT COUNT(*) n, SUM(active) a FROM knowledge').all<{ n: number; a: number }>();
  return c.json({ items: results.map((r) => ({ ...r, meta: r.meta ? JSON.parse(r.meta) : null })), knowledge: { total: kc[0]?.n || 0, active: kc[0]?.a || 0 } });
});
