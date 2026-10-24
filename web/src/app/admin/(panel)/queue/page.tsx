import { AlertTriangle, CheckCircle2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ActButton, ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, STEP_LABEL, when, type OutreachEmail, type Stats } from "@/lib/admin";
import { approveAll, prepareQueue, saveEmail, setEmail } from "../../actions";

export const metadata: Metadata = { title: "Approval queue" };

export default async function QueuePage() {
  const [{ pending, recent }, stats] = await Promise.all([
    adminApi<{ pending: OutreachEmail[]; recent: OutreachEmail[] }>("/queue"),
    adminApi<Stats>("/stats"),
  ]);
  const drafts = pending.filter((e) => e.status === "DRAFT");
  const approved = pending.filter((e) => e.status === "APPROVED");
  const status = stats.outreach.sendingStatus;

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Approval queue</h1>
          <p>Nothing is sent until you approve it. Approved emails go out one at a time during business hours.</p>
        </div>
        <div className="actions">
          <ActionForm action={prepareQueue}>
            <Submit className="btn" pendingText="Preparing…">
              Prepare today&apos;s emails
            </Submit>
          </ActionForm>
          {drafts.length > 1 && (
            <ActButton action={approveAll} className="btn primary" confirm={`Approve all ${drafts.length} drafts? They'll be sent during business hours.`}>
              Approve all {drafts.length}
            </ActButton>
          )}
        </div>
      </div>

      <div className={`banner ${status === "Sending" ? "good" : "warn"}`}>
        {status === "Sending" ? <CheckCircle2 size={18} aria-hidden /> : <AlertTriangle size={18} aria-hidden />}
        <div className="grow">
          {status === "Sending" ? "Sending is on." : `Not sending right now: ${status}.`} {stats.outreach.sent24h} sent in the last 24 hours.
        </div>
        <Link href="/admin/settings" className="btn small-btn">
          Settings
        </Link>
      </div>

      {drafts.length === 0 && approved.length === 0 && (
        <div className="empty">
          <h3>Nothing waiting for approval</h3>
          <p>Add partners with an email address, then prepare today&apos;s emails. Follow-ups are drafted automatically when they&apos;re due.</p>
          <Link href="/admin/partners" className="btn primary">
            Add partners
          </Link>
        </div>
      )}

      {drafts.length > 0 && <h2 className="h2" style={{ fontSize: 18, margin: "8px 0 12px" }}>Waiting for your approval ({drafts.length})</h2>}
      {drafts.map((e) => (
        <article key={e.id} className="mail">
          <div className="mail-head">
            <span className="who">
              <Link href={`/admin/partners/${e.partnerId}`}>{e.partner?.name}</Link>
            </span>
            <span className="to">to {e.toEmail}</span>
            <span className="pill DRAFT">{STEP_LABEL[e.step] ?? "Email"}</span>
            <div className="right">
              <ActButton action={setEmail.bind(null, e.id, "skip")} className="btn small-btn">
                Skip
              </ActButton>
              <ActButton action={setEmail.bind(null, e.id, "approve")} className="btn primary small-btn">
                Approve
              </ActButton>
            </div>
          </div>
          <ActionForm action={saveEmail.bind(null, e.id)} className="mail-body">
            <div className="field">
              <label htmlFor={`s-${e.id}`}>Subject</label>
              <input id={`s-${e.id}`} name="subject" defaultValue={e.subject} maxLength={200} required />
            </div>
            <div className="field" style={{ marginTop: 12 }}>
              <label htmlFor={`b-${e.id}`}>Message</label>
              <textarea id={`b-${e.id}`} name="body" defaultValue={e.body} rows={9} maxLength={8000} required />
            </div>
            <div className="form-actions">
              <Submit className="btn small-btn">Save changes</Submit>
              <span className="hint">Your signature, postal address and unsubscribe link are added automatically.</span>
            </div>
          </ActionForm>
        </article>
      ))}

      {approved.length > 0 && (
        <>
          <h2 className="h2" style={{ fontSize: 18, margin: "28px 0 12px" }}>Approved, sending soon ({approved.length})</h2>
          {approved.map((e) => (
            <article key={e.id} className="mail">
              <div className="mail-head">
                <span className="who">{e.partner?.name}</span>
                <span className="to">{e.subject}</span>
                <span className="pill APPROVED">{STEP_LABEL[e.step]}</span>
                <div className="right">
                  <ActButton action={setEmail.bind(null, e.id, "unapprove")} className="btn small-btn">
                    Move back to drafts
                  </ActButton>
                </div>
              </div>
            </article>
          ))}
        </>
      )}

      {recent.length > 0 && (
        <section className="card" style={{ marginTop: 28 }}>
          <h2>Recently sent</h2>
          <div className="table-scroll">
            <table className="table" style={{ marginTop: 8 }}>
              <thead>
                <tr>
                  <th>Partner</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link className="name" href={`/admin/partners/${e.partnerId}`}>
                        {e.partner?.name}
                      </Link>
                    </td>
                    <td>
                      {e.subject}
                      <div className="sub">{STEP_LABEL[e.step]}</div>
                    </td>
                    <td>
                      <span className={`pill ${e.status}`} title={e.error ?? undefined}>
                        {e.status === "SENT" ? "Sent" : "Failed"}
                      </span>
                    </td>
                    <td className="sub">{when(e.sentAt ?? e.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
