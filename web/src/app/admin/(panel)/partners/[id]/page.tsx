import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActButton, ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, STATUS_LABEL, STEP_LABEL, when, type InboundEmail, type OutreachEmail, type Partner, type PartnerStatus } from "@/lib/admin";
import { deletePartner, draftFirstEmail, updatePartner } from "../../../actions";

export const metadata: Metadata = { title: "Partner" };

type Detail = Partner & { emails: OutreachEmail[]; inbound: InboundEmail[] };

export default async function PartnerPage({ params }: PageProps<"/admin/partners/[id]">) {
  const { id } = await params;
  let p: Detail;
  try {
    p = await adminApi<Detail>(`/partners/${encodeURIComponent(id)}`);
  } catch (e) {
    if ((e as Error).message.includes("not found") || (e as Error).message === "404") notFound();
    throw e;
  }
  const timeline = [
    ...p.emails.filter((e) => e.status !== "SKIPPED").map((e) => ({ kind: "out" as const, at: e.sentAt ?? e.createdAt, e })),
    ...p.inbound.map((m) => ({ kind: "in" as const, at: m.receivedAt, m })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const canDraft = p.status === "NEW" && p.email && !p.emails.some((e) => ["DRAFT", "APPROVED", "SENT"].includes(e.status));

  return (
    <>
      <div className="ad-head">
        <div>
          <p>
            <Link href="/admin/partners">Partners</Link>
          </p>
          <h1>{p.name}</h1>
          <p>
            <span className={`pill ${p.status}`}>{STATUS_LABEL[p.status]}</span>
            {p.lastContactedAt && <span className="hint" style={{ marginLeft: 10 }}>Last emailed {when(p.lastContactedAt)}</span>}
          </p>
        </div>
        <div className="actions">
          {canDraft && (
            <ActButton action={draftFirstEmail.bind(null, p.id)} className="btn primary">
              Draft first email
            </ActButton>
          )}
          <ActButton action={deletePartner.bind(null, p.id)} className="btn" confirm={`Delete ${p.name} and its email history? This can't be undone.`}>
            Delete
          </ActButton>
        </div>
      </div>

      <div className="grid-2">
        <section className="card">
          <h2>Details</h2>
          <div className="pad">
            <ActionForm action={updatePartner.bind(null, p.id)}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="name">Company</label>
                  <input id="name" name="name" defaultValue={p.name} required maxLength={120} />
                </div>
                <div className="field">
                  <label htmlFor="status">Status</label>
                  <select id="status" name="status" defaultValue={p.status}>
                    {(Object.keys(STATUS_LABEL) as PartnerStatus[]).map((s) => (
                      <option key={s} value={s}>
                        {STATUS_LABEL[s]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="contactName">Contact name</label>
                  <input id="contactName" name="contactName" defaultValue={p.contactName ?? ""} maxLength={120} />
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input id="email" name="email" type="email" defaultValue={p.email ?? ""} maxLength={200} />
                </div>
                <div className="field">
                  <label htmlFor="network">Network</label>
                  <input id="network" name="network" defaultValue={p.network ?? ""} maxLength={60} />
                </div>
                <div className="field">
                  <label htmlFor="category">Category</label>
                  <input id="category" name="category" defaultValue={p.category ?? ""} maxLength={60} />
                </div>
                <div className="field full">
                  <label htmlFor="website">Website</label>
                  <input id="website" name="website" defaultValue={p.website ?? ""} maxLength={300} />
                </div>
                <div className="field full">
                  <label htmlFor="sourceUrl">Where the contact was found</label>
                  <input id="sourceUrl" name="sourceUrl" defaultValue={p.sourceUrl ?? ""} maxLength={500} />
                </div>
                <div className="field full">
                  <label htmlFor="notes">Notes</label>
                  <textarea id="notes" name="notes" rows={4} defaultValue={p.notes ?? ""} maxLength={4000} />
                </div>
              </div>
              <div className="form-actions">
                <Submit>Save</Submit>
                <span className="hint">Setting a status like Replied or Opted out cancels any unsent follow-ups.</span>
              </div>
            </ActionForm>
          </div>
        </section>

        <section className="card">
          <h2>Conversation</h2>
          <div className="pad">
            {timeline.length === 0 ? (
              <p className="hint">No emails yet.</p>
            ) : (
              <ul className="timeline">
                {timeline.map((t) =>
                  t.kind === "out" ? (
                    <li key={t.e.id}>
                      <div className="meta">
                        <span>You</span>
                        <span className={`pill ${t.e.status}`}>{t.e.status === "SENT" ? STEP_LABEL[t.e.step] : t.e.status.toLowerCase()}</span>
                        <span>{when(t.at)}</span>
                      </div>
                      <div className="bubble">
                        <b>{t.e.subject}</b>
                        <pre>{t.e.body}</pre>
                        {t.e.error && <p className="ad-msg err">{t.e.error}</p>}
                      </div>
                    </li>
                  ) : (
                    <li key={t.m.id} className="in">
                      <div className="meta">
                        <span>{t.m.fromName ?? t.m.fromEmail}</span>
                        <span className={`pill ${t.m.kind}`}>{t.m.kind}</span>
                        <span>{when(t.at)}</span>
                      </div>
                      <div className="bubble">
                        <b>{t.m.subject}</b>
                        <pre>{t.m.body}</pre>
                      </div>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
