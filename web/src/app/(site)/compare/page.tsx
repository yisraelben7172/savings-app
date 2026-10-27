import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { getComparison, money, type CompareItem, type Comparison } from "@/lib/api";

export const metadata: Metadata = { title: "Compare deals" };

type Props = PageProps<"/compare">;

function slugsFrom(v: string | string[] | undefined) {
  const raw = Array.isArray(v) ? v[0] : v;
  return [...new Set((raw ?? "").split(",").map((s) => s.trim()).filter((s) => /^[a-z0-9][a-z0-9-]{0,99}$/.test(s)))].slice(0, 5);
}

const priceText = (i: CompareItem) => `${money(i.bestPrice)}${i.priceUnit ? ` ${i.priceUnit}` : ""}`;

function Tag({ show, children }: { show: boolean; children: string }) {
  return show ? <span className="cmp-tag">{children}</span> : null;
}

function Table({ c }: { c: Comparison }) {
  const h = c.highlights;
  const rows: { label: string; cell: (i: CompareItem) => React.ReactNode }[] = [
    { label: "Lowest price", cell: (i) => (<><b className="cmp-price">{priceText(i)}</b><Tag show={h.lowestPrice.includes(i.slug)}>Lowest</Tag></>) },
    { label: "At", cell: (i) => i.cheapestStore },
    { label: "Verified stores", cell: (i) => (<>{i.storeCount}<Tag show={h.mostStores.includes(i.slug) && c.items.length > 1 && i.storeCount > 1}>Most stores</Tag></>) },
    { label: "Store's own list price", cell: (i) => (i.statedListPrice ? money(i.statedListPrice) : <span className="cmp-na">Not stated</span>) },
    { label: "Below list price", cell: (i) => (i.statedDiscountPercent ? (<>{i.statedDiscountPercent}%<Tag show={h.biggestStatedDiscount.includes(i.slug) && c.items.filter((x) => x.statedDiscountPercent).length > 1}>Biggest</Tag></>) : <span className="cmp-na">Not stated</span>) },
    {
      label: "Price history",
      cell: (i) =>
        i.priceHistory ? (
          <>
            {money(i.priceHistory.low)} to {money(i.priceHistory.high)}, average {money(i.priceHistory.average)}
            <div className="cmp-sub">
              Now {Math.abs(i.priceHistory.currentVsAveragePercent)}% {i.priceHistory.currentVsAveragePercent <= 0 ? "below" : "above"} average, over {i.priceHistory.days} days
              <Tag show={i.priceHistory.atLowest}>At its lowest</Tag>
            </div>
          </>
        ) : (
          <span className="cmp-na">No history yet</span>
        ),
    },
    { label: "Delivery", cell: (i) => (i.fastestDelivery?.note ? `${i.fastestDelivery.note} (${i.fastestDelivery.store})` : <span className="cmp-na">Not stated</span>) },
    { label: "Price checked", cell: (i) => `${i.oldestPriceCheckHoursAgo} hour${i.oldestPriceCheckHoursAgo === 1 ? "" : "s"} ago` },
    ...c.attributeKeys.map((k) => ({ label: k[0].toUpperCase() + k.slice(1), cell: (i: CompareItem) => i.attributes[k] ?? <span className="cmp-na">Not stated</span> })),
  ];

  return (
    <div className="panel">
      <div className="table-wrap">
        <table className="cmp">
          <thead>
            <tr>
              <th scope="col">
                <span className="sr">Detail</span>
              </th>
              {c.items.map((i) => (
                <th key={i.slug} scope="col">
                  <Link href={`/deals/${i.slug}`}>{i.title}</Link>
                  <span className="cmp-sub">{i.brand ? `${i.brand}, ${i.category}` : i.category}</span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <th scope="row">{r.label}</th>
                {c.items.map((i) => (
                  <td key={i.slug}>{r.cell(i)}</td>
                ))}
              </tr>
            ))}
            <tr>
              <th scope="row">
                <span className="sr">Choose a store</span>
              </th>
              {c.items.map((i) => (
                <td key={i.slug}>
                  <Link className="btn small-btn" href={`/deals/${i.slug}`}>
                    Compare stores
                  </Link>
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

async function CompareBody({ searchParams }: { searchParams: Props["searchParams"] }) {
  const slugs = slugsFrom((await searchParams).slugs);
  if (slugs.length < 2) {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <h3>Choose deals to compare</h3>
        <p>Open a deal and choose &ldquo;Compare with similar deals&rdquo;, or ask the assistant to compare a few.</p>
        <Link className="btn primary" href="/deals">
          Browse deals
        </Link>
      </div>
    );
  }
  let result;
  try {
    result = await getComparison(slugs);
  } catch {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <h3>We couldn&apos;t load the comparison</h3>
        <p>Our deal database didn&apos;t answer. Please refresh in a minute.</p>
      </div>
    );
  }
  if (!result.ok) {
    return (
      <div className="empty" style={{ marginTop: 24 }}>
        <h3>These can&apos;t be compared right now</h3>
        <p>{result.message}</p>
        <Link className="btn primary" href="/deals">
          Browse deals
        </Link>
      </div>
    );
  }
  const c = result.data;
  return (
    <>
      {c.warnings.length > 0 && (
        <div className="notice" role="note">
          <b>What this can&apos;t tell you</b>
          <ul className="cmp-warn">
            {c.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}
      {c.unavailable.length > 0 && <p className="disclosure">Left out because they&apos;re no longer available: {c.unavailable.join(", ")}.</p>}
      <div style={{ marginTop: 20 }}>
        <Table c={c} />
      </div>
      <p className="disclosure">Prices are each store&apos;s own and can change at the store. We may earn a commission when you buy through our links; it never affects what we show or how we rank it.</p>
    </>
  );
}

export default function ComparePage({ searchParams }: Props) {
  return (
    <div className="wrap">
      <h1 className="page-title">Compare deals</h1>
      <p className="page-sub">Prices, stores and price history side by side. We only show what the stores have stated, and say so when something is missing.</p>
      <Suspense fallback={<div className="skel" style={{ height: 360, marginTop: 24, borderRadius: 20 }} />}>
        <CompareBody searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
