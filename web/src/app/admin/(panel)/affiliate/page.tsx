import type { Metadata } from "next";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, COMMISSION_LABEL, LINK_METHOD_LABEL, PROGRAM_STATUS_LABEL, usd, type AffiliateSummary, type CommissionStatus, type Retailer } from "@/lib/admin";
import { createProgram } from "../../affiliate-actions";

export const metadata: Metadata = { title: "Affiliate links" };

const STATUS_PILL = { NOT_APPLIED: "NEW", APPLIED: "DRAFT", APPROVED: "SENT", REJECTED: "FAILED", PAUSED: "SKIPPED" } as const;
const ORDER: CommissionStatus[] = ["PENDING", "APPROVED", "PAID", "REVERSED"];

export default async function AffiliatePage() {
  const [s, stores] = await Promise.all([adminApi<AffiliateSummary>("/affiliate/summary"), adminApi<Retailer[]>("/retailers")]);
  const totals = ORDER.map((st) => ({
    st,
    count: s.programs.reduce((n, p) => n + (p.commissions[st]?.count ?? 0), 0),
    amount: s.programs.reduce((n, p) => n + (p.commissions[st]?.amount ?? 0), 0),
  }));
  const tracked = s.programs.reduce((n, p) => n + p.clicks30.tracked, 0);
  const fallback = s.programs.reduce((n, p) => n + p.clicks30.fallback, 0);
  const plain = s.programs.reduce((n, p) => n + p.clicks30.plain, 0) + s.plainClicks;

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Affiliate links</h1>
          <p>
            One record per store and network. A store only gets tracked links once its program is approved and a verified link method is saved; until then
            shoppers get plain links and no commission is earned.
          </p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="v">{tracked}</div>
          <div className="l">Tracked clicks, last 30 days</div>
        </div>
        <div className="kpi">
          <div className="v">{plain}</div>
          <div className="l">Plain clicks (no program), last 30 days</div>
        </div>
        <div className={`kpi${fallback ? " attn" : ""}`}>
          <div className="v">{fallback}</div>
          <div className="l">Tracked link failed, sent plain</div>
        </div>
        <div className="kpi">
          <div className="v">{s.programs.filter((p) => p.status === "APPROVED").length}</div>
          <div className="l">Approved programs</div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Commissions reported by networks</h2>
        <div className="pad">
          <div className="kpis" style={{ marginBottom: 8 }}>
            {totals.map((t) => (
              <div key={t.st} className="kpi">
                <div className="v">{usd(t.amount)}</div>
                <div className="l">
                  {COMMISSION_LABEL[t.st]} ({t.count})
                </div>
              </div>
            ))}
          </div>
          <p className="hint">
            Clicks are visits, not sales. These amounts come only from commission reports you import; Vault never estimates earnings. Pending can still be
            reversed, approved is confirmed but not yet paid out, and paid has reached you.
          </p>
        </div>
      </section>

      <details className="disclose-box" style={{ marginBottom: 16 }}>
        <summary>Add a program</summary>
        <div className="pad">
          <ActionForm action={createProgram}>
            <div className="form-grid">
              <div className="field">
                <label htmlFor="pm">Store</label>
                <select id="pm" name="merchantId" required defaultValue="">
                  <option value="" disabled>
                    Choose a store
                  </option>
                  {stores.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.domain})
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="pn">Network</label>
                <input id="pn" name="network" required pattern="[a-z0-9-]{2,30}" placeholder="amazon, impact, cj, awin, ebay, direct" />
              </div>
              <div className="field full">
                <label htmlFor="pname">Name</label>
                <input id="pname" name="name" required maxLength={100} placeholder="Best Buy via Impact" />
              </div>
            </div>
            <div className="form-actions">
              <Submit>Add program</Submit>
            </div>
          </ActionForm>
        </div>
      </details>

      {s.programs.length === 0 ? (
        <div className="empty">
          <h3>No programs yet</h3>
          <p>Add one when you apply to a network or store. Nothing is tracked or earned until a program is approved.</p>
        </div>
      ) : (
        <section className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Program</th>
                <th>Status</th>
                <th>Link method</th>
                <th>Clicks (30 days)</th>
                <th>Commissions</th>
              </tr>
            </thead>
            <tbody>
              {s.programs.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="name" href={`/admin/affiliate/${p.id}`}>
                      {p.name}
                    </Link>
                    <div className="sub">
                      {p.merchant.name}, {p.network}
                    </div>
                  </td>
                  <td>
                    <span className={`pill ${STATUS_PILL[p.status]}`}>{PROGRAM_STATUS_LABEL[p.status]}</span>
                  </td>
                  <td>{LINK_METHOD_LABEL[p.linkMethod]}</td>
                  <td>
                    {p.clicks30.tracked} tracked
                    {p.clicks30.fallback ? <div className="sub">{p.clicks30.fallback} failed to track</div> : null}
                  </td>
                  <td>
                    {ORDER.filter((st) => p.commissions[st]).length ? (
                      ORDER.filter((st) => p.commissions[st]).map((st) => (
                        <div key={st} className="sub">
                          {COMMISSION_LABEL[st]}: {usd(p.commissions[st]!.amount)}
                        </div>
                      ))
                    ) : (
                      <span className="sub">None reported</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
