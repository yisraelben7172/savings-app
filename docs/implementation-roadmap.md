# Implementation roadmap

Checklist for turning Vault into a production multi-retailer shopping platform. Order follows the owner's brief; each item lists dependencies and how we'll know it's done. `[x]` done and tested, `[~]` partly done, `[ ]` not started. Blockers are external (credentials, approvals, owner decisions).

## Already in place (before this roadmap)
- [x] Public site: home, deals, category, deal page with store picker and price history, search, assistant, Gold, sign-in (UI only), saved (browser only).
- [x] API: catalog reads with trust gate, safe affiliate redirect with click log, Claude assistant with one read-only tool.
- [x] Partner outreach: partners, templates, approval queue, Gmail sending, inbox polling, opt-outs, bounces, Telegram alerts. *Awaiting credentials* (Gmail, Telegram).
- [x] Admin dashboard: overview, queue, partners, inbox, templates, settings.

## Priority 1: Stabilize the foundation
Depends on: nothing.
- [x] Test framework for the API (Jest, `npm test`): 41 tests in 7 suites covering the trust gate, redirect safety, Amazon tag rules, admin guard, unsubscribe tokens, email format and CAN-SPAM footer, opt-out detection, sending rules (approval, hours, limits, suppression, failures), follow-up drafting, inbox handling, CORS rules and the assistant rate limit. (2026-10-25)
- [x] Rate limits (per IP, in memory): assistant 10/min and 100/day, store redirect 60/min, unsubscribe 20/min. Catalog reads are not limited because the website's server shares Vercel IPs. JSON body limit 64 KB (413 above), security headers, `trust proxy` = 1 hop for Render.
- [~] Dependency advisories: NestJS updated within v11 and `multer` pinned to 2.5.0 (fixed). Remaining: `deepmerge-ts` inside the Prisma CLI, fixed only in Prisma 7 (major upgrade, planned; affects the CLI, not request handling).
- [x] Demo data honesty: `GET /api/meta` reports `demoData` (set by `prisma/seed.ts`); the public site shows a "these are samples" bar on every page while it's true.
- [ ] Website tests (component/e2e) — no runner in `web/` yet; planned with Playwright when shopper accounts arrive.
- **Owner decision needed**: keep demo data on the live site (with the notice) until the first real source is approved, or show an empty "launching soon" site.

## Priority 2: Commerce data foundation (done 2026-10-25)
Depends on: P1 tests.
- [x] `Product` (canonical item: brand, model, MPN, GTIN normalized to 14 digits with check digit, attributes, image where permitted). `Deal` is now the shopper-facing listing for one product (`Deal.productId`, unique); old demo deals keep `productId = null` and still work.
- [x] Retailer registry on `Merchant`: active flag, integration type, affiliate status, supported categories, link capability, compliance notes, health, last sync. No secrets in rows. Admin → Stores.
- [x] `DataSource` + permission record: kind, status (starts AWAITING_APPROVAL), access method, agreement link/notes, allowed fields, AI-use permission (default no), attribution text, freshness hours, retention days, full-snapshot flag, column mapping. Activation is refused until the record is complete and Vault has an importer for the kind. Admin → Data sources.
- [x] Offer provenance and freshness: `sourceId`, `retailerSku`, `listPrice`, `currency`, `condition`, `lastCheckedAt`, `staleAfter`. The trust gate hides stale offers, inactive stores and disabled sources; card prices are computed from the offers shown right now and never invent a discount.
- [x] Ingestion framework (`src/catalog`): adapter interface (pages + normalize), run records, idempotent upserts keyed by source + SKU, bounded concurrency (4), retries with backoff for transient database errors, full-snapshot "missing = out of stock" (skipped if over half the rows were rejected), price history on change, retention, source and store health.
- [x] CSV feed adapter: RFC 4180 parser (quotes, commas/newlines in fields, BOM, tab/semicolon detection), header aliases + per-source column mapping and category map, validation with a reason per rejected row, allowed-fields enforcement, 5 MB / 20,000-row limits.
- [x] Identifier-only matching: GTIN, then brand + MPN, then the source's own SKU. Never title. Possible duplicates (same brand and simplified title) are listed in Admin → Catalog health for a person to review.
- [x] The assistant only receives data whose source has `aiUseAllowed = true`.
- [x] Tests: unit tests for parser, normalization and row validation; 8 integration tests on a real database (`npm run test:int`) for idempotent re-import, price changes, snapshots, cross-store matching, staleness, AI filter, unapproved/disabled sources, bad files and retention. Verified end to end locally through the admin and the public site.
- [ ] XML feed, store API and network API importers: recorded as source kinds, but no importer until a provider approves access (then built from its official docs).
- [ ] Scheduled imports (pull a feed URL on a timer): planned once a partner offers a feed URL; uploads are manual today.
- [ ] Remove the demo catalog: a cleanup step that deletes `src_demo_seed` data and clears the "samples" notice once real sources cover the site.

