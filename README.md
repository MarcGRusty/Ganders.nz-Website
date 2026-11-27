# ganders.nz

Marc Gander's personal website and its Studio (the CMS), running on Cloudflare Workers.

Every page is rendered live at the edge from the database, so anything on the site can be changed from
Studio at `/admin` without a rebuild: pages, blocks, writing, menus, colours, fonts, logo and browser icon.

## What's here

| Part | Where |
|---|---|
| Worker entry, scheduled publishing | `src/index.ts` |
| Public pages, writing, RSS, sitemap, contact form | `src/routes/public.ts` |
| Studio API (signed in only) | `src/routes/api.ts` |
| Page blocks and site layout | `src/render/` |
| No-em-dash style guard | `src/lib/style-guard.ts` |
| Studio app (bundled to `public/admin/assets/app.js`) | `src/admin/app.ts` |
| Click-to-edit script used inside the page preview | `public/admin/assets/inline-editor.js` |
| Database schema | `migrations/` |

Cloudflare pieces: D1 (database), R2 (media), KV (sessions and rate limits), Cron (scheduled posts).

## House rules

- **No em dashes, anywhere.** Everything saved through Studio is cleaned by the style guard, editors swap them as
  you type, and `npm run check:dashes` fails the build if one appears in the code or copy.
- **Mobile first.** Base styles are for phones; `min-width` media queries scale up, with fluid scaling past 1800px.
- **Privacy.** First names only for family, never name or describe Marc's children, nothing below city level.

## Run it locally

```
npm install
npm run db:migrate:local
npm run dev            # http://localhost:8787, Studio at /admin
npm test && npm run typecheck && npm run check:dashes
```

The first visit to `/admin` asks you to create the owner login.

## Going live

See [docs/CLOUDFLARE.md](docs/CLOUDFLARE.md). Deploys run from GitHub Actions once Cloudflare is connected.
