# Security and privacy

Audited 2026-10-25. Each control is marked **Done**, **Partial**, or **Planned**.

## Secrets
- **Done**: all secrets come from environment variables (`.env` locally, Render and Vercel online). `.env` and `web/.env.local` are git-ignored; `.env.example` holds names only.
- **Done**: `ADMIN_API_KEY`, `ADMIN_PASSWORD`, Gmail and Telegram tokens are only read on servers. The website's admin client is a `server-only` module.
- Rule: never print env values in logs, docs or chat. Rotate a key by changing it in Render/Vercel and redeploying.

## Authentication and authorization
- **Done**: admin API requires `x-admin-key` (constant-time compare, minimum 24 characters, refuses to run if unset).
- **Done**: admin website sign-in with `ADMIN_PASSWORD`; failed attempts are slowed; the session cookie is signed (HMAC), httpOnly, SameSite=Lax, Secure in production, 7-day expiry, and invalidated when the password or key changes. Every admin page read and every server action re-checks it server-side.
- **Planned**: shopper accounts (Google, Apple, email). Until then there is no personal data stored server-side.
- **Planned**: login rate limiting by IP for `/admin/login`.

## Input handling
- **Done**: API DTOs validated with class-validator (`whitelist: true` strips unknown fields). Prisma queries are parameterized; the two raw SQL queries in admin stats use tagged templates (parameterized).
- **Done**: React escapes output; no `dangerouslySetInnerHTML` in the app.
- **Done**: the unsubscribe page only echoes fixed text.
- **Done**: request size limits: JSON 64 KB, form bodies 16 KB (413 above). Security headers: `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy`, no `X-Powered-By`.

## Redirects (affiliate links)
- **Done**: `/api/go/:offerId` never takes a URL from the request. It loads the stored offer URL, re-checks the trust gate, requires https on the merchant's own domain, then redirects. No open redirect.

## AI safety
- **Done**: Claude can only call `search_deals`, which reads trusted deals; it cannot run SQL, shell or HTTP. URLs are stripped from replies. Max 4 tool turns per message; messages capped at 1,000 characters and history at 8 turns.
- **Planned**: typed schema validation of tool arguments, spending limits, token-usage logging.

## Abuse prevention
- **Done**: per-IP rate limits: assistant 10/minute and 100/day, store redirect 60/minute, unsubscribe 20/minute. Limits are in memory per API instance (fine for one instance; move to a shared store if we scale out). Catalog reads aren't limited at the app level because the website's server calls them from shared Vercel IPs; put Cloudflare in front of the API for edge rate limiting.
- **Note**: CORS allows `https://*.vercel.app`, which includes other people's Vercel projects. CORS doesn't protect the API from scripts anyway, but once the site has its own domain, narrow `CORS_ORIGIN` to it.
- **Done**: outreach can't send without owner approval, a postal address, and business hours; daily cap; automatic pause on bounce rate; suppression list honored on every send.

## Email compliance (CAN-SPAM, Gmail/Yahoo sender rules)
- **Done**: physical address and opt-out text in every email footer, List-Unsubscribe + one-click POST headers, opt-outs honored immediately and permanently (Suppression table), honest subject lines in templates, sending capped and spaced.
- Owner responsibility: SPF, DKIM and DMARC on the outreach domain; use a separate outreach domain; never import bought or scraped lists.

## Privacy and retention
- **Done**: clicks store offer, time and source; no IP addresses or user agents are logged.
- **Done**: assistant conversations are not stored.
- **Planned**: retention periods (clicks 24 months, inbound outreach email 24 months, suppression list kept indefinitely as required) and a deletion job.

## Dependencies
- 2026-10-25: `npm audit` on the API found high-severity advisories in multer (via @nestjs/platform-express) and deepmerge-ts (via the Prisma CLI). Fixed: NestJS 11.2.8 and an npm override pinning multer 2.5.0 (we don't accept uploads anyway). Remaining: deepmerge-ts, fixed only in Prisma 7 (major upgrade, planned); it affects the Prisma CLI's config loading, not request handling. The website had no advisories.
- npm 11 blocks package install scripts by default; Prisma's three packages are explicitly approved in `package.json` (`allowScripts`).

## Reporting a problem
Pause outreach from Admin → Settings. Rotate `ADMIN_API_KEY`/`ADMIN_PASSWORD` to sign everyone out.
