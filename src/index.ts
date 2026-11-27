import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './types';
import api from './routes/api';
import admin from './routes/admin';
import site from './routes/public';
import { fireEvent } from './lib/integrations';
import { processQueue, unstick } from './lib/social';

const app = new Hono<{ Bindings: Env }>();

app.use('*', secureHeaders({ xFrameOptions: 'SAMEORIGIN', crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
// admin.ganders.nz and studio.ganders.nz open Studio. The public site lives on the main domain.
const isStudioHost = (host: string) => /^(admin|studio)\./i.test(host);
app.use('*', async (c, next) => {
  const url = new URL(c.req.url);
  if (isStudioHost(url.hostname)) {
    const p = url.pathname;
    if (!p.startsWith('/admin') && !p.startsWith('/api') && !p.startsWith('/media/') && !p.startsWith('/favicon')) return c.redirect('/admin', 302);
    await next();
    c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return;
  }
  await next();
  // Studio and preview builds stay out of search results.
  if (url.pathname.startsWith('/admin') || url.hostname.endsWith('.workers.dev')) c.res.headers.set('X-Robots-Tag', 'noindex, nofollow');
});
app.route('/api', api);
app.route('/admin', admin);
app.route('/', site);

export default {
  fetch: app.fetch,
  /** Every 5 minutes: publish anything scheduled whose time has come, then send due social shares. */
  async scheduled(_e: ScheduledController, env: Env) {
    const { results } = await env.DB.prepare(
      "UPDATE posts SET status='published', published_at=datetime('now'), updated_at=datetime('now') WHERE status='scheduled' AND publish_at IS NOT NULL AND publish_at <= datetime('now') RETURNING id, slug, title, excerpt"
    ).all<{ id: number; slug: string; title: string; excerpt: string }>();
    const base = (env.SITE_URL || '').replace(/\/$/, '');
    for (const p of results) await fireEvent(env, 'post.published', { id: p.id, title: p.title, excerpt: p.excerpt, url: `${base}/writing/${p.slug}` });
    await unstick(env);
    await processQueue(env);
  },
} satisfies ExportedHandler<Env>;
