import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './types';
import api from './routes/api';
import admin from './routes/admin';
import site from './routes/public';

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
  /** Every 5 minutes: publish anything scheduled whose time has come. */
  async scheduled(_e: ScheduledController, env: Env) {
    await env.DB.prepare(
      "UPDATE posts SET status='published', published_at=datetime('now'), updated_at=datetime('now') WHERE status='scheduled' AND publish_at IS NOT NULL AND publish_at <= datetime('now')"
    ).run();
  },
} satisfies ExportedHandler<Env>;
