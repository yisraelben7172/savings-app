# Trip planner (Step 1): AI plans, the shopper approves, partner sites book

Owner decision 2026-10-29. Step 2 (booking and payment inside the app) is NOT in scope: it needs booking APIs, payment handling, Seller of Travel registration and a travel lawyer first.

## What the shopper experiences
1. In the assistant (or a "Plan a trip" page), the shopper types something like:
   "Miami, Dec 20 to 27, 2 adults, $1,500 total, I want the Fontainebleau, plus a flight from JFK and a car."
2. The assistant turns that into a typed trip request and confirms anything missing in one short question (dates, travelers, origin airport, budget).
3. Vault builds ONE trip plan: hotel (the named hotel if found, plus up to 2 alternatives), optional flight, optional car rental. Each item shows: name, dates, price per night/day and total for the stay, store options side by side (store picker), cancellation terms if the source states them, "price checked N minutes ago".
4. A running total vs the budget ("$1,480 of $1,500"). Over budget: show it clearly and suggest the cheapest swap; never hide items.
5. The shopper taps **Approve plan**. Vault re-checks every price (same rule as shopping plans). If anything changed, update the plan and ask again.
6. After approval, the plan shows one **Book on <store>** button per item, in a sensible order (flight first, then hotel, then car). Each opens the partner site through /api/go/:offerId so the click is tracked. Vault never takes payment and never says "booked": the copy is "Finish booking on Expedia", and after the shopper returns: "Did you complete this booking?" (optional self-report, no personal data).

## Rules (same as the rest of Vault; never break them)
- Only real, permitted data. Travel prices, availability and cancellation terms come only from approved sources (network APIs/feeds) with a permission record. Until one exists, use clearly labeled demo travel data under the existing "samples" notice. Never invent prices, availability, ratings, room types or policies.
- Pre-filled booking links: add dates/guests/airport to a partner link ONLY using a format documented in that partner's official docs or provided in the network dashboard and recorded on the AffiliateProgram (same rule as link templates: no guessed parameters). If no documented format exists, send the shopper to the item's page and show the dates and guests to enter, with a copy button.
- The assistant model never sees affiliate, commission or click data; ranking ignores commission (reuse search ranking + the eval). Every price or store in the AI's reply passes the existing claim checker.
- The AI never books or pays. Approval only unlocks the booking buttons.
- Respect the trust gate (approved merchants, trustScore >= 70, fresh prices, https on the merchant's domain).
- Per-night/per-day prices: show both the unit price and the stay total; the total must be computed in code from dates, never by the model.
- Required copy: affiliate disclosure, AI disclosure, "Prices and availability can change on the booking site", each program's required disclosure next to its buttons.

## Data model (travel is its own domain, per roadmap P7; don't force it into Product)
- TripPlan: id (random, unguessable), status (DRAFT, READY, APPROVED, EXPIRED, CANCELLED), destination, startDate, endDate, travelers (adults, children), originAirport (optional), budgetUsd, createdAt, expiresAt (7 days), no personal data.
- TripItem: planId, kind (HOTEL, FLIGHT, CAR), title, offerIds (store options), chosenOfferId, unitPrice, unitLabel (night/day/trip), quantity, totalPrice, cancellationText (only if the source states it), priceCheckedAt, position.
- Reuse Offer/Merchant/DataSource for the per-store prices; travel offers carry check-in/check-out (or pickup/drop-off) dates.
- Migration + rollback SQL in prisma/rollbacks/, same as earlier priorities.

## API
- POST /api/trips (typed request, validated like ShoppingRequest; AI output is untrusted input)
- GET /api/trips/:id
- POST /api/trips/:id/items/:itemId/select (choose a store or an alternative)
- POST /api/trips/:id/approve (re-check prices; refuse and update if anything changed)
- POST /api/trips/:id/cancel
- Assistant tool `plan_trip` that calls the same service (bounded turns/time like existing tools). Rate limits like plans.

## Website
- /trip/[id] page: items, store options, totals vs budget, Approve, then Book buttons. Mobile first.
- Assistant: when the request is a trip, reply briefly and show a "View your trip plan" card.
- Home: a "Plan a trip" quick prompt (travel stays below shopping on the page, per the owner).

## Done when
- Unit + integration tests: request validation, totals and budget math, over-budget handling, re-check on approve, expiry, trust-gate filtering, no guessed link parameters, claim checker on trip replies, ranking ignores commission.
- Eval rows added for trips (budget respected, named hotel found or honestly reported missing, no invented prices).
- Docs updated: architecture, roadmap (new item under P5/P7), operations, privacy page if anything stored changes; CLAUDE.md updated; pushed.