## Priority 3: Affiliate monetization (built 2026-10-25; *awaiting program approvals* before it earns anything)
Depends on: P2 (retailers, sources). Real links need program approval.
- [x] `AffiliateProgram` records: network, status, link method, account tag, link template, allowed tracking hosts, required disclosure, verified commission terms, report column/status mapping. Admin → Affiliate links.
- [x] Link service (`src/affiliate/link-builder.ts`): tracked links only for APPROVED programs; Amazon via the documented `tag` parameter; every other network via the exact template pasted from its dashboard (placeholders `{url}`, `{urlEncoded}`, `{clickId}`), validated on save and re-checked at click time (https, allowed host); fallback to the plain store link is recorded. No affiliate parameters on arbitrary URLs, no destination from the request, no guessed network formats. "Check the link" preview in the admin.
- [x] Richer click events: program, outcome (tracked/plain/fallback), destination host, placement, recommendation label, optional session ID column (nothing sets it until a consent banner exists). No IP or user agent. Retention: nightly delete after `CLICK_RETENTION_DAYS` (default 730).
- [x] Commission import: CSV reports, idempotent by network transaction ID, owner-editable status mapping, unknown statuses rejected, status never moves backwards, matching to clicks through the sub-ID (same program only). Admin shows clicks and commissions separately, with pending / approved / paid / reversed kept apart.
- [x] Required disclosures per program, shown next to that store's links.
- [x] Tests: link builder, redirect (plain/tracked/fallback/refusals), report parsing, and database tests for the full click → tracked link → report → match loop, re-imports, status rules, cross-program isolation, retention.
- [ ] Network-specific report downloads/APIs (pull reports automatically instead of uploading CSVs): after a network approves us and we read its reporting docs.
- [ ] Per-network conversion postbacks, if a network supports them: same.
- [ ] Consent banner and anonymous session IDs on clicks (needed before using `sessionId`).
- [ ] Open question for the owner: Amazon's required Associate wording and any restrictions on how Amazon links may be presented (to confirm from the current Associates agreement before enabling).

## Priority 4: AI shopping intelligence
Depends on: P2 catalog, P3 links.
- [ ] Typed shopping-request schema (budget, features, exclusions, brands, retailers...) with validation of model output.
- [ ] Search service: Postgres full-text + filters first; semantic search only if needed.
- [ ] Comparison tool, freshness check tool, link tool; deterministic filters for hard constraints; ranking that ignores commission.
- [ ] Evaluation set of realistic queries; measure constraint satisfaction and wrong claims.
- [ ] Token-usage logging, model choice per task, spend limits.

## Priority 5: Agent workflows
Depends on: P4.
- [ ] Agent runs persisted with status, step limits, timeouts, cancellation.
- [ ] Multi-item shopping plans with category budgets, totals, alternatives, user approval.

## Priority 6: Partnerships
Mostly done (outreach system). Remaining:
- [ ] Prospect research fields: official domain, program and application URLs, developer docs, requirements, integration method, verified commission terms, research date, source URLs, next action, scores kept separate from facts.
- [ ] Statuses aligned with the brief (researched → draft ready → awaiting approval → submitted → awaiting response → follow-up due → approved/rejected → integration in progress → active).
- [ ] Draft types beyond outreach email: application text, feed/API access requests.
- [ ] Audit history of status changes.

## Priority 7: Administration and scale
- [ ] Retailer and catalog health pages, ingestion history, stale offers, invalid links.
- [ ] Analytics: searches, impressions, selections, clicks, commissions, AI cost.
- [ ] Price alerts (background job, consented channels), shopper accounts, Stripe for Gold, Expo app.
- [ ] Travel as its own domain model (dates, travelers, cancellation terms), not the product schema.

## Blocked on the owner
- Render: the API address (deploy status), and plan upgrades before launch.
- Vercel: `NEXT_PUBLIC_API_URL`, `ADMIN_API_KEY`, `ADMIN_PASSWORD`.
- Affiliate applications (Impact, CJ, Awin, Rakuten, eBay, Travelpayouts, Amazon).
- Outreach: domain, Google Workspace, DNS records, postal address, Telegram bot.
