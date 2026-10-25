import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, when, type Retailer } from "@/lib/admin";
import { createRetailer, updateRetailer } from "../../catalog-actions";

export const metadata: Metadata = { title: "Stores" };

const CATEGORIES = ["electronics", "clothing", "beauty", "hotels", "car-rentals", "concerts", "home", "flights"];
const INTEGRATION = { NONE: "No data connection", FEED: "Feed file", RETAILER_API: "Store API", NETWORK_API: "Affiliate network API", MANUAL: "Manual" };
const HEALTH = { UNKNOWN: "Not synced yet", HEALTHY: "Healthy", DEGRADED: "Some errors", FAILING: "Failing" };
const HEALTH_PILL = { UNKNOWN: "NEW", HEALTHY: "SENT", DEGRADED: "DRAFT", FAILING: "FAILED" };

export default async function StoresPage() {
  const stores = await adminApi<Retailer[]>("/retailers");
  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Stores</h1>
          <p>Every store Vault can show. A store&apos;s prices appear only when it&apos;s approved, active and has a trust score of 70 or more.</p>
        </div>
      </div>

      <details className="disclose-box" style={{ marginBottom: 16 }}>
        <summary>Add a store</summary>
        <div className="pad">
          <ActionForm action={createRetailer} resetOnSuccess>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="r-name">Name</label>
                <input id="r-name" name="name" required maxLength={80} />
              </div>
              <div className="field">
                <label htmlFor="r-slug">Short ID</label>
                <input id="r-slug" name="slug" required pattern="[a-z0-9-]{2,40}" placeholder="best-buy" />
              </div>
              <div className="field">
                <label htmlFor="r-domain">Website domain</label>
                <input id="r-domain" name="domain" required placeholder="bestbuy.com" />
                <span className="hint">Product links must be on this domain, or they&apos;re rejected.</span>
              </div>
              <div className="field">
                <label htmlFor="r-network">Affiliate network</label>
                <input id="r-network" name="network" placeholder="impact, cj, awin, amazon, direct" maxLength={40} />
              </div>
            </div>
            <div className="form-actions">
              <Submit>Add store</Submit>
            </div>
          </ActionForm>
        </div>
      </details>

      <div className="stack-16">
        {stores.map((s) => (
          <details key={s.id} className="disclose-box">
            <summary>
              <span style={{ flex: 1 }}>
                {s.name} <span className="hint">({s.domain})</span>
              </span>
              <span className="hint">
                {s.shownOffers} shown of {s.offerCount} prices
              </span>
              <span className={`pill ${s.approved && s.active ? "SENT" : "SKIPPED"}`}>{s.approved && s.active ? "Shown" : s.approved ? "Inactive" : "Not approved"}</span>
              <span className={`pill ${HEALTH_PILL[s.health]}`}>{HEALTH[s.health]}</span>
            </summary>
            <div className="pad">
              <ActionForm action={updateRetailer.bind(null, s.id)}>
                <div className="form-grid">
                  <label className="switch">
                    <input type="checkbox" name="approved" defaultChecked={s.approved} />
                    Approved (passed our checks)
                  </label>
                  <label className="switch">
                    <input type="checkbox" name="active" defaultChecked={s.active} />
                    Active (turn off to hide all its prices now)
                  </label>
                  <div className="field">
                    <label htmlFor={`t-${s.id}`}>Trust score (0 to 100)</label>
                    <input id={`t-${s.id}`} name="trustScore" type="number" min={0} max={100} defaultValue={s.trustScore} />
                  </div>
                  <div className="field">
                    <label htmlFor={`i-${s.id}`}>Data connection</label>
                    <select id={`i-${s.id}`} name="integrationType" defaultValue={s.integrationType}>
                      {Object.entries(INTEGRATION).map(([v, l]) => (
                        <option key={v} value={v}>
                          {l}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <span style={{ fontSize: 14, fontWeight: 600 }}>Affiliate links</span>
                    <Link href="/admin/affiliate" className="btn small-btn" style={{ width: "max-content" }}>
                      Manage this store&apos;s programs
                    </Link>
                  </div>
                  <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Categories it sells</legend>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {CATEGORIES.map((c) => (
                        <label key={c} className="switch" style={{ fontSize: 14 }}>
                          <input type="checkbox" name="supportedCategories" value={c} defaultChecked={s.supportedCategories.includes(c)} />
                          {c}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field full">
                    <label htmlFor={`c-${s.id}`}>Compliance notes</label>
                    <textarea id={`c-${s.id}`} name="complianceNotes" rows={3} defaultValue={s.complianceNotes ?? ""} maxLength={4000} placeholder="Disclosure wording, link rules, anything the agreement requires" />
                  </div>
                </div>
                <div className="form-actions">
                  <Submit>Save</Submit>
                  <span className="hint">
                    {s.sourceCount} data source{s.sourceCount === 1 ? "" : "s"}. {s.lastSyncAt ? `Last synced ${when(s.lastSyncAt)}.` : "Never synced."} {s.healthNote ?? ""}
                  </span>
                </div>
              </ActionForm>
            </div>
          </details>
        ))}
      </div>
    </>
  );
}
