# Vault — project context for Claude

Vault is a US deals app + website: it collects publicly advertised deals (price drops, flash sales, last-minute travel/events) from trusted stores and earns affiliate commissions when users buy. Not a coupon site.

## Owner preferences
- Owner (Israel) is not a developer. Do the work yourself: run commands, install, build, test, commit and push. Explain results in plain language, briefly.
- Windows 11 laptop. Repo: github.com/yisraelben7172/savings-app (private). Branch: main.
- Commit and push to GitHub (main) after every chunk of work. It's the owner's backup, and pushing is what updates Vercel.
- Whenever the owner makes a new decision, update this file in the same push so the next session knows.

## Structure
- Repo root = backend: NestJS 11 + Prisma 6 + PostgreSQL 17 (local, user `sales` / `sales_password`, db `sales_app`). `.env` holds keys; never commit it.
- `web/` = website (Next.js 16 with Cache Components, App Router, Tailwind 4, TypeScript, lucide-react). Deployed on Vercel with Root Directory = `web`. Run locally with `npm run dev` in web/ (port 3001; API uses 3000).
- Start the API with start-api.bat; it first stops anything still holding port 3000 (the usual cause of the "port 3000 in use" error).
- `mobile/` (not created yet) = Expo React Native app; Android APK via EAS cloud build.
- Backend hosting: Render, defined in render.yaml (service `vault-api` + Postgres `vault-db`, region virginia, both on free plans for now). Auto-deploys on every push to main. On start it runs migrations, loads demo deals while SEED_DEMO_DATA=true (seed is upsert-only, safe to re-run), then starts. Free web service sleeps after 15 min (first visit takes ~1 min); free Postgres expires after 30 days, so upgrade both before launch.
- Cloudflare for domain/DNS. Domain not chosen yet (e.g. getvault.app).

## Backend (done)
- Models: Category, Merchant (trustScore, approved, domain), Deal (bestPrice, discountPct, goldOnly, goldEarlyUntil), Offer (one per store), Click, PriceHistory, User (tier FREE/GOLD), SavedDeal, Alert, ChatSession/ChatMessage. Demo data in prisma/seed.ts.
- API under /api: GET /health, /meta, /categories, /deals (category, q, maxPrice, sort, tier), /deals/:slug (offers + price history), GET /go/:offerId (logs click, adds affiliate tag, redirects), POST /assistant/chat.
- Trust gate (src/deals/trust.ts): only approved merchants with trustScore >= 70; links must be https on the merchant's own domain. Never bypass it.
- AI assistant (src/assistant): Claude through the official Anthropic SDK (ANTHROPIC_API_KEY, model from ANTHROPIC_MODEL), tools search_deals and compare_deals, validated and limited; see "Search, comparison and AI (Priority 4)" below. Falls back to ranked keyword search without a key, on errors, or when the daily budget is used up.

## Product decisions
- Categories: Electronics, Clothing, Beauty, Hotels, Car rentals, Concerts, Home, Flights (flights de-emphasized; shopping leads).
- Store picker: tapping any deal shows every verified store with price, rating, delivery; sort by Lowest price / Top rated / Fastest; cheapest marked "Best price"; "Go to <store>" uses /api/go/:offerId.
- Gold membership: $14.99/month or $119/year — deals 24h early, Gold-only deals, instant price-drop alerts, unlimited AI assistant (free = 20 chats/day), unlimited saves, no ads. Web billing via Stripe; in-app via Apple/Google billing.
- Sign-in: Google + Apple + email. Browsing allowed without an account.
- Required copy: affiliate disclosure ("We may earn a commission"), AI disclosure in chat, "prices can change at the store".

## Design direction (decided 2026-10-25, replaces the louder mockup look)
- Feel: premium, calm, money-smart. Shoppers should feel financially responsible, never cheap. No Temu or coupon-site energy, no "AI slop" templates.
- Idea: "Buy it when the price is right." Proof of a good price is the hero: a live price-check card with the 90-day price line and "You keep $X".
- Savings green is the one emotional color; navy ink for premium surfaces (Gold card, assistant banner, chat button); cobalt for primary actions. Category pastels are small icon chips only, not big tiles. No red "HOT" badges ("Trending" instead), no ALL-CAPS labels, no dot-separated meta, no arrows appended to link text.
- Prices use tabular numbers. Claims must be true (e.g. only say "lowest in N days" when the history shows it).

