"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getDeal, type Deal } from "@/lib/api";
import { useHydrated } from "./client-hooks";
import { DealCard, DealGridSkeleton } from "./deal-card";
import { useSaved } from "./saved";

export function SavedDeals() {
  const { saved } = useSaved();
  const [deals, setDeals] = useState<Record<string, Deal | null>>({});
  const mounted = useHydrated();

  useEffect(() => {
    const missing = saved.filter((s) => !(s in deals));
    if (!missing.length) return;
    Promise.all(missing.map((s) => getDeal(s).catch(() => null))).then((rows) =>
      setDeals((cur) => ({ ...cur, ...Object.fromEntries(missing.map((s, i) => [s, rows[i]])) })),
    );
  }, [saved, deals]);

  if (!mounted) return <DealGridSkeleton count={4} />;

  if (!saved.length)
    return (
      <div className="empty">
        <h3>Nothing saved yet</h3>
        <p>Tap &ldquo;Save deal&rdquo; on any deal to keep it here.</p>
        <Link className="btn primary" href="/deals">
          Browse deals
        </Link>
      </div>
    );

  const loading = saved.some((s) => !(s in deals));
  if (loading) return <DealGridSkeleton count={Math.min(saved.length, 4)} />;

  const live = saved.map((s) => deals[s]).filter((d): d is Deal => !!d);
  const ended = saved.length - live.length;

  return (
    <>
      {live.length > 0 && (
        <div className="deals">
          {live.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
        </div>
      )}
      {ended > 0 && (
        <p className="disclosure">
          {ended} saved deal{ended === 1 ? " has" : "s have"} ended and {ended === 1 ? "is" : "are"} no longer shown.
        </p>
      )}
    </>
  );
}
