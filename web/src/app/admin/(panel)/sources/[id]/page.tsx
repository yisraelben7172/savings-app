import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActButton, ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, FIELD_LABEL, SOURCE_KIND_LABEL, SOURCE_STATUS_LABEL, when, type Retailer, type Source } from "@/lib/admin";
import { activateSource, importFeed, saveSourcePermissions, setSourceState } from "../../../catalog-actions";

export const metadata: Metadata = { title: "Data source" };

const RUN_LABEL = { RUNNING: "Running", SUCCEEDED: "Succeeded", PARTIAL: "Some rows rejected", FAILED: "Failed" };
const RUN_PILL = { RUNNING: "APPROVED", SUCCEEDED: "SENT", PARTIAL: "DRAFT", FAILED: "FAILED" };
const REQUIRED = new Set(["title", "price", "url"]);
const lines = (o?: Record<string, string>) => Object.entries(o ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");

export default async function SourcePage({ params }: PageProps<"/admin/sources/[id]">) {
  const { id } = await params;
  const [s, stores] = await Promise.all([adminApi<Source>(`/sources/${encodeURIComponent(id)}`), adminApi<Retailer[]>("/retailers")]);
  const fields = s.permittableFields ?? Object.keys(FIELD_LABEL);
  const latest = s.runs?.[0];

  return (
    <>
      <div className="ad-head">
        <div>
          <p>
            <Link href="/admin/sources">Data sources</Link>
          </p>
          <h1>{s.name}</h1>
          <p>
            {SOURCE_KIND_LABEL[s.kind]}, {SOURCE_STATUS_LABEL[s.status].toLowerCase()}
            {s.approvedAt ? `, approved ${when(s.approvedAt)} by ${s.approvedBy}` : ""}
          </p>
        </div>
        <div className="actions">
          {s.status === "ACTIVE" && (
            <ActButton action={setSourceState.bind(null, s.id, "pause")} className="btn">
              Pause imports
            </ActButton>
          )}
          {s.status !== "DISABLED" && (
            <ActButton action={setSourceState.bind(null, s.id, "disable")} className="btn" confirm="Disable this source? All its prices disappear from the site right away.">
              Disable
            </ActButton>
          )}
        </div>
      </div>

      {!s.importable && (
        <div className="banner warn">
          <AlertTriangle size={18} aria-hidden />
          <div>
            Vault doesn&apos;t have an importer for {SOURCE_KIND_LABEL[s.kind]} sources yet, so this stays awaiting approval. Record the permission details now; the
            importer gets built once access is confirmed.
          </div>
        </div>
      )}

      <div className="grid2">
        <div className="stack-16">
          {s.status === "ACTIVE" && s.importable && (
            <section className="card">
              <h2>Import a feed file</h2>
              <div className="pad">
                <ActionForm action={importFeed.bind(null, s.id)} resetOnSuccess>
                  <div className="field">
                    <label htmlFor="file">CSV file (up to 4 MB)</label>
                    <input id="file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv" required style={{ paddingTop: 10 }} />
                  </div>
                  <p className="hint" style={{ marginTop: 8 }}>
                    Needs columns for SKU, title, price, link and category. Optional: sale_price, list_price, brand, mpn, upc/gtin, availability, updated_at,
                    description, image, delivery, color, size.{s.fullSnapshot ? " Products missing from the file are marked out of stock." : ""}
                  </p>
                  <div className="form-actions">
                    <Submit pendingText="Importing…">Import</Submit>
                  </div>
                </ActionForm>
              </div>
            </section>
          )}

          <section className="card">
            <h2>Permission record</h2>
            <div className="pad">
              <ActionForm action={saveSourcePermissions.bind(null, s.id)}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="name">Name</label>
                    <input id="name" name="name" defaultValue={s.name} maxLength={120} />
                  </div>
                  <div className="field">
                    <label htmlFor="merchantId">Store</label>
                    <select id="merchantId" name="merchantId" defaultValue={s.merchantId ?? ""}>
                      <option value="">Not linked</option>
                      {stores.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name} ({r.domain})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field full">
                    <label htmlFor="accessMethod">How the data is provided</label>
                    <input id="accessMethod" name="accessMethod" defaultValue={s.accessMethod ?? ""} maxLength={300} placeholder="The brand emails us a CSV export every morning" />
                  </div>
                  <div className="field">
                    <label htmlFor="agreementUrl">Agreement link</label>
                    <input id="agreementUrl" name="agreementUrl" type="url" defaultValue={s.agreementUrl ?? ""} placeholder="https://" />
                  </div>
                  <div className="field">
                    <label htmlFor="attributionText">Required attribution</label>
                    <input id="attributionText" name="attributionText" defaultValue={s.attributionText ?? ""} maxLength={200} placeholder="Shown next to prices, if required" />
                  </div>
                  <div className="field full">
                    <label htmlFor="permissionNotes">What was agreed</label>
                    <textarea id="permissionNotes" name="permissionNotes" rows={3} defaultValue={s.permissionNotes ?? ""} maxLength={4000} placeholder="Who agreed, when, and any limits on how we can use the data" />
                  </div>
                  <fieldset className="field full" style={{ border: 0, padding: 0, margin: 0 }}>
                    <legend style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Fields the agreement lets us show</legend>
                    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                      {fields.map((f) => (
                        <label key={f} className="switch" style={{ fontSize: 14 }}>
                          <input type="checkbox" name="allowedFields" value={f} defaultChecked={s.allowedFields.includes(f)} />
                          {FIELD_LABEL[f] ?? f}
                          {REQUIRED.has(f) ? " (required)" : ""}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="field">
                    <label htmlFor="aiUseAllowed">May the AI assistant use this data?</label>
                    <select id="aiUseAllowed" name="aiUseAllowed" defaultValue={s.aiUseAllowed ? "yes" : "no"}>
                      <option value="no">No (default; it stays out of AI answers)</option>
                      <option value="yes">Yes, the agreement allows it</option>
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="priceFreshnessHours">Prices stay current for (hours)</label>
                    <input id="priceFreshnessHours" name="priceFreshnessHours" type="number" min={1} max={720} defaultValue={s.priceFreshnessHours} />
                    <span className="hint">After this, a price is hidden until the next import.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="retentionDays">Keep price history for (days)</label>
                    <input id="retentionDays" name="retentionDays" type="number" min={1} max={3650} defaultValue={s.retentionDays ?? ""} placeholder="No limit" />
                  </div>
                  <label className="switch" style={{ alignSelf: "end" }}>
                    <input type="checkbox" name="fullSnapshot" defaultChecked={s.fullSnapshot} />
                    Each file is the full catalog
                  </label>
                  <div className="field">
                    <label htmlFor="columns">Column names (if different)</label>
                    <textarea id="columns" name="columns" rows={3} defaultValue={lines(s.config?.columns)} placeholder={"title=Product Name\nsku=Item #"} />
                  </div>
                  <div className="field">
                    <label htmlFor="categoryMap">Category mapping</label>
                    <textarea id="categoryMap" name="categoryMap" rows={3} defaultValue={lines(s.config?.categoryMap)} placeholder={"Headphones=electronics\nSkincare=beauty"} />
                  </div>
                </div>
                <div className="form-actions">
                  <Submit>Save</Submit>
                </div>
              </ActionForm>
            </div>
          </section>
        </div>

        <div className="stack-16">
          {s.status !== "ACTIVE" && (
            <section className="card">
              <h2>Activate</h2>
              <div className="pad">
                <p className="hint">
                  Activate only after the store or network has agreed in writing. Vault checks the permission record is complete before turning the source on.
                </p>
                <ActionForm action={activateSource.bind(null, s.id)}>
                  <div className="field" style={{ marginTop: 12 }}>
                    <label htmlFor="approvedBy">Your name</label>
                    <input id="approvedBy" name="approvedBy" required maxLength={80} />
                  </div>
                  <div className="form-actions">
                    <Submit>Activate source</Submit>
                  </div>
                </ActionForm>
              </div>
            </section>
          )}
          <section className="card">
            <h2>Health</h2>
            <div className="pad">
              <ul className="checklist">
                <li>
                  {s.health === "HEALTHY" ? <CheckCircle2 size={18} className="yes" aria-hidden /> : <AlertTriangle size={18} className="no" aria-hidden />}
                  {s.health === "UNKNOWN" ? "No imports yet" : s.health === "HEALTHY" ? "Last import was clean" : (s.healthNote ?? "Problems in the last import")}
                </li>
              </ul>
              <p className="hint" style={{ marginTop: 10 }}>
                {s.lastRunAt ? `Last import ${when(s.lastRunAt)}.` : ""} Prices older than {s.priceFreshnessHours} hours are hidden automatically.
              </p>
            </div>
          </section>
          <section className="card">
            <h2>Import history</h2>
            <div className="pad">
              {!s.runs?.length ? (
                <p className="hint">No imports yet.</p>
              ) : (
                <ul className="timeline">
                  {s.runs.map((r) => (
                    <li key={r.id}>
                      <div className="meta">
                        <span className={`pill ${RUN_PILL[r.status]}`}>{RUN_LABEL[r.status]}</span>
                        <span>{when(r.startedAt)}</span>
                      </div>
                      <div className="bubble">
                        {r.rowsRead} rows: {r.created} new, {r.updated} changed, {r.unchanged} unchanged, {r.rejected} rejected
                        {r.markedOut ? `, ${r.markedOut} marked out of stock` : ""}.
                        {r === latest && r.errors && r.errors.length > 0 && (
                          <ul className="rows" style={{ marginTop: 8 }}>
                            {r.errors.slice(0, 15).map((e, i) => (
                              <li key={i} style={{ fontSize: 13.5 }}>
                                <span>{e.row ? `Line ${e.row}: ` : ""}{e.message}</span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
