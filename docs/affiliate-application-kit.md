# Affiliate application kit

Ready-to-edit material for applying to affiliate networks. **Nothing here has been submitted.** You (the owner) submit each application yourself; applications ask you to accept legal terms and give tax and payout details, which Claude does not do for you.

How to use this: finish the checklist, then for each network read its section, copy the matching answers from the answer bank, replace every `[PLACEHOLDER]`, and submit.

> **Verify on the official page before you apply.** Network requirements, minimums and application screens change. Items marked *(verify)* came from public pages that may be out of date or from third parties. The official application page is the source of truth. Last checked 2026-10-27.

## 1. Before you apply (checklist)

Networks and brands review your site. Applying with an empty or half-finished site is the most common reason for rejection.

- [ ] **A real domain**, not a `vercel.app` address (e.g. getvault.app). Cloudflare is the planned registrar/DNS. Point it at the Vercel project.
- [ ] **Site live on that domain** with real content. Today it shows labeled sample deals; networks will want to see the real thing, so connect at least one real source first if you can.
- [ ] **Legal pages live** (done in code, they appear after the next deploy): `/privacy`, `/affiliate-disclosure`, `/about`, `/contact`. The footer links to all four.
- [ ] **Set these in Vercel** (Settings → Environment Variables), then redeploy, so the pages show real details instead of "being set up":
  - `NEXT_PUBLIC_BUSINESS_NAME` (your legal or trade name)
  - `NEXT_PUBLIC_CONTACT_EMAIL` (an inbox you read, on your domain ideally)
  - `NEXT_PUBLIC_BUSINESS_ADDRESS` (a mailing address; a PO box or virtual mailbox works)
- [ ] **A business email on your domain.** Free webmail addresses (gmail.com) are often rejected or scored lower.
- [ ] **Decide your legal setup** (sole proprietor vs LLC). Applications ask for a tax ID (SSN/EIN) and payout details. Ask an accountant if unsure.
- [ ] **Have these ready:** your name, address, phone, the site URL, a payout method (usually bank/PayPal), tax form info (US networks usually collect a W-9 inside their dashboard).
- [ ] **A lawyer or accountant should read the privacy policy and disclosure once.** They are written to match what the app really does today, but they are not legal advice.
- [ ] **Never overstate.** Don't claim traffic, audience size, or partnerships you don't have. Say it is a new site. Networks check, and a false statement can get you banned.

## 2. Answer bank (copy, edit, reuse)

Replace `[PLACEHOLDERS]`. Keep it truthful; delete anything that isn't yet true.

**Website name / URL**
`[Vault]`, `https://[YOUR-DOMAIN]`

**Describe your website (short)**
> [Vault] is a US deals website that tracks prices at stores we have checked and shows shoppers where a product costs least and whether a price is actually good, using price history. Shoppers can compare the same product across stores and ask an AI deal assistant for help in plain language.