## Design tokens (dark mode follows the phone)
- Fonts: Schibsted Grotesk (headings, prices), Figtree (body).
- Colors: page #FFFFFF, mist #F0F3F8, line #E1E6EE, ink #141B2D, muted #5E6779, cobalt #2F55E4 (actions), save-green #0E8A5F (savings + Verified), hot #FF5B45, gold #F6C64E (Gold only).
- Category pastels (bg / fg): electronics sky #DCEBFF/#2F55E4, clothing mint #D3F2E2/#0E8A5F, beauty blush #FCE1F3/#B52F86, hotels peach #FFE3D3/#D9531E, car-rentals teal #D2F1F4/#0B7A87, concerts rose #FFDDE6/#C42D5C, home butter #FFF0BF/#A36A00, flights lilac #E9E0FF/#6B46D6.
- Home: left-aligned hero (headline, search, quick links, trust line) with the price-check card on the right; "Price drops today" grid; category row; Gold Free-vs-Gold with Monthly/Yearly toggle (Gold card is navy); navy assistant banner; floating "Ask the deal assistant" button.
- colorful-preview.html in the repo root is the original mockup, kept for reference only; the live site follows the direction above.

## Website (done, first version)
- Reads live data from NEXT_PUBLIC_API_URL (default http://localhost:3000); code in web/src/lib/api.ts. Next.js 16 has breaking changes: read web/node_modules/next/dist/docs before changing patterns. Pages keep a static frame and load data inside <Suspense> (Cache Components rule).
- Pages: / (home), /deals (all deals + search, ?q=&sort=&maxPrice=), /search redirects to /deals, /category/[slug], /deals/[slug] (store list + price history + save), /assistant, /gold, /signin, /saved.
- Tapping a deal card opens the store picker sheet; "Go to <store>" links go to the API's /api/go/:offerId. The hero search and the blue banner prompts open the floating assistant.
- For now: saved deals live in the browser (localStorage) until accounts exist. Sign-in buttons are shown but disabled ("coming soon"). "Start Gold" goes to /signin until Stripe is added. Price alerts show a "coming soon" panel.

## Working rules from the owner's master brief (2026-10-25)
- Goal: a production-ready multi-retailer AI shopping + affiliate platform. Work through docs/implementation-roadmap.md in priority order; keep it updated (checkboxes, dates).
- Never invent products, prices, stock, discounts, reviews, partnerships, endpoints, IDs, commission rates or affiliate links. Unconfigured providers stay off and are labeled as such.
- No scraping or bypassing access controls; only authorized APIs/feeds. Record each source's permission, caching and AI-use rules before enabling it. Don't send a provider's content to Claude unless its agreement allows it (Amazon especially).
- Ask first before: paid sign-ups, contracts, contacting anyone, sending email, destructive migrations, production deploys/config changes. Everything else: just do it, test it, push it.
- Report at the end of each session: what was inspected, implemented, files/migrations, tests actually run, results, what's operational, what's blocked, next priorities.
- Docs live in docs/ (architecture, implementation-roadmap, affiliate-integrations, security, operations).

## Admin dashboard + partner outreach (done 2026-10-25; awaiting Gmail/Telegram credentials)
- Owner decision: outreach uses a Google Workspace mailbox via the Gmail API (not Resend/SES, which ban cold email), Telegram for phone alerts, and a daily approve-before-send queue. Nothing is ever sent without the owner's approval. Affiliate networks (Impact, CJ, Awin, Rakuten, eBay, Travelpayouts, Amazon) are the main partnership path; direct email is for brands not on a network.
- Web: /admin (password ADMIN_PASSWORD; signed httpOnly cookie). Pages: Overview, Approval queue, Partners (+ detail), Inbox, Templates, Settings. Server-only client web/src/lib/admin.ts calls the API with ADMIN_API_KEY. Public pages live in web/src/app/(site)/.
- API: src/outreach (partners, templates, queue, Gmail, Telegram, unsubscribe, scheduler), src/admin/admin.guard.ts (x-admin-key). Jobs: send one approved email every 5 min (weekday business hours ET, daily cap, spacing, postal address required), inbox check every 3 min (replies, opt-outs, bounces, auto-pause at >3% bounces), weekday 8am ET draft prep + Telegram summary.
- CAN-SPAM: postal address + unsubscribe in every email, one-click List-Unsubscribe, Suppression table honored forever. Never import bought/scraped lists.
- One-time Gmail setup: `npm run gmail:connect` (needs GMAIL_CLIENT_ID/SECRET in .env).

## Quality and safety (Priority 1, done 2026-10-25)
- API tests: `npm test` (Jest, test/). Run before every push, plus `npm run lint` and builds.
- Rate limits (src/rate-limits.ts): assistant 10/min + 100/day per IP, /go 60/min, unsubscribe 20/min. Catalog reads deliberately unlimited (website server shares Vercel IPs). JSON body limit 64 KB, security headers, trust proxy 1.
- Demo data honesty: seed sets Setting `catalog:demo`=true; GET /api/meta returns demoData; the site shows a "these are samples" bar. Keep it until real sources replace the demo catalog.

## Catalog foundation (Priority 2, done 2026-10-25)
- Models: Product (matched only by GTIN or brand+MPN, never title), Deal = shopper listing for one product (productId null for old demo deals), Offer with source/SKU/listPrice/staleAfter, DataSource with permission record, IngestionRun. Migration 20261025120000_catalog_sources; rollback SQL in prisma/rollbacks/.
- Trust gate (src/deals/trust.ts) is now a function `trustedOffer()`: also hides stale prices, inactive stores and disabled sources. Card prices come from the offers shown now (`cardPrices`); a "was" price only from the source's own list price. The assistant uses `aiAllowedOffer()` (source.aiUseAllowed).
- src/catalog: CSV adapter + IngestionService (idempotent, bounded concurrency, retries, snapshots, retention, health). Admin pages: Catalog health, Stores, Data sources (permission record → activate → upload CSV). Sources start AWAITING_APPROVAL; activation requires a complete record and an importer for the kind (only CSV_FEED today).
- Demo data lives in DataSource `src_demo_seed`. Cards hide the "% off"/"You keep" when there's no stated discount.
- Tests: `npm test` (unit) and `npm run test:int` (real DB, schema vault_test). Local browser-pane note: if the pane isn't visible on screen, streamed pages stay on their skeleton (requestAnimationFrame is paused); that's not an app bug.

## Affiliate links and commissions (Priority 3, built 2026-10-25; nothing approved yet, so nothing earns)
- Models: AffiliateProgram (per store + network), Click (program, outcome TRACKED/PLAIN/FALLBACK, destinationHost, placement `source`, recommendationId, optional sessionId), Commission, CommissionImport. Migration 20261025180000_affiliate_programs; rollback SQL in prisma/rollbacks/.
- Rule: tracked links only for APPROVED programs (src/affiliate/link-builder.ts). Amazon = documented `tag` parameter from the program's account tag (the old AMAZON_ASSOCIATE_TAG env var is gone). Every other network = the exact link template the owner pastes from the network's dashboard, with {url}/{urlEncoded}/{clickId}, https, and an allowed tracking host. NEVER guess a network's link format or invent parameters. Failure falls back to the plain store link and is recorded.
- The click ID is the sub-ID. Commission reports (CSV, Admin → Affiliate links) match back to clicks through it. Only reported amounts are stored; statuses pending/approved/paid/reversed are kept separate and never move backwards. Click counts are visits, not sales: never show them as revenue.
- Clicks store no IP/user agent; sessionId stays empty until a consent banner exists; clicks deleted after CLICK_RETENTION_DAYS (730).
- An approved program's required disclosure text is shown next to its store links (store picker + deal page).
- Admin → Stores no longer holds affiliate status or link method; those live on the program.
- Tests now: 95 unit + 15 database integration.

## Search, comparison and AI (Priority 4, built 2026-10-27; live model untested)
- src/search: typed ShoppingRequest (validated; AI output is untrusted), SearchService (Postgres retrieval + pure ranking in ranking.ts), compare.ts, facts.ts. Public `GET /api/search`, `GET /api/compare?slugs=a,b,c`; site page /compare (linked from the deal page and the chat).
- Ranking rules: hard limits (category, budget, brand, excluded words) exact and need evidence; features rank up when confirmed and are listed as "not confirmed" otherwise; a discount exists only if the store stated a regular price; whole-word stemmed matching, both words of a 2-word query must match. **Ranking input types must never contain affiliate, program, click or commission data** (proven by the eval).
- src/ai: pricing.ts (estimated cost table from the claude-api skill, cached 2026-10-06; unknown model = highest tier), usage.service.ts (AiUsage table, daily budget AI_DAILY_BUDGET_USD default $5), claim-check.ts (a reply with a price/percent/store not in the tool results, or a product paired with a store that doesn't list it, is replaced by a plain verified answer). Admin → AI usage.
- The model is never shown links, descriptions or anything commercial. Keep using the official SDK (`@anthropic-ai/sdk`), not raw fetch. `effort` is only sent to 5.x models.
- Eval: `npm run eval` (writes docs/evaluation-results.md; must stay at 100% on safety rows). Live-model eval is gated: `EVAL_LIVE=1 npm run test:int -- assistant-live` (costs money; ask the owner first).
- Local .env has a Claude key that Anthropic rejects (401); the fallback works. A valid key is needed before the AI can be measured or enabled.
- Tests now: 152 unit + 24 database integration.

## Next steps
0. Owner: provide a valid Claude API key (local .env and Render) and approve a small live evaluation; confirm the daily AI budget.
1. Owner: finish the Render Blueprint, send the vault-api address; in Vercel set NEXT_PUBLIC_API_URL, ADMIN_API_KEY (same as Render), ADMIN_PASSWORD, then redeploy. Add ADMIN_API_KEY, WEB_URL (and later Gmail/Telegram values) in Render.
2. Owner: get a first real feed (a brand's product CSV, or a network catalog once approved) and onboard it via Admin → Stores and Data sources. Apply to affiliate networks; once approved, set up the program in Admin → Affiliate links (see docs/affiliate-integrations.md).
3. Owner: confirm Amazon's required Associate wording and link-presentation rules before enabling the Amazon program.
4. Roadmap Priority 6 remainder (prospect research fields, statuses, draft types, audit history), then 7 (analytics, price alerts, accounts). AI-written plans can come after a valid Claude key.
5. Later: network report APIs, consent banner + session IDs, scheduled feed pulls, demo-catalog removal step, Expo app in mobile/, shopper accounts, Stripe for Gold, price alerts.

Full plan doc: https://claude.ai/artifact/623vtcT6qQmNpLwMXyR89y

## Legal pages and affiliate application kit (2026-10-27)
- Site pages /privacy, /affiliate-disclosure, /about, /contact (web/src/app/(site)/), linked in the footer. Text matches what the app really does (no analytics cookies, clicks without IP/UA kept 24 months, assistant text sent to the AI provider and not stored, saved deals in the browser). If behavior changes (accounts, analytics, alerts), update the privacy page and `LEGAL_UPDATED` in web/src/lib/site.ts.
- Contact details come from Vercel env vars NEXT_PUBLIC_BUSINESS_NAME, NEXT_PUBLIC_CONTACT_EMAIL, NEXT_PUBLIC_BUSINESS_ADDRESS; until set, pages say details are being set up. Never invent them.
- docs/affiliate-application-kit.md: checklist, answer bank, per-network notes, an example application, status tracker. Nothing submitted; owner submits applications. Items marked "verify" need checking on the official page.

## Shopping plans (Priority 5, built 2026-10-27)
- src/plans: ShoppingPlan + PlanStep (migration 20261027120000_shopping_plans, rollback in prisma/rollbacks/). API: POST /api/plans, GET /api/plans/:id, POST .../select, .../approve, .../cancel. Site page /plan (web/src/components/plan-builder.tsx). Details in docs/architecture.md.
- Rules: plan reachable only by its random id (no accounts), expires after 7 days, holds no personal data; ≤ 8 items; 20 s run limit; cancellation and interrupted-run sweeper; approval re-checks every price and refuses (updates the plan) if anything changed. Planner uses the same ranking as search and must never see affiliate/commission data (a test checks the source). Per-night/day prices are shown but not added to totals. Approval does not buy anything.
- Not built yet: AI-written plans, price alerts on plans, accounts. The model is not involved in plans today.
- Tests now: 170 unit + 37 database integration (1 live test skipped) (run `npm test` and `npm run test:int` before every push).
