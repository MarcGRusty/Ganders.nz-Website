import { Hono } from 'hono';
import type { Env } from '../types';

const admin = new Hono<{ Bindings: Env }>();

// Changes whenever a new version is deployed, so browsers fetch fresh admin files.
export const ASSET_V = Date.now().toString(36);

const shell = () => `<!doctype html><html lang="en-NZ"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>Studio</title><link rel="icon" href="/favicon.svg">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:wght@400;500;600&family=Hanken+Grotesk:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&display=swap">
<link rel="stylesheet" href="/admin/assets/admin.css?v=${ASSET_V}"></head>
<body><div id="app"></div><script type="module" src="/admin/assets/app.js?v=${ASSET_V}"></script></body></html>`;

// Every admin URL loads the same app; it routes on the client and asks the API who is signed in.
admin.get('/*', (c) => c.html(shell(), 200, { 'Cache-Control': 'no-store' }));

export default admin;
