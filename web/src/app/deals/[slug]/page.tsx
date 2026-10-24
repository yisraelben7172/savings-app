import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PriceHistory } from "@/components/price-history";
import { SaveButton } from "@/components/save-button";
import { StoreList } from "@/components/store-list";
import { getDeal, money } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";

type Props = PageProps<"/deals/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const deal = await getDeal(slug).catch(() => null);
  return deal
    ? { title: deal.title, description: `${money(deal.bestPrice)} (was ${money(deal.originalPrice)}) at ${deal.storeCount} verified stores.` }
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

  return (
    <>
      <div className="crumbs">
        <Link href="/deals">Deals</Link>
        <span aria-hidden>/</span>
        <Link href={`/category/${c.slug}`}>{c.name}</Link>
      </div>
      <div className="deal-page">
        <div>
          <div className={`deal-hero pastel p-${c.color}`}>
            {deal.imageUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={deal.imageUrl} alt="" />
            ) : (
              <CategoryIcon slug={c.slug} size={120} strokeWidth={1.2} />
            )}
            <span className={`tag${deal.isHot ? " hot" : ""}`}>
              {deal.isHot ? "Hot · " : ""}
              {deal.discountPct}% off
            </span>
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
            Verified · {c.name}
          </span>
          <h1>{deal.title}</h1>
          <div className="price" style={{ marginTop: 16 }}>
            <b>{money(deal.bestPrice)}</b>
            {deal.priceUnit && <small>{deal.priceUnit}</small>}
            <s>{money(deal.originalPrice)}</s>
          </div>
          <p className="saved">
            You save {money(deal.saved)}
            {deal.priceUnit ? ` ${deal.priceUnit}` : ""} ({deal.discountPct}% off)
          </p>
          {deal.description && <p style={{ marginTop: 16, color: "var(--muted)" }}>{deal.description}</p>}
          <div style={{ display: "flex", gap: 10, marginTop: 20, flexWrap: "wrap" }}>
            <SaveButton slug={deal.slug} />
          </div>
          <div className="panel">
            <h2>Choose where to buy</h2>
            <StoreList offers={deal.offers} priceUnit={deal.priceUnit} />
          </div>
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
