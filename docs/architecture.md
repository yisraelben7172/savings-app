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

Gaps against the brief (see the roadmap): no `Product` separate from `Deal` (no GTIN/MPN, brand, attributes), no `DataSource` / permission records, no provenance or freshness policy on offers, no affiliate program records, no conversion/commission records, no audit log, no agent runs.

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
