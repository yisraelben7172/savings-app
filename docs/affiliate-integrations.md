# Affiliate and retailer integrations

**Current status: no retailer or affiliate network is connected.** Every product, price and store on the site today comes from `prisma/seed.ts` demo data (example prices). Nothing in this document is a confirmed partnership.

Rules we follow for every provider:

1. Read the provider's current official docs and agreement before building against it.
2. Use only the data and link methods the agreement allows (APIs, feeds, network deep links). No scraping.
3. Record the source, permission, caching and attribution rules per provider (planned: `DataSource` records, see roadmap Priority 2).
4. Never invent endpoints, IDs, commission rates or tracking parameters. Unconfigured providers stay off.
5. Never send provider content to Claude or other systems unless the agreement allows it.

## Status by provider

| Provider | What it would give us | Status | Owner action |
|---|---|---|---|
| Amazon Associates | Amazon product links; product data only via Amazon's approved product-data API for qualifying accounts | Not applied | Apply; read agreement and policies (below) |
| eBay Partner Network | Tracking links; eBay's Browse/Deal APIs for listings | Not applied | Apply at partnernetwork.ebay.com |
| Impact | Many retailers and ticket sellers (each brand approves separately); deep links, product catalogs where the brand shares them | Not applied | Join Impact, then apply to brands |
| CJ Affiliate | Large retailers, travel; product feeds and deep links per advertiser | Not applied | Join CJ, then apply to advertisers |
| Rakuten Advertising | Department stores, fashion, beauty | Not applied | Apply |
| Awin (incl. ShareASale) | Fashion, beauty, DTC brands; product feeds | Not applied | Apply |
| Travelpayouts | Hotels, car rentals, flights from travel brands | Not applied | Apply (automated review) |
| Ticketmaster / SeatGeek | Events; partner programs mostly run through Impact | Not applied | Apply via the network |

## Fastest legitimate path to real data: partner CSV feeds

A brand or store can send us a product file (most e-commerce platforms export one). Steps:

1. Admin → Stores: add the store (domain is required; every product link must be on it). It stays hidden until you approve it and give it a trust score of 70+.
2. Admin → Data sources → Add a source (CSV feed, linked to the store). Record how the data is provided, what was agreed, which fields you may show, whether the AI assistant may use it, how long prices stay current, and how long to keep price history.
3. Activate it (Vault refuses until the record is complete), then upload the file. Each rejected row is listed with the reason.
4. Re-upload whenever the partner sends a new file. Re-imports never duplicate anything; items missing from a full-catalog file are marked out of stock; prices older than the freshness window disappear from the site.

Network product catalogs (Impact, CJ, Awin, Rakuten) usually come as CSV/XML files too, so once a network approves Vault for a brand, its catalog export can go through the same path where the network's terms allow it.

## What the code supports today

All of this is built and tested, and none of it is connected to a real network yet (no program is approved).

### Affiliate programs (Admin → Affiliate links)
One record per store and network (`AffiliateProgram`): status (not applied, applied, **approved**, rejected, paused), how tracked links are made, a public account tag, the tracking hosts links may go through, the wording the program requires next to its links, verified commission terms, and how to read its commission report.

**Tracked links are only ever made for APPROVED programs**, through one of two methods:

1. **Amazon tracking ID** (`AMAZON_TAG`): adds your Associates tracking ID as the `tag` parameter, replacing any existing tag. This is Amazon's documented method; there is no Amazon environment variable any more, the ID lives on the approved program.
2. **Network link template** (`DEEPLINK_TEMPLATE`): you copy the exact deep-link format from the network's own dashboard once approved and paste it in, using `{url}` or `{urlEncoded}` for the product page and `{clickId}` for the sub-ID. Vault does **not** know or guess any network's format. On save, Vault checks the template has those placeholders and that its host is one you listed as an allowed tracking host. At click time it re-checks that the finished link is https and on an allowed host, or it falls back to the plain store link (and records the fallback).

