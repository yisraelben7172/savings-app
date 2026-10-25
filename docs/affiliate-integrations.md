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

- `Merchant.network` and `Merchant.affiliateTag` fields, and the redirect in `src/clicks/clicks.controller.ts`, which adds the `tag` parameter **only** for `network = "amazon"` merchants, and only to URLs that pass the domain check.
- All other networks are an explicit TODO in that controller: each network has its own deep-link format, which we will implement from that network's documentation once approved.

Planned (roadmap Priority 3): a `src/affiliate` module with one adapter per network behind a common interface, `AffiliateProgram` records (status, required parameters, sub-ID rules), link-generation outcome logging, and conversion/commission import from network reports.

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
- Required disclosures (the site already shows "We may earn a commission"; Amazon requires specific Associate wording).
- Rules on links in emails and offline (the outreach research found Amazon prohibits Associate links in emails; outreach emails never contain affiliate links).

If the desired design is not allowed, we document the limit here and choose a compliant alternative (for example, a plain link without product data, or another network).

## Adding a provider (checklist)

1. Owner applies and is approved. Record approval date and account ID (not secrets) in the admin.
2. Put credentials in the API's environment (Render), never in code or database rows.
3. Implement the adapter against official docs; mock responses in tests.
4. Record the source permission: allowed fields, caching and expiry, attribution, AI-use permission.
5. Enable in the admin only after a live test call succeeds.
