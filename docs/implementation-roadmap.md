# Implementation roadmap

Checklist for turning Vault into a production multi-retailer shopping platform. Order follows the owner's brief; each item lists dependencies and how we'll know it's done. `[x]` done and tested, `[~]` partly done, `[ ]` not started. Blockers are external (credentials, approvals, owner decisions).

## Already in place (before this roadmap)
- [x] Public site: home, deals, category, deal page with store picker and price history, search, assistant, Gold, sign-in (UI only), saved (browser only).
- [x] API: catalog reads with trust gate, safe affiliate redirect with click log, Claude assistant with one read-only tool.
- [x] Partner outreach: partners, templates, approval queue, Gmail sending, inbox polling, opt-outs, bounces, Telegram alerts. *Awaiting credentials* (Gmail, Telegram).
- [x] Admin dashboard: overview, queue, partners, inbox, templates, settings.

## Priority 1: Stabilize the foundation
Depends on: nothing.
- [ ] Test framework for the API (Jest) with tests for the trust gate, redirect safety, admin guard, unsubscribe tokens, email formatting, template rendering, outreach approval rules.
  *Done when* `npm test` runs in CI-like fashion locally and passes.
- [ ] Rate limits on public endpoints (assistant chat strictest), explicit JSON body limit, basic security headers.
  *Done when* tests show the 429 after the limit and normal use is unaffected.
- [ ] Fix the 5 high-severity dependency advisories with non-breaking updates.
  *Done when* `npm audit --omit=dev` is clean or remaining items are documented.
- [ ] Demo data honesty: the public site shows a clear "sample prices" notice whenever demo data is loaded.
  *Done when* the notice appears with `SEED_DEMO_DATA=true` and disappears when real sources replace it.
- **Owner decision needed**: keep demo data on the live site (with the notice) until the first real source is approved, or show an empty "launching soon" site.

## Priority 2: Commerce data foundation
Depends on: P1 tests.
- [ ] `Product` (canonical item: brand, model, GTIN/UPC/EAN/MPN, attributes, images where permitted) separate from listings; migrate `Deal` → product + offers without losing data.
- [ ] `Retailer` registry (extend `Merchant`): integration type, active flag, health, last sync. No secrets in rows.
- [ ] `DataSource` + permission record: access method, agreement link, allowed fields, cache/expiry rules, AI-use permission, attribution text.
- [ ] Offer provenance and freshness: source ID, fetched/verified time, per-source freshness policy; stale offers labeled or hidden, never shown as live.
- [ ] Provider adapter interface (fetch, normalize, validate, upsert, report) with idempotent upserts, pagination, rate limiting, bounded retries; ingestion run records.
- [ ] Partner-provided CSV feed adapter as the first real source (needs no API approval).
- [ ] Duplicate detection by identifiers (GTIN/MPN+brand), never by title alone; duplicate candidates listed in admin.
  *Done when* a CSV feed can be imported twice with no duplicates, every offer shows source and freshness, and tests cover normalization, dedupe and freshness.

## Priority 3: Affiliate monetization
Depends on: P2 (retailers, sources). Real links need program approval (*awaiting approval*).
- [ ] `AffiliateProgram` records (network, status, required params, sub-ID rules).
- [ ] Affiliate link service with one adapter per network; outcome logging; no affiliate params on arbitrary URLs.
- [ ] Richer click events: anonymous session ID (consented), placement, recommendation/session ID; documented retention.
- [ ] Conversion and commission import from network reports, with pending/approved/reversed/paid states. Admin shows clicks and commissions separately.
- [ ] Required disclosures per program (Amazon wording when approved).

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
