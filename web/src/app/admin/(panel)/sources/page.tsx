import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, SOURCE_KIND_LABEL, SOURCE_STATUS_LABEL, when, type Retailer, type Source } from "@/lib/admin";
import { createSource } from "../../catalog-actions";

export const metadata: Metadata = { title: "Data sources" };

const STATUS_PILL = { AWAITING_APPROVAL: "DRAFT", ACTIVE: "SENT", PAUSED: "APPROVED", DISABLED: "SKIPPED" } as const;

export default async function SourcesPage() {
  const [sources, stores] = await Promise.all([adminApi<Source[]>("/sources"), adminApi<Retailer[]>("/retailers")]);
  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Data sources</h1>
          <p>
            Where product and price data comes from. A source collects nothing until you record what its agreement allows and activate it. Vault can
            import CSV feeds today; other kinds can be recorded while you wait for approval.
          </p>
        </div>
      </div>

      <details className="disclose-box" style={{ marginBottom: 16 }}>
        <summary>Add a source</summary>
        <div className="pad">
          <ActionForm action={createSource}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="s-name">Name</label>
                <input id="s-name" name="name" required maxLength={120} placeholder="Glow Co daily product feed" />
              </div>
              <div className="field">
                <label htmlFor="s-kind">Kind</label>
                <select id="s-kind" name="kind" defaultValue="CSV_FEED">
                  {(["CSV_FEED", "XML_FEED", "RETAILER_API", "NETWORK_API", "MANUAL"] as const).map((k) => (
                    <option key={k} value={k}>
                      {SOURCE_KIND_LABEL[k]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field full">
                <label htmlFor="s-store">Store</label>
                <select id="s-store" name="merchantId" defaultValue="">
                  <option value="">Not linked yet</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.domain})
                    </option>
                  ))}
                </select>
                <span className="hint">A CSV feed belongs to one store. Every product link in it must be on that store&apos;s domain.</span>
              </div>
            </div>
            <div className="form-actions">
              <Submit>Add source</Submit>
            </div>
          </ActionForm>
        </div>
      </details>

      <section className="card table-scroll">
        <table className="table">
          <thead>
            <tr>
              <th>Source</th>
              <th>Store</th>
              <th>Status</th>
              <th>Prices</th>
              <th>Last import</th>
            </tr>
          </thead>
          <tbody>
            {sources.map((s) => (
              <tr key={s.id}>
                <td>
                  {s.kind === "DEMO" ? <span className="name">{s.name}</span> : <Link className="name" href={`/admin/sources/${s.id}`}>{s.name}</Link>}
                  <div className="sub">
                    {SOURCE_KIND_LABEL[s.kind]}
                    {!s.importable && s.kind !== "DEMO" ? ", no importer yet" : ""}
                  </div>
                </td>
                <td>{s.merchant?.name ?? <span className="sub">{s.kind === "DEMO" ? "Several" : "Not linked"}</span>}</td>
                <td>
                  <span className={`pill ${STATUS_PILL[s.status]}`}>{SOURCE_STATUS_LABEL[s.status]}</span>
                </td>
                <td>
                  {s.offerCount ?? 0}
                  {s.staleOffers ? <div className="sub">{s.staleOffers} stale</div> : null}
                </td>
                <td className="sub">{s.lastRunAt ? when(s.lastRunAt) : "Never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  );
}
