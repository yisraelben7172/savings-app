import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, COMMISSION_LABEL, day, LINK_METHOD_LABEL, PROGRAM_STATUS_LABEL, usd, when, type LinkMethod, type Program, type ProgramStatus } from "@/lib/admin";
import { importCommissions, saveProgram, testLink } from "../../../affiliate-actions";

export const metadata: Metadata = { title: "Affiliate program" };

const lines = (o?: Record<string, string>) => Object.entries(o ?? {}).map(([k, v]) => `${k}=${v}`).join("\n");
const COMMISSION_PILL = { PENDING: "DRAFT", APPROVED: "APPROVED", PAID: "SENT", REVERSED: "FAILED" } as const;

export default async function ProgramPage({ params }: PageProps<"/admin/affiliate/[id]">) {
  const { id } = await params;
  const p = await adminApi<Program>(`/programs/${encodeURIComponent(id)}`);

  return (
    <>
      <div className="ad-head">
        <div>
          <p>
            <Link href="/admin/affiliate">Affiliate links</Link>
          </p>
          <h1>{p.name}</h1>
          <p>
            {p.merchant.name} ({p.merchant.domain}), {PROGRAM_STATUS_LABEL[p.status].toLowerCase()}
            {p.approvedAt ? `, approved ${when(p.approvedAt)}` : ""}
          </p>
        </div>
      </div>

      <div className="grid2">
        <div className="stack-16">
          <section className="card">
            <h2>Program settings</h2>
            <div className="pad">
              <ActionForm action={saveProgram.bind(null, p.id)}>
                <div className="form-grid">
                  <div className="field">
                    <label htmlFor="name">Name</label>
                    <input id="name" name="name" defaultValue={p.name} maxLength={100} />
                  </div>
                  <div className="field">
                    <label htmlFor="status">Status</label>
                    <select id="status" name="status" defaultValue={p.status}>
                      {(Object.keys(PROGRAM_STATUS_LABEL) as ProgramStatus[]).map((s) => (
                        <option key={s} value={s}>
                          {PROGRAM_STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                    <span className="hint">Only &ldquo;Approved&rdquo; programs make tracked links. Set it after the network or store has approved you.</span>
                  </div>
                  <div className="field full">
                    <label htmlFor="linkMethod">How tracked links are made</label>
                    <select id="linkMethod" name="linkMethod" defaultValue={p.linkMethod}>
                      {(Object.keys(LINK_METHOD_LABEL) as LinkMethod[]).map((m) => (
                        <option key={m} value={m}>
                          {LINK_METHOD_LABEL[m]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field">
                    <label htmlFor="accountTag">Amazon tracking ID</label>
                    <input id="accountTag" name="accountTag" defaultValue={p.accountTag ?? ""} maxLength={80} placeholder="yourname-20" />
                    <span className="hint">Only for the Amazon method. Shown in your Associates account.</span>
                  </div>
                  <div className="field">
                    <label htmlFor="allowedTrackingHosts">Allowed tracking hosts</label>
                    <input id="allowedTrackingHosts" name="allowedTrackingHosts" defaultValue={p.allowedTrackingHosts.join(", ")} placeholder="goto.network.com" />
                    <span className="hint">The website(s) the network&apos;s links go through. Links to anywhere else are refused.</span>
                  </div>
                  <div className="field full">
                    <label htmlFor="linkTemplate">Network link template</label>
                    <textarea id="linkTemplate" name="linkTemplate" rows={3} defaultValue={p.linkTemplate ?? ""} placeholder="https://goto.network.com/c/12345?u={urlEncoded}&subId1={clickId}" />
                    <span className="hint">
                      Copy the exact deep-link format from the network&apos;s dashboard. Put {"{url}"} or {"{urlEncoded}"} where the product page goes and {"{clickId}"} where the network
                      expects your sub-ID. Vault never guesses a network&apos;s format.
                    </span>
                  </div>
                  <div className="field full">
                    <label htmlFor="disclosureText">Required disclosure</label>
                    <input id="disclosureText" name="disclosureText" defaultValue={p.disclosureText ?? ""} maxLength={500} placeholder="Exact wording the program requires near its links" />
                  </div>
                  <div className="field">
                    <label htmlFor="applicationUrl">Application link</label>
                    <input id="applicationUrl" name="applicationUrl" type="url" defaultValue={p.applicationUrl ?? ""} placeholder="https://" />
                  </div>
                  <div className="field">
                    <label htmlFor="commissionNotes">Commission terms (verified only)</label>
                    <input id="commissionNotes" name="commissionNotes" defaultValue={p.commissionNotes ?? ""} maxLength={4000} />
                  </div>
                  <div className="field full">
                    <label htmlFor="notes">Notes</label>
                    <textarea id="notes" name="notes" rows={3} defaultValue={p.notes ?? ""} maxLength={4000} />
                  </div>
                  <div className="field">
                    <label htmlFor="columns">Report column names (if different)</label>
                    <textarea id="columns" name="columns" rows={3} defaultValue={lines(p.reportConfig?.columns)} placeholder={"id=Order #\ncommission=Earnings"} />
                  </div>
                  <div className="field">
                    <label htmlFor="statusMap">Report status mapping</label>
                    <textarea id="statusMap" name="statusMap" rows={3} defaultValue={lines(p.reportConfig?.statusMap)} placeholder={"locked=approved\nin review=pending"} />
                    <span className="hint">Left side: the word in the report. Right side: pending, approved, paid or reversed.</span>
                  </div>
                </div>
                <div className="form-actions">
                  <Submit>Save</Submit>
                </div>
              </ActionForm>
            </div>
          </section>

          <section className="card">
            <h2>Latest commissions</h2>
            <div className="table-scroll">
              {p.commissions?.length ? (
                <table className="table" style={{ marginTop: 8 }}>
                  <thead>
                    <tr>
                      <th>Transaction</th>
                      <th>Status</th>
                      <th>Sale</th>
                      <th>Commission</th>
                      <th>From a click</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.commissions.map((c) => (
                      <tr key={c.id}>
                        <td>
                          {c.externalId}
                          <div className="sub">{day(c.occurredAt)}</div>
                        </td>
                        <td>
                          <span className={`pill ${COMMISSION_PILL[c.status]}`}>{COMMISSION_LABEL[c.status]}</span>
                        </td>
                        <td>{c.saleAmount ? usd(Number(c.saleAmount)) : <span className="sub">n/a</span>}</td>
                        <td>{usd(Number(c.amount))}</td>
                        <td>{c.clickId ? "Matched" : <span className="sub">Not matched</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <div className="pad">
                  <p className="hint">No commissions yet. Import a report from the network after shoppers buy.</p>
                </div>
              )}
            </div>
          </section>
        </div>

        <div className="stack-16">
          <section className="card">
            <h2>Check the link</h2>
            <div className="pad">
              <p className="hint">Paste a product page on {p.merchant.domain} to see exactly where a shopper would be sent. Compare it with the network&apos;s own documentation.</p>
              <ActionForm action={testLink.bind(null, p.id)}>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="url">Product page</label>
                  <input id="url" name="url" type="url" required placeholder={`https://www.${p.merchant.domain}/product/123`} />
                </div>
                <div className="form-actions">
                  <Submit className="btn" pendingText="Building…">
                    Build link
                  </Submit>
                </div>
              </ActionForm>
            </div>
          </section>

          <section className="card">
            <h2>Import a commission report</h2>
            <div className="pad">
              <p className="hint">
                Download the report from the network as CSV and upload it here. Needs a transaction ID, commission, date and (to match clicks) the sub-ID column.
                Uploading overlapping reports is safe; a status never moves backwards.
              </p>
              <ActionForm action={importCommissions.bind(null, p.id)} resetOnSuccess>
                <div className="field" style={{ marginTop: 12 }}>
                  <label htmlFor="file">CSV report (up to 4 MB)</label>
                  <input id="file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv" required style={{ paddingTop: 10 }} />
                </div>
                <div className="form-actions">
                  <Submit pendingText="Importing…">Import report</Submit>
                </div>
              </ActionForm>
            </div>
          </section>

          <section className="card">
            <h2>Import history</h2>
            <div className="pad">
              {!p.imports?.length ? (
                <p className="hint">No reports imported yet.</p>
              ) : (
                <ul className="timeline">
                  {p.imports.map((r, i) => (
                    <li key={r.id}>
                      <div className="meta">
                        <span>{when(r.createdAt)}</span>
                      </div>
                      <div className="bubble">
                        {r.rowsRead} rows: {r.created} new, {r.updated} updated, {r.unchanged} unchanged, {r.rejected} rejected, {r.matched} matched to clicks.
                        {i === 0 && r.errors && r.errors.length > 0 && (
                          <ul className="rows" style={{ marginTop: 8 }}>
                            {r.errors.slice(0, 15).map((e, j) => (
                              <li key={j} style={{ fontSize: 13.5 }}>
                                <span>
                                  Line {e.row}: {e.message}
                                </span>
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
