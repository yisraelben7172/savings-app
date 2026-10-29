# Vault architecture

Last audited: 2026-10-25. This describes what exists in the repository today, then where it is going. Status words used across these docs:

- **Working**: implemented and tested end to end locally.
- **Awaiting credentials**: code is done; needs keys or accounts the owner must create.
- **Awaiting approval**: needs an affiliate program or provider to approve Vault.
- **Planned**: not implemented yet.

## System overview

```
 Browser ──► web/ (Next.js 16, Vercel)  ──server-side fetch──►  API (NestJS 11, Render)  ──► PostgreSQL 17 (Render)
   │            public site + /admin                          /api/*  + scheduled jobs           Prisma 6
   │                                                              │
   └── "Go to store" ─────────────────────────────────────────►  /api/go/:offerId ──302──► retailer (trust-gated URL)
                                                                  │
                                              Anthropic Messages API (assistant), Gmail API (outreach), Telegram (alerts)
```

### Why a separate API instead of Next.js route handlers
The brief assumed AI calls live in Next.js API routes. In this repository they don't: the backend is a NestJS service (repo root) deployed to Render, and the website (`web/`) is a Next.js app deployed to Vercel. We keep that split because:

1. Scheduled work (outreach sending every 5 minutes, inbox checks every 3 minutes, future feed syncs and price alerts) needs a long-lived process or a durable scheduler. Vercel functions are short-lived and stateless; Render web services run continuously (on a paid plan).
2. The trust gate, click logging and affiliate redirects sit in one place that the website and the future mobile app (`mobile/`, Expo) both call.
3. Secrets (Anthropic, Gmail, affiliate keys) live only in the API's environment.

The website reads public data with plain `fetch` from server components, and calls admin routes only from server code with `ADMIN_API_KEY`.

## Repository layout

| Path | What it is |
|---|---|
| `src/` | NestJS API. One folder per domain: `deals/` (catalog reads + trust gate), `categories/`, `clicks/` (affiliate redirect + click log), `assistant/` (Claude), `outreach/` (partners, email queue, Gmail, Telegram, jobs), `admin/` (guard), `health/`, `prisma/`. |
| `prisma/` | Schema, migrations, and `seed.ts` (demo data only). |
| `web/src/app/(site)/` | Public site pages. URLs don't include `(site)`. |
| `web/src/app/admin/` | Admin dashboard (`/admin`), password-protected. |
| `web/src/components/`, `web/src/lib/` | UI components; `lib/api.ts` (public API client), `lib/admin.ts` (server-only admin client + session). |
| `scripts/` | One-off admin scripts (`gmail-connect.mjs`). |
| `docs/` | These documents. |
| `render.yaml` | Render blueprint for the API and database. |

The brief suggests `lib/ai`, `lib/catalog`, `lib/retailers`, `lib/affiliate`... In this repo those domains map to NestJS modules under `src/` (e.g. `src/catalog`, `src/retailers`, `src/affiliate` as they are built). We follow the existing convention instead of moving files.

## Data model (today)

