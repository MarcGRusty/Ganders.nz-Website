import { Hono } from 'hono';
import type { Env } from '../types';
import { listProviders, saveProvider, getAiSettings, saveAiSettings, generate, extractJson } from '../ai/router';
import { providerById } from '../ai/providers';
import { sanitizeSvg } from '../ai/svg';
import { getSettings, saveSettings, slugify } from '../lib/db';
import { stripDashes } from '../lib/style-guard';
import { need } from '../lib/auth';

// Mounted under /api/ai, behind the Studio sign-in.
const ai = new Hono<{ Bindings: Env; Variables: { uid: number; user: any } }>();

ai.get('/providers', need('ai.use'), async (c) => {
  const [providers, settings, log] = await Promise.all([
    listProviders(c.env),
    getAiSettings(c.env),
    c.env.DB.prepare('SELECT task, provider, model, ok, ms, error, created_at FROM ai_log ORDER BY id DESC LIMIT 12').all(),
  ]);
  return c.json({ providers, settings, log: log.results, canStoreKeys: !!c.env.APP_KEY });
});

ai.put('/providers/:id', need('ai.manage'), async (c) => {
  try {
    await saveProvider(c.env, c.req.param('id')!, await c.req.json());
    return c.json({ ok: true });
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

ai.put('/settings', need('ai.manage'), async (c) => {
  const b = await c.req.json<{ mode?: string; voice?: string }>();
  const cur = await getAiSettings(c.env);
  const mode = b.mode && (b.mode === 'auto' || providerById(b.mode)) ? b.mode : cur.mode;
  await saveAiSettings(c.env, { mode, voice: stripDashes(b.voice ?? cur.voice).slice(0, 2000) });
  return c.json({ ok: true });
});

ai.post('/test/:id', need('ai.manage'), async (c) => {
  try {
    const r = await generate(c.env, { task: 'short', choice: c.req.param('id'), prompt: 'Reply with one short friendly sentence confirming you are connected. Plain text.' , maxTokens: 300 });
    return c.json(r);
  } catch (e) { return c.json({ error: (e as Error).message }, 400); }
});

const HTML_RULES = 'Return only the article body as clean HTML using <p>, <h2>, <h3>, <ul>, <ol>, <li>, <blockquote>, <strong>, <em> and <a>. No <html>, <body>, <h1>, title, code fences or commentary.';

/** Writing help in the post editor. Everything comes back for Marc to review; nothing is saved. */
ai.post('/write', need('ai.use'), async (c) => {
  const b = await c.req.json<{ action: string; choice?: string; model?: string; title?: string; excerpt?: string; body?: string; notes?: string; selection?: string }>();
  const ctx = `Title: ${b.title || '(none yet)'}\nSummary: ${b.excerpt || '(none yet)'}`;
  try {
    switch (b.action) {
      case 'draft': {
        if (!b.notes?.trim() && !b.title?.trim()) return c.json({ error: 'Add a title or some rough notes first.' }, 400);
        const r = await generate(c.env, { task: 'draft', choice: b.choice, model: b.model, system: HTML_RULES,
          prompt: `Write a blog post for Marc's personal website.\n${ctx}\n\nMarc's rough notes (keep his facts, don't invent experiences he didn't mention):\n${b.notes || '(none, work from the title)'}\n\nAim for 500 to 900 words.` });
        return c.json(r);
      }
      case 'improve': {
        const target = b.selection?.trim() || b.body?.trim();
        if (!target) return c.json({ error: 'There is nothing to improve yet.' }, 400);
        const r = await generate(c.env, { task: 'rewrite', choice: b.choice, model: b.model, system: HTML_RULES,
          prompt: `Tighten and improve this ${b.selection ? 'passage' : 'post'} without changing its meaning or adding new claims. Keep Marc's voice. Keep roughly the same length.\n${ctx}\n\n${target}` });
        return c.json(r);
      }
      case 'titles': {
        const r = await generate(c.env, { task: 'short', choice: b.choice, model: b.model,
          prompt: `Suggest 5 titles for this post. Specific and honest, no clickbait, no colons-for-drama. Return a JSON array of strings only.\n${ctx}\n\n${(b.body || b.notes || '').slice(0, 6000)}` });
        return c.json({ ...r, items: extractJson<string[]>(r.text).map((t) => stripDashes(String(t))).slice(0, 8) });
      }
      case 'excerpt': {
        const r = await generate(c.env, { task: 'short', choice: b.choice, model: b.model,
          prompt: `Write one sentence (under 160 characters) that makes someone want to read this post. Plain text only, no quotes.\n${ctx}\n\n${(b.body || b.notes || '').slice(0, 6000)}` });
        return c.json({ ...r, text: r.text.replace(/<[^>]+>/g, '').trim().replace(/^["']|["']$/g, '') });
      }
      default:
        return c.json({ error: 'Unknown action.' }, 400);
    }
  } catch (e) { return c.json({ error: (e as Error).message }, 502); }
});

/** AI logo or browser icon: returns a few SVG options to choose from. */
ai.post('/logo', need('ai.use', 'design.edit'), async (c) => {
  const b = await c.req.json<{ kind: 'logo' | 'favicon'; brief?: string; choice?: string; model?: string }>();
  const s = await getSettings(c.env);
  const t = s.theme;
  const spec = b.kind === 'favicon'
    ? 'A square browser icon, viewBox="0 0 64 64". It must read clearly at 16 by 16 pixels: one bold shape or a monogram, no fine detail, no small text.'
    : `A horizontal wordmark logo for the header, viewBox about 320 by 64, showing the name "${s.name}". Use text set in a system font stack or simple drawn letterforms, plus at most one small mark.`;
  const prompt = `Design an SVG for ${s.name}'s personal website. ${spec}
Colours available: background ${t.light.paper}, ink ${t.light.ink}, accent ${t.light.accent}, second accent ${t.light.accent2}.
Brief from Marc: ${b.brief?.trim() || 'Simple, confident, personal. Nothing generic, no swooshes, no globes, no gradients.'}
Return only one complete <svg> element. No scripts, no external images or fonts, no <style> tags; use attributes.`;
  const options: { svg: string; provider: string; model: string }[] = [];
  const errors: string[] = [];
  await Promise.all([0, 1, 2].map(async (i) => {
    try {
      const r = await generate(c.env, { task: 'svg', choice: b.choice, model: b.model, prompt: `${prompt}\nVariation ${i + 1} of 3: make it clearly different from the other two.` });
      options.push({ svg: sanitizeSvg(r.text), provider: r.provider, model: r.model });
    } catch (e) { errors.push((e as Error).message); }
  }));
  if (!options.length) return c.json({ error: errors[0] || 'Could not make a logo.' }, 502);
  return c.json({ options });
});

ai.post('/logo/use', need('design.edit'), async (c) => {
  const b = await c.req.json<{ kind: 'logo' | 'favicon'; svg: string }>();
  let svg: string;
  try { svg = sanitizeSvg(b.svg); } catch (e) { return c.json({ error: (e as Error).message }, 400); }
  const key = `brand/${b.kind}-${Date.now().toString(36)}.svg`;
  await c.env.MEDIA.put(key, svg, { httpMetadata: { contentType: 'image/svg+xml' } });
  await c.env.DB.prepare('INSERT INTO media (key, name, type, size, alt) VALUES (?, ?, ?, ?, ?)').bind(key, `${slugify(b.kind)}.svg`, 'image/svg+xml', svg.length, b.kind === 'logo' ? 'Logo' : 'Browser icon').run();
  const s = await getSettings(c.env);
  await saveSettings(c.env, { ...s, [b.kind]: key });
  return c.json({ key });
});

export default ai;
