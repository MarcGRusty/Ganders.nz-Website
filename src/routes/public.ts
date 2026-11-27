import { Hono } from 'hono';
import type { Env } from '../types';
import { getSettings, getPage, getPost, listPosts, menuPages, ensureSeed } from '../lib/db';
import { renderBlocks } from '../render/blocks';
import { layout } from '../render/layout';
import { esc, clean, mediaUrl, fmtDate } from '../render/html';
import { currentUser } from '../lib/auth';

const app = new Hono<{ Bindings: Env }>();

const site = (c: any) => (c.env.SITE_URL || new URL(c.req.url).origin).replace(/\/$/, '');

async function renderPage(c: any, slug: string) {
  const edit = c.req.query('edit') === '1' && !!(await currentUser(c));
  if (slug === 'home') await ensureSeed(c.env);
  const page = await getPage(c.env, slug, edit);
  if (!page) return notFound(c);
  const [s, menu, posts] = await Promise.all([getSettings(c.env), menuPages(c.env), listPosts(c.env, { status: 'published', limit: 12 })]);
  const body = renderBlocks(page.blocks, { edit, posts });
  const html = layout(s, { title: slug === 'home' ? '' : page.title, description: page.seo.description, image: page.seo.image, path: slug === 'home' ? '/' : `/${slug}`, menu, body, edit, siteUrl: site(c) });
  return c.html(html, 200, edit ? { 'Cache-Control': 'no-store' } : { 'Cache-Control': 'public, max-age=0, s-maxage=30' });
}

async function notFound(c: any) {
  const [s, menu] = await Promise.all([getSettings(c.env), menuPages(c.env)]);
  const body = `<section class="article"><div class="wrap"><p class="mono" style="color:var(--accent)">404</p><h1>This page wandered off.</h1>
    <p class="meta">It might have moved, or it never existed. <a href="/">Head back home</a>.</p></div></section>`;
  return c.html(layout(s, { title: 'Not found', path: c.req.path, menu, body, siteUrl: site(c) }), 404);
}

app.get('/', (c) => renderPage(c, 'home'));

app.get('/writing', async (c) => {
  const [s, menu, posts] = await Promise.all([getSettings(c.env), menuPages(c.env), listPosts(c.env, { status: 'published' })]);
  const body = `<section class="article"><div class="wrap"><p class="mono" style="color:var(--accent)">Writing</p><h1>Notes, essays and things I've figured out.</h1>
    <ul class="plist" style="margin-top:56px">${posts.map((p) => `<li><a href="/writing/${esc(p.slug)}"><h3>${esc(p.title)}</h3>
    <span class="mono d">${fmtDate(p.published_at)}</span>${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}</a></li>`).join('') || '<li class="empty">Nothing here yet.</li>'}</ul></div></section>`;
  return c.html(layout(s, { title: 'Writing', path: '/writing', menu, body, siteUrl: site(c) }));
});

app.get('/writing/:slug', async (c) => {
  const preview = c.req.query('preview') === '1' && !!(await currentUser(c));
  const post = await getPost(c.env, c.req.param('slug'), preview);
  if (!post) return notFound(c);
  const [s, menu] = await Promise.all([getSettings(c.env), menuPages(c.env)]);
  const body = `<article class="article"><div class="wrap">
    <p class="mono" style="color:var(--accent)">${post.tags.map(esc).join(' / ') || 'Writing'}</p>
    <h1>${esc(post.title)}</h1>
    <p class="mono meta">${post.published_at ? fmtDate(post.published_at) : `Preview, ${esc(post.status)}`}</p>
    ${post.cover ? `<img class="cover" src="${esc(mediaUrl(post.cover))}" alt="">` : ''}
    <div class="prose">${clean(post.body)}</div>
    <p style="margin-top:64px"><a class="mono" href="/writing">More writing</a></p></div></article>`;
  return c.html(layout(s, { title: post.title, description: post.excerpt, image: post.cover ?? undefined, path: `/writing/${post.slug}`, menu, body, siteUrl: site(c) }));
});

