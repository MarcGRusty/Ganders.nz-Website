import { Hono } from 'hono';
import { secureHeaders } from 'hono/secure-headers';
import type { Env } from './types';
import api from './routes/api';
import admin from './routes/admin';
import site from './routes/public';

const app = new Hono<{ Bindings: Env }>();

app.use('*', secureHeaders({ xFrameOptions: 'SAMEORIGIN', crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: false }));
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