- **Catalog**: `Category`, `Merchant` (retailer: domain, network, trustScore, approved), `Deal` (a product listing with best price, discount, Gold flags), `Offer` (one retailer's price for a deal, URL, delivery note, lastCheckedAt), `PriceHistory`.
- **Users** (not used yet; no sign-in): `User`, `SavedDeal`, `Alert`, `ChatSession`, `ChatMessage`.
- **Affiliate**: `Click` (offer, optional user, source).
- **Outreach**: `Partner`, `EmailTemplate`, `OutreachEmail`, `InboundEmail`, `Suppression`, `Setting`.

- **Catalog foundation (2026-10-25)**: `Product` (canonical item, matched only by GTIN or brand + MPN), `Deal` (the listing for one product; `productId` null for old demo deals), `Offer` (one store's price: source, SKU, list price, freshness via `staleAfter`), `DataSource` (where data comes from + its permission record), `IngestionRun` (every import with counts and row errors), retailer registry fields on `Merchant`.

- **Affiliate (2026-10-25)**: `AffiliateProgram` (per store and network), `Click` (outcome, program, host, placement), `Commission` (what a network reported, status kept separate), `CommissionImport` (every report upload).

- **Travel (2026-10-29)**: `TripPlan` (destination, dates, travelers, optional origin airport and budget, status DRAFT/READY/APPROVED/EXPIRED/CANCELLED, 7-day expiry, no personal data) and `TripItem` (one candidate hotel/flight/car with its store options, the chosen offer, unit price, quantity and code-computed total). Travel prices stay on `Offer`, which gained `startDate`/`endDate` (the dates the price applies to) and `cancellationText` (only when the source states it). `AffiliateProgram` gained `bookingLinkTemplate` + `bookingLinkDocUrl` (a documented pre-filled booking link format, see below).

Gaps against the brief (see the roadmap): no audit log, no agent runs, no importers beyond CSV feeds, no network report APIs.

## Search, comparison and the AI assistant (`src/search`, `src/ai`, `src/assistant`)

```
 shopper words ──► (AI proposes a typed request)  or  (plain-text fallback parser)
                       │ validated + bounded (parseShoppingRequest)
                       ▼
 SearchService: Postgres retrieval (visible deals, fresh trusted offers, AI-permitted when asked by the AI)
                       ▼
 ranking.ts (pure): hard constraints → relevance, features, stated discount, price, freshness, confidence, preferred store
                    (no affiliate / commission inputs exist in its types)
                       ▼
 facts.ts: verified facts + whyItFits + notConfirmed (no links, no descriptions, nothing commercial)
                       ▼
 AssistantService (Anthropic SDK): tools search_deals / compare_deals → reply → claim-check → plain verified fallback
                       ▼
 AiUsageService: tokens, estimated cost, latency, outcome; daily budget gate before every call
```

Decisions: the search is Postgres + code (no separate engine, no embeddings yet); the AI never sees links, store descriptions or anything about affiliate programs; a reply that states anything not in the tool results is replaced, not repaired.

## Shopping plans (`src/plans`)

A plan is a multi-item shopping list with a total budget and optional category budgets. It reuses the same search and ranking as the assistant, so it is commission-blind by construction (the planner types contain no affiliate, click or commission data, and a test greps the source to keep it that way).

```
POST /api/plans  ──► parsePlanInput (≤ 8 items, qty 1-10, bounded)  ──► ShoppingPlan row (RUNNING, random 32-hex id, expires in 7 days)
                                  background run: one search per item (checks cancel + 20 s limit before each)  ──► PlanStep rows
                                  buildPlan (pure): best fit per item; only while over budget, swap to a cheaper option from that
                                  item's own results (least fit lost per dollar saved); honest "could not get under budget"
GET  /api/plans/:id              poll until READY / FAILED
POST /api/plans/:id/select       shopper picks another listed option {index, slug, version}; totals recomputed; version bumps
POST /api/plans/:id/approve      {version}: every chosen price is re-checked first. Changed or sold out ⇒ plan updated, NOT approved
                                  (409 with the changes), shopper reviews again. Unchanged ⇒ APPROVED.
POST /api/plans/:id/cancel       stops a running plan or withdraws a ready one (not an approved one)
```

- Statuses: RUNNING → READY → APPROVED, or CANCELLED / FAILED (`timeout`, `error`, `interrupted`). A minute-by-minute sweeper fails runs stuck RUNNING; a nightly job deletes expired plans.
- Items priced per night/day are shown but not added to the total (the final cost depends on quantity). Totals are computed in integer cents.
- Approval does not buy anything. Vault never sells; shoppers open each deal's store picker and go to the store.
- No model call is involved today. An AI-written plan (the assistant proposing the item list) is a later step; it would have to go through `parsePlanInput` like any other input.
- No accounts yet: a plan is reachable only by its random link and holds no personal data (see the privacy page).

## Trip plans (`src/trips`, Step 1: AI plans, the shopper approves, partner sites book)

Owner decision 2026-10-29 (spec: `docs/trip-planner-spec.md`). Vault plans the trip; the shopper approves; the booking and payment happen on the partner's site. Step 2 (booking and payment inside Vault) is out of scope: it needs booking APIs, payment handling, Seller of Travel registration and a travel lawyer first.

```
 assistant tool plan_trip ─┐   (AI output is untrusted: same validation as the website)
 /trip form ───────────────┴► POST /api/trips ──► parseTripInput (dates real and in the future, ≤ 30 nights, ≤ 365 days ahead,
                                                  adults 1-9, children 0-8, 3-letter airport only with a flight, budget > 0)
                                                  missing details ⇒ 400 with `missing` (the assistant asks one question)
                              TripsService: one search per part with the shopping SearchService + ranking (commission-blind), plus
                              a travel filter: only offers whose date window covers the whole stay (undated offers never qualify)
                              trip-planner.ts (pure): pick + up to 2 alternatives per part; the named hotel only on an exact word
                              match (else an honest "couldn't find" note); cheapest store first; totals in integer cents
                              ──► TripPlan READY + TripItem rows
 GET  /api/trips/:id                          plan, totals vs budget, the "cheapest swap" suggestion when over budget
 POST /api/trips/:id/items/:itemId/select     {offerId, version}: another store, or an alternative of the same part
 POST /api/trips/:id/approve                  {version}: every chosen price re-checked (trust gate + date window). Changed or
                                              gone ⇒ plan updated, NOT approved (409 + changes). Unchanged ⇒ APPROVED.
 POST /api/trips/:id/cancel                   withdraws a ready or approved plan
 POST /api/trips/:id/items/:itemId/report     optional "did you complete this booking?" {booked: true|false}; stores yes/no only
```

- Quantities: hotel = nights (one room), car = rental days, flight = travelers (adults + children, one round trip each). Totals are unit price x quantity, computed in code; the model never computes money.
- Over budget is shown, never hidden: no part is dropped or swapped automatically. The plan suggests the single cheapest swap (the change that lowers the total most) and the shopper decides.
- Approval only unlocks the booking buttons, in order flight, hotel, car. Each goes through `/api/go/:offerId?src=web-trip&rec=<plan>&trip=<plan>&item=<item>` so the click is logged like any other. Copy: "Finish booking on <store>", never "booked".
- Pre-filled links: `/go` adds dates/guests/airport only when the store's program has a saved `bookingLinkTemplate` with a `bookingLinkDocUrl` (where the partner documents that format), only for the offer the shopper approved, using the dates stored on the plan, and only if the result is https on the store's own domain. There is no built-in format for any partner. Otherwise the shopper lands on the item's page and the plan shows the details to enter with a copy button.
- AI: the `plan_trip` tool calls the same service with `aiOnly` (only sources that allow AI use). The model sees `tripFacts` only: titles, store names, unit prices, totals, stated cancellation terms, budget figures; no ids, links or commercial data. Every price/store in its reply passes the claim checker (`addTrip`), and any "booked/reserved/paid/confirmed" claim is blocked (`bookingClaims`); a blocked reply is replaced by `plainTripReply`. The chat shows a "View your trip plan" card.
- Commission-blind: `trip-planner.ts`, `trip-input.ts`, `trip-facts.ts` and `trips.service.ts` never read affiliate data (a test greps them). Only `booking-links.service.ts` reads programs, to show required disclosures and to know whether a documented format exists.
- Data: until a travel network feed with a permission record exists, the travel listings are labeled demo data in `prisma/seed.ts` (generic hotel names, so no real hotel is paired with an invented price), shown under the "samples" notice.

## Affiliate links (`src/affiliate`, `src/clicks`)

```
 shopper taps "Go to store" ──► GET /api/go/:offerId?src=web-picker
   load our stored offer + the merchant's APPROVED program        (destination never comes from the request)
   trust gate + https-on-merchant-domain check
   click ID = 24 random hex characters
   buildTrackedUrl(program, offer.url, clickId)                   (pure function, src/affiliate/link-builder.ts)
       AMAZON_TAG        → add tag=<account tag>
       DEEPLINK_TEMPLATE → fill {url} {urlEncoded} {clickId}; https + allowed host or refuse
   record Click (TRACKED | PLAIN | FALLBACK) → 302 to the tracked or plain link

 later: network commission report (CSV) ──► POST /api/admin/programs/:id/commissions/import
   rows keyed by the network's transaction ID; sub-ID == click ID ties a sale back to a click
```

## Catalog ingestion (`src/catalog`)

```
 CSV upload (admin) ──► POST /api/admin/sources/:id/import  (admin key checked before the 5 MB body is read)
        │
        ▼
 IngestionService.importCsv
   source must be ACTIVE (permission recorded) and linked to a store
   └─ CsvFeedAdapter.pages()  → raw rows
   └─ CsvFeedAdapter.normalize() → validated offer, or a rejected row with a reason
   └─ per row, in a transaction, 4 at a time, retried on transient errors:
        Product (GTIN → brand+MPN → this source's SKU → new) → Deal → Offer (+ price history on change)
   └─ full snapshot: SKUs not in the file → out of stock
   └─ recompute deal prices from currently shown offers; apply retention; record run + health
```

Adding a provider later means writing one adapter (`pages` + `normalize`) against its official docs; matching, freshness, upserts and health come from the framework.

## Request flows

- **Browse**: server component → `GET /api/deals` → Prisma query filtered by the trust gate (`src/deals/trust.ts`: approved merchant, trustScore ≥ 70, in stock) → cards.
- **Store picker / Go to store**: `GET /api/deals/:slug` returns offers with `goUrl=/api/go/:offerId`. The redirect looks the offer up by ID, re-checks the trust gate and that the stored URL is https on the merchant's own domain, logs a `Click`, adds the Amazon tag only for Amazon merchants, then 302s. No user-supplied URL is ever redirected to.
- **Assistant**: `POST /api/assistant/chat` → Claude with one tool, `search_deals`, that only reads trusted deals; URLs are stripped from replies; without an API key it falls back to keyword search.
- **Outreach**: see `docs/operations.md` and the admin dashboard. Drafts → owner approval → scheduled sending via Gmail → inbox polling → Telegram alerts.

## Security boundaries (summary; details in `docs/security.md`)

- Public API: read-only catalog, assistant chat, redirect, unsubscribe.
- Admin API (`/api/admin/*`): `x-admin-key` header, checked in constant time. Only the website's server knows the key.
- Admin website: `ADMIN_PASSWORD` sign-in → signed, httpOnly, 7-day cookie, checked on every admin read and action.
- Secrets live in Render and Vercel environment variables, never in the repo.
