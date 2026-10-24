import type { Metadata } from "next";
import { Suspense } from "react";
import { DealGridSkeleton } from "@/components/deal-card";
import { CategoryTiles, CategoryTilesSkeleton } from "@/components/deal-sections";
import { DealsBrowser, pickParams } from "@/components/deals-browser";

export const metadata: Metadata = { title: "All deals" };

async function Browser({ searchParams }: { searchParams: PageProps<"/deals">["searchParams"] }) {
  return <DealsBrowser base="/deals" params={pickParams(await searchParams)} />;
}

export default function DealsPage({ searchParams }: PageProps<"/deals">) {
  return (
    <div className="wrap">
      <h1 className="page-title">All deals</h1>
      <p className="page-sub">Every deal here comes from a store we&apos;ve checked. Tap one to compare prices across stores.</p>
      <div style={{ marginTop: 28 }}>
        <Suspense fallback={<CategoryTilesSkeleton />}>
          <CategoryTiles />
        </Suspense>
      </div>
      <Suspense fallback={<div style={{ marginTop: 92 }}><DealGridSkeleton count={8} /></div>}>
        <Browser searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
