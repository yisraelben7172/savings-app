"use client";

import { ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useNowMinute } from "./client-hooks";
import { goHref, money, type Offer } from "@/lib/api";

type SortBy = "price" | "rating" | "fast";
const SORTS: [SortBy, string][] = [
  ["price", "Lowest price"],
  ["rating", "Top rated"],
  ["fast", "Fastest"],
];

function minutesAgo(iso: string, now: number) {
  const m = Math.max(0, Math.round((now - new Date(iso).getTime()) / 60000));
  if (m < 1) return "just now";
  if (m < 60) return `${m} minute${m === 1 ? "" : "s"} ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Every verified store for a deal, sortable; the cheapest is marked "Best price". */
export function StoreList({ offers, priceUnit }: { offers: Offer[]; priceUnit: string | null }) {
  const [sortBy, setSortBy] = useState<SortBy>("price");
  const now = useNowMinute();
  const cheapest = Math.min(...offers.map((o) => o.price));
  const sorted = [...offers].sort((a, b) =>
    sortBy === "price" ? a.price - b.price : sortBy === "rating" ? b.rating - a.rating : a.speedRank - b.speedRank || a.price - b.price,
  );
  const latest = offers.reduce<string | null>((acc, o) => (!acc || o.lastCheckedAt > acc ? o.lastCheckedAt : acc), null);

  return (
    <>
      <div className="sh-sort" role="group" aria-label="Sort stores">
        {SORTS.map(([key, label]) => (
          <button key={key} type="button" aria-pressed={sortBy === key} onClick={() => setSortBy(key)}>
            {label}
          </button>
        ))}
      </div>
      <ul className="stores">
        {sorted.map((o) => {
          const best = o.price === cheapest;
          return (
            <li key={o.id} className={`store-row${best ? " best" : ""}`}>
              <span className={`logo-l pastel p-${o.storeColor}`} aria-hidden>
                {o.store.replace(/[^A-Za-z]/g, "").slice(0, 1)}
              </span>
              <div>
                <div className="st-name">
                  {o.store}
                  {best && <span className="best-tag">Best price</span>}
                </div>
                <div className="st-meta">
                  {o.verified && (
                    <span className="ver">
                      <span className="dot" />
                      Verified
                    </span>
                  )}
                  {o.rating != null ? `, ${o.rating} stars` : ""}
                  {o.deliveryNote ? `, ${o.deliveryNote}` : ""}
                </div>
                {o.attribution && <div className="st-meta">{o.attribution}</div>}
              </div>
              <div className="st-right">
                <div className="st-price">
                  {money(o.price)}
                  {priceUnit && <small>{priceUnit}</small>}
                </div>
                <a className={`btn st-go${best ? " primary" : ""}`} href={goHref(o)} rel="nofollow sponsored noopener" target="_blank">
                  Go to {o.store}
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="sh-foot">
        <ShieldCheck size={15} aria-hidden />
        <span>
          Every store here passed our checks.{latest && now ? ` Prices checked ${minutesAgo(latest, now)}` : " Prices"} and can change at the store. We may earn a commission.
        </span>
      </div>
    </>
  );
}
