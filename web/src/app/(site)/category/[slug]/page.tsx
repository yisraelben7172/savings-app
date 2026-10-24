import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DealGridSkeleton } from "@/components/deal-card";
import { CategoryTiles, CategoryTilesSkeleton } from "@/components/deal-sections";
import { DealsBrowser, pickParams } from "@/components/deals-browser";
import { getCategories } from "@/lib/api";

type Props = PageProps<"/category/[slug]">;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const cat = (await getCategories().catch(() => [])).find((c) => c.slug === slug);
  return { title: cat ? `${cat.name} deals` : "Category" };
}

async function CategoryBody({ params, searchParams }: Props) {
  const { slug } = await params;
  const cats = await getCategories().catch(() => null);
  const cat = cats?.find((c) => c.slug === slug);
  if (cats && !cat) notFound();
  const name = cat?.name ?? slug;

  return (
    <>
      <h1 className="page-title">{name} deals</h1>
      <p className="page-sub">
        {cat ? `${cat.dealCount.toLocaleString("en-US")} deal${cat.dealCount === 1 ? "" : "s"} from verified stores right now.` : "Deals from verified stores."}
      </p>
      <div style={{ marginTop: 28 }}>
        <Suspense fallback={<CategoryTilesSkeleton />}>
          <CategoryTiles current={slug} />
        </Suspense>
      </div>
      <DealsBrowser base={`/category/${slug}`} params={pickParams(await searchParams)} category={slug} />
    </>
  );
}

export default function CategoryPage(props: Props) {
  return (
    <div className="wrap">
      <Suspense
        fallback={
          <>
            <div className="skel" style={{ height: 52, width: 320, marginTop: 24 }} />
            <div style={{ marginTop: 120 }}>
              <DealGridSkeleton count={8} />
            </div>
          </>
        }
      >
        <CategoryBody {...props} />
      </Suspense>
    </div>
  );
}