app.get('/media/:key{.+}', async (c) => {
  const obj = await c.env.MEDIA.get(c.req.param('key'));
  if (!obj) return c.text('Not found', 404);
  const h = new Headers();
  obj.writeHttpMetadata(h);
  h.set('etag', obj.httpEtag);
  h.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(obj.body, { headers: h });
});

app.get('/favicon.svg', async (c) => {
  const s = await getSettings(c.env);
  const letter = esc((s.name || 'G').trim()[0]?.toUpperCase() || 'G');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="${Math.min(s.theme.radius * 4, 32)}" fill="${esc(s.theme.ink)}"/><text x="32" y="46" text-anchor="middle" font-family="Georgia,serif" font-size="42" fill="${esc(s.theme.paper)}">${letter}</text><circle cx="50" cy="16" r="5" fill="${esc(s.theme.accent)}"/></svg>`;
  return c.body(svg, 200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=300' });
});
app.get('/favicon.ico', async (c) => {
  const s = await getSettings(c.env);
  return c.redirect(s.favicon ? mediaUrl(s.favicon) : '/favicon.svg', 302);
});

app.get('/robots.txt', (c) => c.text(`User-agent: *\nDisallow: /admin\nDisallow: /api\nSitemap: ${site(c)}/sitemap.xml\n`));

app.get('/sitemap.xml', async (c) => {
  const [{ results: pages }, posts] = await Promise.all([
    c.env.DB.prepare("SELECT slug, updated_at FROM pages WHERE status = 'published'").all<{ slug: string; updated_at: string }>(),
    listPosts(c.env, { status: 'published' }),
  ]);
  const u = (p: string, d: string) => `<url><loc>${esc(site(c) + p)}</loc><lastmod>${esc(d.slice(0, 10))}</lastmod></url>`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => u(p.slug === 'home' ? '/' : `/${p.slug}`, p.updated_at)).join('')}${posts.map((p) => u(`/writing/${p.slug}`, p.updated_at)).join('')}</urlset>`;
  return c.body(xml, 200, { 'Content-Type': 'application/xml' });
});

app.get('/rss.xml', async (c) => {
  const [s, posts] = await Promise.all([getSettings(c.env), listPosts(c.env, { status: 'published', limit: 30 })]);
  const items = posts.map((p) => `<item><title>${esc(p.title)}</title><link>${esc(`${site(c)}/writing/${p.slug}`)}</link><guid>${esc(`${site(c)}/writing/${p.slug}`)}</guid><pubDate>${new Date((p.published_at || p.updated_at).replace(' ', 'T') + 'Z').toUTCString()}</pubDate><description>${esc(p.excerpt)}</description></item>`).join('');
  return c.body(`<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(s.name)}</title><link>${esc(site(c))}</link><description>${esc(s.tagline)}</description>${items}</channel></rss>`, 200, { 'Content-Type': 'application/rss+xml' });
});

app.post('/contact', async (c) => {
  const f = await c.req.parseBody();
  if (f.website) return c.redirect('/?sent=1#contact', 303); // honeypot
  const name = String(f.name || '').slice(0, 120).trim();
  const email = String(f.email || '').slice(0, 200).trim();
  const body = String(f.body || '').slice(0, 5000).trim();
  if (!name || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !body) return c.redirect('/?sent=0#contact', 303);
  // Simple rate limit: 5 messages per IP per hour.
  const ip = c.req.header('cf-connecting-ip') || 'local';
  const k = `rl:contact:${ip}`;
  const count = Number((await c.env.KV.get(k)) || 0);
  if (count >= 5) return c.redirect('/?sent=0#contact', 303);
  await c.env.KV.put(k, String(count + 1), { expirationTtl: 3600 });
  await c.env.DB.prepare('INSERT INTO messages (name, email, body) VALUES (?, ?, ?)').bind(name, email, body).run();
  const ref = c.req.header('referer');
  const back = ref && new URL(ref).host === new URL(c.req.url).host ? new URL(ref).pathname : '/';
  return c.redirect(`${back}?sent=1#contact`, 303);
});

app.get('/:slug{[a-z0-9-]+}', (c) => renderPage(c, c.req.param('slug')));

app.notFound((c) => notFound(c));

export default app;