**Describe your website (long)**
> [Vault] collects publicly advertised deals, price drops and sales from stores that pass our trust checks (approved merchant, https links on the store's own domain, fresh prices). For each product we show every store's price, price history, and delivery and rating information where the store provides it. Deals are ranked by fit to the shopper's request, price, and freshness. Commission data is never used in ranking, and we test for that. We only show a discount when the store states its own regular price. We are a new site and currently build our catalog from [DESCRIBE REAL SOURCES, e.g. approved product feeds].

**Who is your audience?**
> US online shoppers who want to buy at a good price without spending hours comparing: [EDIT: e.g. electronics, home, beauty and travel shoppers]. [ADD ONLY IF TRUE: how you expect to reach them, e.g. search, social, newsletter.]

**How will you promote the brand's products?**
> On-site: deal listings, side-by-side comparisons and price history; an AI deal assistant that recommends only products from our catalog. [ADD ONLY IF TRUE: email newsletter, social posts, price-drop alerts. Today the site has no email list and no price alerts, so do not claim them.] We do not use coupon-code pop-ups, browser extensions, toolbars, incentivized traffic, or paid search on brand terms.

**Traffic / audience size**
> We are a new website launching in [MONTH YEAR] and do not yet have meaningful traffic. [If asked for a number, give the true number even if it is zero.]

**How do you disclose affiliate relationships?**
> A short disclosure ("We may earn a commission when you buy through our links, at no extra cost to you") appears in the footer of every page and next to store links. A full policy is at `https://[YOUR-DOMAIN]/affiliate-disclosure`. Where a program requires specific wording, we show that wording next to the program's links.

**Do you use AI?**
> Yes. Our deal assistant uses an AI model. It can only discuss products in our own catalog, cannot invent prices or stores, and its answers are checked against our data before shoppers see them. [For Amazon: we do not send Amazon content to AI models unless the Associates agreement allows it.]

**Do you use coupons / loyalty / cashback / browser extensions?** No.

**Content restrictions**
> No adult, gambling, tobacco or illegal content. [CONFIRM per network.]

**Where does your traffic come from?** `[Search / Direct / Social / Email. Only what is true; "new site, none yet" is acceptable.]`

## 3. Network by network

### Amazon Associates (US)

- **Apply at:** `https://affiliate-program.amazon.com`
- **What it asks:** account details, website URL(s), a description of the site and how you drive traffic, a payout method and tax information. Associates must **make qualifying sales within 180 days** of approval or the account is closed *(verify; this has been widely reported)*. Applications are reviewed after the first qualifying sale in some cases *(verify)*.
- **Rules that matter for Vault:**
  - You must show Amazon's required Associate statement (wording in the Operating Agreement). **Do not publish it from memory;** copy it exactly from the agreement after approval and tell Claude so it can be added.
  - Amazon prices and product data may only be shown in ways the agreement allows (the Product Advertising API has its own rules about freshness and caching). **Do not store or display Amazon prices from scraping.** Do not send Amazon content to Claude/AI until you've confirmed the agreement permits it.
  - Links must use your tag; no link cloaking, no use in email *(verify the current rules)*.
- **After approval:** Admin → Affiliate links → add a program for the Amazon store with network "Amazon" and your account tag (the `tag` value). Paste the required disclosure text exactly. Do not enable until you have confirmed wording and link rules (CLAUDE.md "Next steps" item 3).

### impact.com

- **Apply at:** `https://impact.com/` (create a "Partner/Publisher" account, then apply to each brand's program from the marketplace).
- **What it asks:** company/site details, promotional methods, audience, tax info and payment method. Each brand then approves or rejects you separately, and many want to see a working site with real content.
- **After approval for a brand:** copy the brand's tracking link format from the dashboard into Admin → Affiliate links ("Link template"), using `{urlEncoded}` and `{clickId}` where the network documents the deep-link and sub-ID parameters. Never guess the format. Set the allowed tracking host the network shows (e.g. the host in the sample link).

### CJ Affiliate

- **Apply at:** `https://www.cj.com/` → "Publishers" → sign up.
- **What it asks:** website and promotional details, traffic sources, tax and payment details. Then apply to each advertiser. *(verify: a small one-time/network fee has existed at some times; check before paying; ask the owner before any payment.)*
- **After approval:** same as impact.com: paste the advertiser's link template from the dashboard, using their sub-ID (SID) parameter for `{clickId}`.

### Awin

- **Apply at:** `https://www.awin.com/` → "Publishers" → sign up.
- **What it asks:** site details and promotion methods; historically an approval step plus a small refundable deposit/fee at signup *(verify the current amount and whether it applies; get the owner's OK before paying anything)*. Then apply to each advertiser.
- **After approval:** paste the advertiser's deep link template; Awin's click reference parameter takes the click ID *(check the dashboard's own link builder, do not guess)*.

### Rakuten Advertising

- **Apply at:** `https://rakutenadvertising.com/` → publishers → sign up.
- **What it asks:** site details, promotional methods, tax and payout details, then per-advertiser applications. They review site quality.
- **After approval:** paste the program's link format from the dashboard; use their sub-ID ("u1") for the click ID if the dashboard documents it *(verify)*.

### eBay Partner Network

- **Apply at:** `https://partnernetwork.ebay.com/`
- **What it asks:** your site, how you will promote, and payout/tax info. Approval is by eBay. *(verify)* There are specific rules for how eBay content may be shown and cached.
- **After approval:** use the link builder/campaign ID from the dashboard; paste the exact format as a template; do not store eBay content beyond what their API terms permit.

### Travelpayouts

- **Apply at:** `https://www.travelpayouts.com/`
- **What it asks:** a short sign-up with your site, then you join individual travel programs (hotels, flights, car rentals) in their dashboard. Relevant for the Hotels/Car rentals/Flights categories *(verify requirements)*.
- **After approval:** paste each program's link template from the dashboard, and the sub-ID parameter (usually `sub_id`) per their docs *(verify)*.

### Direct brand programs

For a brand that is not on a network, use the approve-before-send outreach queue (Admin → Partners). Use the answer bank as the basis of the message. Never send bought or scraped lists (CAN-SPAM).

## 4. Example affiliate application (illustration only)

This is what a filled-in application typically looks like. It uses invented placeholders so you can see the shape. **It is not submitted anywhere.** Replace everything in brackets with your real, true information.

**Network:** impact.com (example)  
**Account type:** Publisher / Partner

| Field | Example answer |
| --- | --- |
| Company / trade name | `[Your legal name or LLC name]` |
| Website | `https://[YOUR-DOMAIN]` |
| Website name | `[Vault]` |
| Country | United States |
| Contact name / email / phone | `[Your name]` / `[you@your-domain]` / `[phone]` |
| Mailing address | `[PO box or street address]` |
| Partner type | Deal / comparison site (price tracking) |
| Primary category | Shopping / Deals |
| Promotional methods | Website content (deal listings, comparisons, price history), AI shopping assistant `[+ newsletter only if you really have one]` |
| Monthly visitors | `[true number, e.g. "New site, launching [month]"]` |
| Traffic sources | `[true sources]` |
| Promotion description | "[Vault] tracks prices at verified stores and helps shoppers see where a product costs least and whether a price is good, with price history and side-by-side comparison. We rank by fit and price, never by commission. We disclose affiliate relationships on every page." |
| Disclosure URL | `https://[YOUR-DOMAIN]/affiliate-disclosure` |
| Privacy policy URL | `https://[YOUR-DOMAIN]/privacy` |
| Payout method | `[Bank / PayPal, you enter this yourself]` |
| Tax info | `[W-9, you enter this yourself]` |

**Message to a brand when applying to its program** (many networks have an "Anything else we should know?" box):

> Hello [BRAND] partnerships team,
>
> I run [Vault] (https://[YOUR-DOMAIN]), a US deals site that tracks prices at stores we have checked and shows shoppers where a product costs least, with price history and side-by-side comparison. We are new and building our audience, and we'd like to include [BRAND]'s products.
>
> How we would feature you: product listings with your current price and a link to your own store; inclusion in comparisons with other stores; and price-drop highlights when your prices fall. We rank by price and fit to the shopper's request, never by commission, and we show a clear affiliate disclosure on every page (https://[YOUR-DOMAIN]/affiliate-disclosure).
>
> We don't use coupon pop-ups, browser extensions or incentivized traffic. We'd be glad to follow any brand guidelines you have.
>
> Thank you for considering us,  
> [Your name], [Vault]  
> [email] · [address]

**Why this wording is safe to send:** it states only things the site does today, says it is new, gives no invented numbers, and promises nothing about volume.

## 5. Status tracker (fill in as you go)

| Network / brand | Date applied | Status | Approved date | Notes (tag/ID, wording to show) | Set up in Admin? |
| --- | --- | --- | --- | --- | --- |
| Amazon Associates |  |  |  |  | no |
| impact.com |  |  |  |  | no |
| CJ Affiliate |  |  |  |  | no |
| Awin |  |  |  |  | no |
| Rakuten Advertising |  |  |  |  | no |
| eBay Partner Network |  |  |  |  | no |
| Travelpayouts |  |  |  |  | no |

## 6. Rules to keep

- Never enter fake or estimated stats. Never fake a site, reviews, or partnerships.
- Do not use a link or program until it is **APPROVED** and set up in Admin → Affiliate links; the app refuses tracked links otherwise.
- Keep the disclosure text each program requires next to its links.
- Never promise a brand a ranking position or sales volume.
- Ask Claude before paying any signup fee or accepting any contract; Claude will not do either for you.