Use Admin → Affiliate links → "Check the link" to see exactly what link a shopper would get for a sample product page, and compare it against the network's documentation before relying on it.

### Clicks and commissions
- Every "Go to store" click is logged with: offer, program, outcome (tracked / plain / fallback), where it went (host only), placement (web-picker, web-deal-page...), an optional recommendation label, and an optional anonymous session ID (not collected yet: it will only be set after a consent banner exists). **No IP address and no user agent are stored.** Clicks are deleted after `CLICK_RETENTION_DAYS` (730).
- The click's ID is passed to the network as the sub-ID. When you import a network's commission report (CSV), rows are matched back to clicks through that sub-ID, only within the same program. Unmatched rows are kept but marked not matched.
- Commission records hold only what the network reports, with its status kept separate: pending, approved, reversed, paid. Vault never estimates earnings. Re-importing overlapping reports is safe (keyed by the network's transaction ID) and a status never moves backwards (paid stays paid, reversed is final).
- A click is a visit, not a sale: no screen presents click counts as revenue, and Vault never promises that a click earns a commission.

### Disclosures
An approved program's required wording (for example Amazon's Associate statement) is saved on the program and shown next to its store links in the store picker and deal page, in addition to the site-wide "We may earn a commission" line.

### Setting up a program once a network approves you
1. Admin → Affiliate links → Add a program (store + network), set it to Applied with your application link when you apply.
2. When approved: copy the link format and your account details from the network's dashboard; paste the template (or Amazon ID), allowed tracking host(s) and required disclosure; use "Check the link"; then set the status to Approved.
3. Find the network's commission report export; if its column or status names differ, enter them under the program's report settings. Import a report after the first sales are reported.

## Amazon: compliance notes (to verify against current documents)

Official sources to read before any Amazon work:

- https://affiliate-program.amazon.com/
- https://affiliate-program.amazon.com/help/operating/agreement/
- https://affiliate-program.amazon.com/help/operating/policies

Things we must confirm for this specific account before building, and must not assume:

- Which product-data API the account may use, and its eligibility rules (Amazon has historically tied API access to recent qualifying sales).
- Whether prices and availability may be shown, how fresh they must be, and the required "price as of" style attribution.
- Caching limits for product data and images.
- Whether Amazon content may be processed by an AI model (our assistant sends search results to Claude). **Until confirmed, Amazon-sourced content must be excluded from the assistant's tool results.** The assistant can still link to Amazon offers whose facts came from a source that allows it.
- Required disclosures (the site already shows "We may earn a commission"; Amazon requires specific Associate wording: save it on the Amazon program's disclosure field once confirmed).
- Rules on links in emails and offline (the outreach research found Amazon prohibits Associate links in emails; outreach emails never contain affiliate links).

If the desired design is not allowed, we document the limit here and choose a compliant alternative (for example, a plain link without product data, or another network).

## Adding a provider (checklist)

1. Owner applies and is approved. Record approval date and account ID (not secrets) in the admin.
2. Put credentials in the API's environment (Render), never in code or database rows.
3. Implement the adapter against official docs; mock responses in tests.
4. Record the source permission: allowed fields, caching and expiry, attribution, AI-use permission.
5. Enable in the admin only after a live test call succeeds.

## Travel booking links (trip planner, 2026-10-29)
Trip plans can open a travel store with the shopper's dates and guests already filled in, but only through a format the partner documents. In Admin → Affiliate links → the store's program:
- **Travel booking link format**: paste the exact link format from the partner's docs or the network dashboard, using `{checkIn}` `{checkOut}` `{adults}` `{children}` `{travelers}` `{origin}` `{destination}`. It must be https on the store's own domain.
- **Where that format is documented**: the https link to that page. Without it the format is not used.
Never guess a partner's parameters. If no documented format exists, leave both empty: the plan shows the dates and guests to enter, with a copy button. The tracked affiliate link (link template above) still wraps the page as usual.
