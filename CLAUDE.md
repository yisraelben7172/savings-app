# Vault — project context for Claude

Vault is a US deals app + website: it collects publicly advertised deals (price drops, flash sales, last-minute travel/events) from trusted stores and earns affiliate commissions when users buy. Not a coupon site.

## Owner preferences
- Owner (Israel) is not a developer. Do the work yourself: run commands, install, build, test, commit and push. Explain results in plain language, briefly.
- Windows 11 laptop. Repo: github.com/yisraelben7172/savings-app (private). Branch: main.

## Structure
- Repo root = backend: NestJS 11 + Prisma 6 + PostgreSQL 17 (local, user `sales` / `sales_password`, db `sales_app`). `.env` holds keys; never commit it.
- `web/` = website (Next.js, App Router, Tailwind, TypeScript, lucide-react). Deployed on Vercel with Root Directory = `web`. Run locally on port 3001 (API uses 3000).
- `mobile/` (not created yet) = Expo React Native app; Android APK via EAS cloud build.
- Backend hosting planned on Render (US region); Cloudflare for domain/DNS. Domain not chosen yet (e.g. getvault.app).

## Backend (done)
- Models: Category, Merchant (trustScore, approved, domain), Deal (bestPrice, discountPct, goldOnly, goldEarlyUntil), Offer (one per store), Click, PriceHistory, User (tier FREE/GOLD), SavedDeal, Alert, ChatSession/ChatMessage. Demo data in prisma/seed.ts.
- API under /api: GET /health, /categories, /deals (category, q, maxPrice, sort, tier), /deals/:slug (offers + price history), GET /go/:offerId (logs click, adds affiliate tag, redirects), POST /assistant/chat.
- Trust gate (src/deals/trust.ts): only approved merchants with trustScore >= 70; links must be https on the merchant's own domain. Never bypass it.
- AI assistant (src/assistant): Claude via ANTHROPIC_API_KEY with a search_deals tool; it may only recommend deals from our DB and URLs are stripped from replies. Falls back to keyword search without a key.

## Product decisions
- Categories: Electronics, Clothing, Beauty, Hotels, Car rentals, Concerts, Home, Flights (flights de-emphasized; shopping leads).
- Store picker: tapping any deal shows every verified store with price, rating, delivery; sort by Lowest price / Top rated / Fastest; cheapest marked "Best price"; "Go to <store>" uses /api/go/:offerId.
- Gold membership: $14.99/month or $119/year — deals 24h early, Gold-only deals, instant price-drop alerts, unlimited AI assistant (free = 20 chats/day), unlimited saves, no ads. Web billing via Stripe; in-app via Apple/Google billing.
- Sign-in: Google + Apple + email. Browsing allowed without an account.
- Required copy: affiliate disclosure ("We may earn a commission"), AI disclosure in chat, "prices can change at the store".

## Design (colorful light style; dark mode follows the phone)
- Fonts: Schibsted Grotesk (headings, prices), Figtree (body).
- Colors: page #FFFFFF, mist #F0F3F8, line #E1E6EE, ink #141B2D, muted #5E6779, cobalt #2F55E4 (actions), save-green #0E8A5F (savings + Verified), hot #FF5B45, gold #F6C64E (Gold only).
- Category pastels (bg / fg): electronics sky #DCEBFF/#2F55E4, clothing mint #D3F2E2/#0E8A5F, beauty blush #FCE1F3/#B52F86, hotels peach #FFE3D3/#D9531E, car-rentals teal #D2F1F4/#0B7A87, concerts rose #FFDDE6/#C42D5C, home butter #FFF0BF/#A36A00, flights lilac #E9E0FF/#6B46D6.
- Home: hero with pastel blobs + floating deal cards, one-line search with sparkle icon ("What are you looking for?") + quick-pick chips, "Dropped today" grid, "Browse by category" tiles, Gold Free-vs-Gold section with Monthly/Yearly toggle, blue AI assistant banner, floating "Ask the deal assistant" chat button.
- Reference mockup: colorful-preview.html (in the repo root).

## Next steps
1. Build the website in web/ to match the design, reading data from NEXT_PUBLIC_API_URL (default http://localhost:3000). Pages: home, category, deal page with store picker + price history, search, assistant chat, Gold, sign in, saved/alerts.
2. Deploy backend to Render (render.yaml blueprint) and set NEXT_PUBLIC_API_URL in Vercel.
3. Expo app in mobile/, Android APK via EAS.
4. Auth, Stripe for Gold, real partner feeds (eBay Deal API, Ticketmaster Discovery, Travelpayouts), Google Safe Browsing link checks.

Full plan doc: https://claude.ai/artifact/623vtcT6qQmNpLwMXyR89y
