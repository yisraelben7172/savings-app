import { ShieldCheck, TrendingDown, Store } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { DealGridSkeleton } from "@/components/deal-card";
import { CategoryTiles, CategoryTilesSkeleton, DealGrid } from "@/components/deal-sections";
import { GoldPlans } from "@/components/gold-plans";
import { AskButton, AskChips, HeroSearch } from "@/components/hero-search";
import { fmtDay, PriceLine, priceFacts } from "@/components/price-history";
import { getDeal, getDeals, money } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";

const QUICK = [
  { label: "Headphones", href: "/deals?q=headphones" },
  { label: "Running shoes", href: "/deals?q=shoes" },
  { label: "Skincare", href: "/category/beauty" },
  { label: "Hotels", href: "/category/hotels" },
  { label: "Under $50", href: "/deals?maxPrice=50" },
];

const ASKS = [
  "Running shoes under $70, wide fit",
  "Moisturizer for dry skin under $30",
  "SUV rental in Orlando, Dec 20 to 27",
  "A birthday gift for a 10-year-old under $40",
];

/** The hero's live price check: today's biggest drop, with its price history. */
async function PriceCheck() {
  const top = (await getDeals({ sort: "discount", limit: 6 }).catch(() => [])).find((d) => d.storeCount > 0 && d.saved > 0);
  const deal = top ? await getDeal(top.slug).catch(() => null) : null;
  if (!deal || deal.priceHistory.length < 2) return <PriceCheckSkeleton />;
  const { days, isLowest, last } = priceFacts(deal.priceHistory);
  const first = deal.priceHistory[0];

  return (
    <Link href={`/deals/${deal.slug}`} className={`pricecheck p-${deal.category.color}`} aria-label={`Price check: ${deal.title}`}>
      <div className="pc-top">
        <span className="chipicon">
          <CategoryIcon slug={deal.category.slug} size={18} strokeWidth={1.8} />
        </span>
        <div>
          <div className="t">{deal.title}</div>
          <div className="s">Price over the last {days} days</div>
        </div>
      </div>
      <div className="pc-chart">
        <PriceLine points={deal.priceHistory} height={170} label={`Price fell from ${money(first.price)} to ${money(last.price)}.`} />
        <div className="pc-axis">
          <span>{fmtDay(first.date)}</span>
          <span>Today</span>
        </div>
      </div>
      <div className="pc-foot">
        <div>
          <div className="pc-price">
            {money(deal.bestPrice)}
            <s>{money(deal.originalPrice)}</s>
          </div>
          <div className="pc-stores">
            Best of {deal.offers.length} verified store{deal.offers.length === 1 ? "" : "s"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="keep">You keep {money(deal.saved)}</span>
          {isLowest && <div className="pc-note">Lowest in {days} days</div>}
        </div>
      </div>
    </Link>
  );
}

function PriceCheckSkeleton() {
  return <div className="pricecheck skel" style={{ height: 380 }} aria-hidden />;
}

export default function Home() {
  return (
    <>
      <div className="wrap">
        <section className="hero">
          <div>
            <h1>Buy it when the price is right.</h1>
            <p className="lede">
              Vault watches prices at stores we&apos;ve checked and shows you when something is genuinely worth buying, and where it costs least.
            </p>
            <div className="hero-search">
              <HeroSearch />
              <div className="quick" aria-label="Popular searches">
                {QUICK.map((q) => (
                  <Link key={q.label} href={q.href}>
                    {q.label}
                  </Link>
                ))}
              </div>
            </div>
            <div className="trustline">
              <span>
                <ShieldCheck size={16} aria-hidden />
                Every store vetted
              </span>
              <span>
                <TrendingDown size={16} aria-hidden />
                Price history on every deal
              </span>
              <span>
                <Store size={16} aria-hidden />
                Every store&apos;s price side by side
              </span>
            </div>
          </div>
          <Suspense fallback={<PriceCheckSkeleton />}>
            <PriceCheck />
          </Suspense>
        </section>

        <section className="section" style={{ paddingTop: 24 }}>
          <div className="row-head">
            <div>
              <h2>Price drops today</h2>
              <p>Reductions from verified stores, each with its price history so you can judge for yourself.</p>
            </div>
            <Link href="/deals">See all deals</Link>
          </div>
          <Suspense fallback={<DealGridSkeleton count={8} />}>
            <DealGrid query={{ limit: 8 }} />
          </Suspense>
        </section>

        <section className="section">
          <div className="row-head">
            <h2>Browse by category</h2>
          </div>
          <Suspense fallback={<CategoryTilesSkeleton />}>
            <CategoryTiles />
          </Suspense>
        </section>

        <section className="section">
          <div className="trip-band">
            <div>
              <h2>Planning a trip?</h2>
              <p>Hotel, flight and car from verified stores, totaled against your budget. You approve the plan, then book on the partner&apos;s site.</p>
            </div>
            <Link className="btn primary" href="/trip">
              Plan a trip
            </Link>
          </div>
        </section>

        <GoldPlans />

        <section className="band">
          <div>
            <h2>Describe it. The assistant finds the best price.</h2>
            <p>It searches every verified store at once and only recommends deals that pass our checks.</p>
            <AskButton />
          </div>
          <AskChips asks={ASKS} />
        </section>
      </div>
    </>
  );
}
