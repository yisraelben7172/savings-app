import Link from "next/link";
import { Suspense } from "react";
import { DealGridSkeleton } from "@/components/deal-card";
import { CategoryTiles, CategoryTilesSkeleton, DealGrid } from "@/components/deal-sections";
import { GoldPlans } from "@/components/gold-plans";
import { AskChips, HeroSearch } from "@/components/hero-search";
import { getDeals, money } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";

const QUICK = [
  { label: "Headphones", href: "/deals?q=headphones", c: "sky" },
  { label: "Sneakers", href: "/deals?q=shoes", c: "mint" },
  { label: "Beauty", href: "/category/beauty", c: "blush" },
  { label: "Concerts this weekend", href: "/category/concerts", c: "rose" },
  { label: "Car rentals", href: "/category/car-rentals", c: "teal" },
  { label: "Gifts under $50", href: "/deals?maxPrice=50", c: "lilac" },
];

const ASKS = [
  "Running shoes under $70, wide fit",
  "Moisturizer for dry skin under $30",
  "SUV rental in Orlando, Dec 20 to 27",
  "Kids' birthday gift ideas under $40",
  "Last-minute concert tickets this weekend",
];

/** The four floating deal cards around the hero, from live top deals. */
async function FloatingDeals() {
  const deals = await getDeals({ limit: 4 }).catch(() => []);
  return deals.slice(0, 4).map((d, i) => (
    <Link key={d.id} href={`/deals/${d.slug}`} className={`float f${i + 1} p-${d.category.color}`} aria-hidden tabIndex={-1}>
      <div className="sw pastel">
        <CategoryIcon slug={d.category.slug} size={16} strokeWidth={2} />
      </div>
      <div className="k">{d.title.split(",")[0]}</div>
      <div className="v">
        {money(d.bestPrice)}
        <s>{money(d.originalPrice)}</s>
      </div>
    </Link>
  ));
}

export default function Home() {
  return (
    <>
      <div className="wrap">
        <section className="hero">
          <span className="blob b1" />
          <span className="blob b2" />
          <span className="blob b3" />
          <span className="blob b4" />
          <Suspense fallback={null}>
            <FloatingDeals />
          </Suspense>
          <h1>Real deals from stores you can trust</h1>
          <p className="lede">Price drops, flash sales and last-minute fares, checked and collected in one place.</p>
          <HeroSearch />
          <div className="quick" aria-label="Popular right now">
            {QUICK.map((q) => (
              <Link key={q.label} href={q.href} className={`p-${q.c}`}>
                {q.label}
              </Link>
            ))}
          </div>
          <div className="trust">
            <span>
              <span className="dot" />
              Every store checked before it appears
            </span>
            <span>
              <span className="dot" />
              Prices refreshed every hour
            </span>
            <span>
              <span className="dot" />
              Free to use
            </span>
          </div>
        </section>

        <div className="row-head">
          <h2>Dropped today</h2>
          <Link href="/deals">See all deals</Link>
        </div>
        <Suspense fallback={<DealGridSkeleton count={8} />}>
          <DealGrid query={{ limit: 8 }} />
        </Suspense>

        <div className="row-head">
          <h2>Browse by category</h2>
        </div>
        <Suspense fallback={<CategoryTilesSkeleton />}>
          <CategoryTiles />
        </Suspense>
      </div>

      <div className="wrap">
        <GoldPlans />
      </div>

      <section className="wrap">
        <div className="band">
          <div>
            <h2>Tell it what you need. It finds the deal.</h2>
            <p>Our AI assistant searches every verified store at once and only shows deals that pass our checks.</p>
          </div>
          <AskChips asks={ASKS} />
        </div>
      </section>
    </>
  );
}
