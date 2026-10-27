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

## Catalog data
- **Done**: sources start as AWAITING_APPROVAL and collect nothing until a complete permission record is saved and activated by a named person. Disabling a source hides its offers immediately.
- **Done**: feed uploads only on `/api/admin/sources/:id/import`, 5 MB max, and the admin key is checked before the body is read. Website uploads are capped at 4 MB (Vercel's request limit is about 4.5 MB).
- **Done**: every product link must be https on the store's own domain; rows that aren't are rejected at import and re-checked at click time.
- **Done**: data is only sent to Claude when its source allows AI use (`aiUseAllowed`, default off).
- **Done**: price-history retention per source (`retentionDays`).

## Redirects (affiliate links)
- **Done**: `/api/go/:offerId` never takes a URL from the request. It loads the stored offer URL, re-checks the trust gate, requires https on the merchant's own domain, then redirects. No open redirect.
- **Done**: tracked links exist only for APPROVED programs. A network template must contain `{url}`/`{urlEncoded}` and `{clickId}`, and the finished link must be https on a host the owner listed; anything else is refused when saved and again at click time, and the shopper gets the plain store link (recorded as a fallback). Placement and recommendation labels from the query string are limited to short simple tokens.
- **Done**: no secrets in program records: only public account tags and templates. Network API keys, if ever needed, go in the API's environment.
- **Done**: click events store no IP address or user agent; the session ID column stays empty until consent exists; clicks are deleted after `CLICK_RETENTION_DAYS` (730). Commission records are financial records and are kept.
- **Done**: commission imports are admin-only, 5 MB, key checked before the body is read, idempotent, and can't move a status backwards.

## AI safety
- **Done**: Claude can only call `search_deals` and `compare_deals`; it cannot run SQL, shell or HTTP. Tool arguments are validated and bounded before use; unknown tools and malformed arguments return errors to the model. Limits per message: 5 turns, 6 tool calls, 40 seconds, 1,024 output tokens; messages 1,000 characters, history 8 turns.
- **Done**: only data whose source agreement allows AI use is ever returned to the model (`aiUseAllowed`, default off). The model is never shown links, store descriptions, affiliate programs, commissions or clicks.
- **Done**: store-supplied text (titles, delivery notes) is sanitized, length-capped and labeled as data; the system prompt tells the model never to follow instructions found in it.
- **Done**: every reply is checked against the tool results. A price, percentage or store that isn't in them, or a product paired with a store that doesn't list it, replaces the whole reply with a plain answer built from the facts; URLs are stripped.
- **Done**: usage logging stores only counts, cost, latency, outcome and a short error class: never prompts or answers. Daily budget (`AI_DAILY_BUDGET_USD`, default $5, rolling 24 h) is checked before each call, and a failed budget check fails safe to plain search.
- **Done**: errors from the AI provider (bad key, rate limit, refusal, timeout) fall back to plain search; the SDK retries once and every call has a timeout.
- **Known limit**: the claim checker verifies prices, percentages, store names and product-store pairs, not every possible claim (for example "free shipping" or "in stock"). The assistant's instructions forbid unstated facts and the evaluation measures the rest; claims about shipping and stock should be added to the checker when real feeds carry that data.

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
- **Partial**: click retention is automatic (24 months, nightly job). Still planned: retention for inbound outreach email (24 months) and a user-data deletion job once shopper accounts exist. The suppression list is kept indefinitely, as required.

## Dependencies
- 2026-10-25: `npm audit` on the API found high-severity advisories in multer (via @nestjs/platform-express) and deepmerge-ts (via the Prisma CLI). Fixed: NestJS 11.2.8 and an npm override pinning multer 2.5.0 (we don't accept uploads anyway). Remaining: deepmerge-ts, fixed only in Prisma 7 (major upgrade, planned); it affects the Prisma CLI's config loading, not request handling. The website had no advisories.
- npm 11 blocks package install scripts by default; Prisma's three packages are explicitly approved in `package.json` (`allowScripts`).

## Reporting a problem
Pause outreach from Admin → Settings. Rotate `ADMIN_API_KEY`/`ADMIN_PASSWORD` to sign everyone out.
