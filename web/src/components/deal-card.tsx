"use client";

import Link from "next/link";
import { money, type Deal } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";
import { useDealUI } from "./providers";

/** A deal tile. Clicking opens the store picker; it stays a real link for new tabs and crawlers. */
export function DealCard({ deal }: { deal: Deal }) {
  const { openDeal } = useDealUI();
  return (
    <Link
      href={`/deals/${deal.slug}`}
      className={`deal p-${deal.category.color}`}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        openDeal(deal.slug);
      }}
    >
      <div className="tile">
        {deal.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={deal.imageUrl} alt="" loading="lazy" />
        ) : (
          <span className="art">
            <CategoryIcon slug={deal.category.slug} size={36} strokeWidth={1.6} />
          </span>
        )}
        <span className="badge">{deal.discountPct}% off</span>
        {deal.goldOnly ? (
          <span className="gtag">Gold only</span>
        ) : deal.goldEarlyAccess ? (
          <span className="gtag">Gold early access</span>
        ) : deal.isHot ? (
          <span className="badge trend">Trending</span>
        ) : null}
      </div>
      <div className="meta">
        <span>{deal.category.name}</span>
        <span className="ver">
          <span className="dot" />
          Verified stores
        </span>
      </div>
      <h4>{deal.title}</h4>
      <div className="price">
        <b>{money(deal.bestPrice)}</b>
        {deal.priceUnit && <small>{deal.priceUnit}</small>}
        <s>{money(deal.originalPrice)}</s>
      </div>
      <span className="keep">You keep {money(deal.saved)}</span>
    </Link>
  );
}

export function DealGridSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="deals" aria-busy="true" aria-label="Loading deals">
      {Array.from({ length: count }, (_, i) => (
        <div key={i}>
          <div className="skel" style={{ aspectRatio: "5/4", borderRadius: 16 }} />
          <div className="skel" style={{ height: 14, width: "40%", marginTop: 16 }} />
          <div className="skel" style={{ height: 18, marginTop: 10 }} />
          <div className="skel" style={{ height: 24, width: "50%", marginTop: 12 }} />
        </div>
      ))}
    </div>
  );
}
