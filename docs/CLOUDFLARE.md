# Putting the site on Cloudflare

This is a one-time setup. After it, every merge to `main` deploys automatically.

1. Create the resources (from a machine signed in with `npx wrangler login`):
   ```
   npx wrangler d1 create ganders-nz
   npx wrangler r2 bucket create ganders-nz-media
   npx wrangler kv namespace create KV
   ```
   Put the printed `database_id` and KV `id` into `wrangler.jsonc`.
2. In GitHub, add repository secrets `CLOUDFLARE_API_TOKEN` (a token with Workers, D1, R2 and KV edit rights)
   and `CLOUDFLARE_ACCOUNT_ID`, then set the repository variable `DEPLOY_ENABLED` to `true`.
3. Merge to `main`. The workflow applies database migrations and deploys the Worker.
4. Point the domain: in Cloudflare, add a Custom Domain for the Worker (`ganders.nz`). This only works once
   ganders.nz uses Cloudflare DNS, which also replaces the current site, so do it when ready to switch.
5. Recommended: put Cloudflare Access in front of `/admin*` so Studio needs your Microsoft sign-in as well as
   the Studio password.
