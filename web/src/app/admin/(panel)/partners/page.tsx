import { Search } from "lucide-react";
import type { Metadata } from "next";
import Form from "next/form";
import Link from "next/link";
import { ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, STATUS_LABEL, when, type Partner, type PartnerStatus, type Stats } from "@/lib/admin";
import { addPartner, importPartners } from "../../actions";

export const metadata: Metadata = { title: "Partners" };

const ORDER: PartnerStatus[] = ["NEW", "CONTACTED", "REPLIED", "PARTNERED", "DECLINED", "OPTED_OUT", "BOUNCED"];

export default async function PartnersPage({ searchParams }: PageProps<"/admin/partners">) {
  const sp = await searchParams;
  const status = typeof sp.status === "string" && ORDER.includes(sp.status as PartnerStatus) ? (sp.status as PartnerStatus) : undefined;
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const qs = new URLSearchParams({ ...(status ? { status } : {}), ...(q ? { q } : {}) }).toString();
  const [partners, stats] = await Promise.all([adminApi<Partner[]>(`/partners${qs ? `?${qs}` : ""}`), adminApi<Stats>("/stats")]);
  const counts = stats.outreach.partners;
  const total = ORDER.reduce((n, s) => n + (counts[s] ?? 0), 0);
  const tab = (s?: PartnerStatus) => `/admin/partners${s ? `?status=${s}` : ""}`;

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Partners</h1>
          <p>Stores, brands and networks you want to work with. Only add contacts published on their own partner or affiliate pages.</p>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 16 }}>
        <details className="disclose-box">
          <summary>Add a partner</summary>
          <div className="pad">
            <ActionForm action={addPartner} resetOnSuccess>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="p-name">Company</label>
                  <input id="p-name" name="name" required maxLength={120} />
                </div>
                <div className="field">
                  <label htmlFor="p-network">Network</label>
                  <input id="p-network" name="network" placeholder="impact, cj, awin, direct…" maxLength={60} />
                </div>
                <div className="field">
                  <label htmlFor="p-contact">Contact name</label>
                  <input id="p-contact" name="contactName" maxLength={120} />
                </div>
                <div className="field">
                  <label htmlFor="p-email">Email</label>
                  <input id="p-email" name="email" type="email" maxLength={200} />
                </div>
                <div className="field">
                  <label htmlFor="p-web">Website</label>
                  <input id="p-web" name="website" placeholder="https://" maxLength={300} />
                </div>
                <div className="field">
                  <label htmlFor="p-cat">Category</label>
                  <input id="p-cat" name="category" placeholder="Beauty" maxLength={60} />
                </div>
                <div className="field full">
                  <label htmlFor="p-src">Where you found the contact</label>
                  <input id="p-src" name="sourceUrl" type="url" placeholder="https://brand.com/affiliates" maxLength={500} />
                </div>
              </div>
              <div className="form-actions">
                <Submit>Add partner</Submit>
              </div>
            </ActionForm>
          </div>
        </details>
        <details className="disclose-box">
          <summary>Import a list</summary>
          <div className="pad">
            <ActionForm action={importPartners} resetOnSuccess>
              <div className="field">
                <label htmlFor="rows">One partner per line</label>
                <textarea id="rows" name="rows" rows={6} placeholder={"name, email, website, network, contact name, category, source URL\nGlow Co, partners@glowco.com, https://glowco.com, impact, Sam Lee, Beauty, https://glowco.com/affiliates"} />
              </div>
              <p className="hint" style={{ marginTop: 8 }}>
                Paste from a spreadsheet or type comma-separated rows. Duplicate emails are skipped. Never import bought or scraped lists.
              </p>
              <div className="form-actions">
                <Submit pendingText="Importing…">Import</Submit>
              </div>
            </ActionForm>
          </div>
        </details>
      </div>

      <div className="toolbar">
        <nav className="tabs" aria-label="Filter by status">
          <Link href={tab()} aria-current={!status}>
            All<span className="c">{total}</span>
          </Link>
          {ORDER.map((s) => (
            <Link key={s} href={tab(s)} aria-current={status === s}>
              {STATUS_LABEL[s]}
              <span className="c">{counts[s] ?? 0}</span>
            </Link>
          ))}
        </nav>
        <Form action="/admin/partners" className="omni" style={{ padding: "2px 2px 2px 12px", maxWidth: 300 }}>
          <Search size={16} className="spark" aria-hidden />
          <label className="sr" htmlFor="pq">
            Search partners
          </label>
          <input id="pq" name="q" defaultValue={q} placeholder="Search name, email, network" style={{ fontSize: 14, padding: "8px 0" }} />
          {status && <input type="hidden" name="status" value={status} />}
        </Form>
      </div>

      {partners.length === 0 ? (
        <div className="empty">
          <h3>{q || status ? "No partners match" : "No partners yet"}</h3>
          <p>{q || status ? "Try another filter." : "Add the brands you want to work with, or import a list from a spreadsheet."}</p>
        </div>
      ) : (
        <section className="card table-scroll">
          <table className="table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Contact</th>
                <th>Network</th>
                <th>Status</th>
                <th>Last emailed</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p.id}>
                  <td>
                    <Link className="name" href={`/admin/partners/${p.id}`}>
                      {p.name}
                    </Link>
                    {p.category && <div className="sub">{p.category}</div>}
                  </td>
                  <td>
                    {p.email ?? <span className="sub">No email</span>}
                    {p.contactName && <div className="sub">{p.contactName}</div>}
                  </td>
                  <td>{p.network ?? <span className="sub">None</span>}</td>
                  <td>
                    <span className={`pill ${p.status}`}>{STATUS_LABEL[p.status]}</span>
                  </td>
                  <td className="sub">{p.lastContactedAt ? when(p.lastContactedAt) : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
