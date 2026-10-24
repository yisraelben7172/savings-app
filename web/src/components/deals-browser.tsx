import { Search } from "lucide-react";
import Form from "next/form";
import Link from "next/link";
import { Suspense } from "react";
import type { DealQuery } from "@/lib/api";
import { DealGridSkeleton } from "./deal-card";
import { DealGrid, SORTS } from "./deal-sections";

type Params = { q?: string; sort?: string; maxPrice?: string };

function href(base: string, params: Params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
  const qs = sp.toString();
  return qs ? `${base}?${qs}` : base;
}

/** Search box, sort chips and the deal grid; shared by /deals and /category/[slug]. */
export function DealsBrowser({ base, params, category }: { base: string; params: Params; category?: string }) {
  const maxPrice = params.maxPrice && Number(params.maxPrice) > 0 ? Number(params.maxPrice) : undefined;
  const query: DealQuery = { q: params.q, sort: params.sort || undefined, maxPrice, category, limit: 48 };
  const key = JSON.stringify(query);

  return (
    <>
      <div className="filters">
        <Form action={base} className="omni" style={{ flex: "1 1 320px", maxWidth: 520 }}>
          <Search size={18} className="spark" aria-hidden />
          <label className="sr" htmlFor="deal-q">
            Search deals
          </label>
          <input id="deal-q" name="q" defaultValue={params.q ?? ""} placeholder="Search deals, e.g. serum under $25" />
          {params.sort && <input type="hidden" name="sort" value={params.sort} />}
          <button className="btn primary" type="submit">
            Search
          </button>
        </Form>
        <div className="seg" role="group" aria-label="Sort deals">
          {SORTS.map(([value, label]) => (
            <Link key={label} aria-current={(params.sort ?? "") === value} href={href(base, { ...params, sort: value })}>
              {label}
            </Link>
          ))}
        </div>
      </div>
      {(params.q || maxPrice) && (
        <p className="page-sub" style={{ fontSize: 15 }}>
          {params.q ? <>Showing deals for &ldquo;{params.q}&rdquo;</> : "Showing deals"}
          {maxPrice ? ` under $${maxPrice}` : ""}.{" "}
          <Link href={base} style={{ color: "var(--link)", fontWeight: 600 }}>
            Clear
          </Link>
        </p>
      )}
      <div style={{ marginTop: 24 }}>
        <Suspense key={key} fallback={<DealGridSkeleton count={8} />}>
          <DealGrid query={query} />
        </Suspense>
      </div>
    </>
  );
}

export function pickParams(sp: Record<string, string | string[] | undefined>): Params {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.slice(0, 200);
  return { q: one(sp.q), sort: one(sp.sort), maxPrice: one(sp.maxPrice) };
}
