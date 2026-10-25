import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { adminApi, type CatalogHealth } from "@/lib/admin";

export const metadata: Metadata = { title: "Catalog health" };

export default async function CatalogPage() {
  const h = await adminApi<CatalogHealth>("/catalog/health");
  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Catalog health</h1>
          <p>What shoppers can see right now, and what needs attention. Stale or out-of-stock prices are hidden from the site automatically.</p>
        </div>
        <div className="actions">
          <Link href="/admin/sources" className="btn primary">
            Data sources
          </Link>
        </div>
      </div>

      {h.legacyDemoDeals > 0 && (
        <div className="banner warn">
          <AlertTriangle size={18} aria-hidden />
          <div>
            {h.legacyDemoDeals} deal{h.legacyDemoDeals === 1 ? " comes" : "s come"} from the sample catalog. The site shows a &ldquo;samples&rdquo; notice until
            real sources replace them.
          </div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="v">{h.shownOffers}</div>
          <div className="l">Store prices shown now, of {h.offers}</div>
        </div>
        <div className={`kpi${h.staleOffers ? " attn" : ""}`}>
          <div className="v">{h.staleOffers}</div>
          <div className="l">Stale prices (hidden until refreshed)</div>
        </div>
        <div className="kpi">
          <div className="v">{h.outOfStock}</div>
          <div className="l">Out of stock (hidden)</div>
        </div>
        <div className="kpi">
          <div className="v">{h.products}</div>
          <div className="l">Products from real sources</div>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Possible duplicates</h2>
          <div className="pad">
            <p className="hint">Products with the same brand and nearly the same name but no shared GTIN or model number. Vault never merges these on its own; check them by hand.</p>
            {h.duplicateCandidates.length ? (
              <ul className="rows" style={{ marginTop: 10 }}>
                {h.duplicateCandidates.map((d) => (
                  <li key={d.ids.join()}>
                    <span>
                      {d.titles[0]}
                      <span className="hint"> ({d.brand ?? "no brand"})</span>
                    </span>
                    <span className="n">{d.ids.length}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="hint" style={{ marginTop: 10 }}>None found.</p>
            )}
          </div>
        </section>
        <section className="card">
          <h2>Data quality</h2>
          <div className="pad">
            <ul className="rows">
              <li>
                Products without a GTIN or model number <span className="n">{h.productsWithoutIdentifiers}</span>
              </li>
              <li>
                Links that aren&apos;t on the store&apos;s own website <span className="n">{h.invalidLinks.length}</span>
              </li>
            </ul>
            {h.invalidLinks.length > 0 && (
              <ul className="rows" style={{ marginTop: 6 }}>
                {h.invalidLinks.slice(0, 10).map((l) => (
                  <li key={l.id}>
                    <span className="hint">{l.store}</span>
                    <span className="hint" style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {l.url}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="hint" style={{ marginTop: 10 }}>Invalid links can never be clicked: the store redirect re-checks every link.</p>
          </div>
        </section>
      </div>
    </>
  );
}
