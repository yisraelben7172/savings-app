import Link from "next/link";
import { getCategories, getDeals, type Category, type Deal, type DealQuery } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";
import { DealCard } from "./deal-card";

function ApiDown() {
  return (
    <div className="empty">
      <h3>Deals are taking a break</h3>
      <p>We couldn&apos;t reach our deal database. Please refresh in a minute.</p>
    </div>
  );
}

/** Server component: fetches fresh deals at request time (wrap in Suspense). */
export async function DealGrid({ query, empty }: { query: DealQuery; empty?: React.ReactNode }) {
  let deals: Deal[];
  try {
    deals = await getDeals(query);
  } catch {
    return <ApiDown />;
  }
  if (!deals.length)
    return (
      empty ?? (
        <div className="empty">
          <h3>No deals match yet</h3>
          <p>Try a different search, or ask the deal assistant to find one for you.</p>
          <Link className="btn primary" href="/deals">
            See all deals
          </Link>
        </div>
      )
    );
  return (
    <div className="deals">
      {deals.map((d) => (
        <DealCard key={d.id} deal={d} />
      ))}
    </div>
  );
}

export async function CategoryTiles({ current }: { current?: string }) {
  let cats: Category[];
  try {
    cats = await getCategories();
  } catch {
    return null;
  }
  return (
    <nav className="cats" aria-label="Categories">
      {cats.map((c) => (
        <Link
          key={c.slug}
          className={`cat p-${c.color}${c.slug === current ? " on" : ""}`}
          href={`/category/${c.slug}`}
          aria-current={c.slug === current ? "page" : undefined}
        >
          <span className="chipicon">
            <CategoryIcon slug={c.slug} size={18} strokeWidth={1.8} />
          </span>
          <span>
            <b>{c.name}</b>
            <small>
              {c.dealCount.toLocaleString("en-US")} deal{c.dealCount === 1 ? "" : "s"}
            </small>
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function CategoryTilesSkeleton() {
  return (
    <div className="skel" style={{ height: 152, borderRadius: 18 }} aria-hidden />
  );
}

export const SORTS = [
  ["", "Top deals"],
  ["price", "Lowest price"],
  ["discount", "Biggest discount"],
  ["newest", "Newest"],
] as const;
