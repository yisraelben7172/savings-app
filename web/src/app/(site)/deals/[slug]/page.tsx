import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceHistory } from "@/components/price-history";
import { SaveButton } from "@/components/save-button";
import { StoreList } from "@/components/store-list";
import { getDeal, getDeals, money } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";

type Props = PageProps<"/deals/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getDeal(slug).catch(() => null);
  return deal
    ? {
        title: deal.title,
        description: `${money(deal.bestPrice)}${deal.saved > 0 ? ` (store list price ${money(deal.originalPrice)})` : ""} at ${deal.storeCount} verified store${deal.storeCount === 1 ? "" : "s"}.`,
      }
    : { title: "Deal" };
}

async function DealBody({ params }: Props) {
  const { slug } = await params;
  let deal;
  try {
    deal = await getDeal(slug);
  } catch {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <h3>We couldn&apos;t load this deal</h3>
        <p>Our deal database didn&apos;t answer. Please refresh in a minute.</p>
      </div>
    );
  }
  if (!deal) notFound();
  const c = deal.category;
  const similar = (await getDeals({ category: c.slug, limit: 6 }).catch(() => [])).filter((d) => d.slug !== deal.slug).slice(0, 3);

  return (
    <>
      <div className="crumbs">
        <Link href="/deals">Deals</Link>
        <span aria-hidden>/</span>
        <Link href={`/category/${c.slug}`}>{c.name}</Link>
      </div>
      <div className="deal-page">
        <div>
          <div className={`deal-hero p-${c.color}`}>
            {deal.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deal.imageUrl} alt="" />
            ) : (
              <span className="art">
                <CategoryIcon slug={c.slug} size={64} strokeWidth={1.4} />
              </span>
            )}
            {deal.discountPct > 0 && <span className="badge">{deal.discountPct}% off</span>}
            {deal.goldOnly ? <span className="gtag">Gold only</span> : deal.goldEarlyAccess ? <span className="gtag">Gold early access</span> : null}
          </div>
          <div className="panel">
            <h2>Price history</h2>
            <PriceHistory points={deal.priceHistory} />
          </div>
        </div>
        <div>
          <span className="ver">
            <span className="dot" />
            {deal.offers.length} verified store{deal.offers.length === 1 ? "" : "s"}
          </span>
          <h1>{deal.title}</h1>
          <div className="price">
            <b>{money(deal.bestPrice)}</b>
            {deal.priceUnit && <small>{deal.priceUnit}</small>}
            {deal.saved > 0 && <s>{money(deal.originalPrice)}</s>}
          </div>
          {deal.saved > 0 && (
            <span className="keep">
              You keep {money(deal.saved)}
              {deal.priceUnit ? ` ${deal.priceUnit}` : ""}, {deal.discountPct}% below the store&apos;s list price
            </span>
          )}
          {deal.description && <p style={{ marginTop: 16, color: "var(--muted)" }}>{deal.description}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <SaveButton slug={deal.slug} />
          </div>
          <div className="panel">
            <h2>Choose where to buy</h2>
            <StoreList offers={deal.offers} priceUnit={deal.priceUnit} placement="web-deal-page" />
          </div>
          {similar.length > 0 && (
            <div className="panel">
              <h2>Compare with similar deals</h2>
              <div className="hist">
                <ul className="rows" style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {similar.map((d) => (
                    <li key={d.slug} style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "8px 0" }}>
                      <Link href={`/deals/${d.slug}`}>{d.title}</Link>
                      <span className="num">{money(d.bestPrice)}</span>
                    </li>
                  ))}
                </ul>
                <Link className="btn" style={{ marginTop: 12 }} href={`/compare?slugs=${[deal.slug, ...similar.map((d) => d.slug)].join(",")}`}>
                  Compare side by side
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export default function DealPage(props: Props) {
  return (
    <div className="wrap">
      <Suspense
        fallback={
          <div className="deal-page" aria-busy="true">
            <div className="skel" style={{ aspectRatio: "4/3", borderRadius: 28 }} />
            <div>
              <div className="skel" style={{ height: 40, marginTop: 30 }} />
              <div className="skel" style={{ height: 44, width: "40%", marginTop: 16 }} />
              <div className="skel" style={{ height: 280, marginTop: 24, borderRadius: 24 }} />
            </div>
          </div>
        }
      >
        <DealBody {...props} />
      </Suspense>
    </div>
  );
}
