import type { Metadata } from "next";
import Link from "next/link";
import { ActButton, ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, STATUS_LABEL, when, type InboundEmail, type Stats } from "@/lib/admin";
import { checkInbox, markRead } from "../../actions";

export const metadata: Metadata = { title: "Inbox" };

const KIND: Record<InboundEmail["kind"], string> = { reply: "Reply", optout: "Opted out", bounce: "Bounced", other: "Other email" };

export default async function InboxPage({ searchParams }: PageProps<"/admin/inbox">) {
  const unreadOnly = (await searchParams).show !== "all";
  const [mail, stats] = await Promise.all([adminApi<InboundEmail[]>(`/inbox${unreadOnly ? "?unread=true" : ""}`), adminApi<Stats>("/stats")]);
  const o = stats.outreach;

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Inbox</h1>
          <p>
            Replies to your outreach mailbox{o.gmailSender ? ` (${o.gmailSender})` : ""}. Checked every few minutes
            {o.lastInboxCheck ? `, last at ${when(o.lastInboxCheck)}` : ""}.
          </p>
        </div>
        <div className="actions">
          <nav className="tabs" aria-label="Show">
            <Link href="/admin/inbox" aria-current={unreadOnly}>
              Unread
            </Link>
            <Link href="/admin/inbox?show=all" aria-current={!unreadOnly}>
              All
            </Link>
          </nav>
          <ActionForm action={checkInbox}>
            <Submit className="btn" pendingText="Checking…">
              Check now
            </Submit>
          </ActionForm>
        </div>
      </div>

      {!o.gmailConnected && <div className="banner warn">Gmail isn&apos;t connected yet, so replies can&apos;t be collected. See Settings.</div>}

      {mail.length === 0 ? (
        <div className="empty">
          <h3>{unreadOnly ? "You're all caught up" : "No emails yet"}</h3>
          <p>{unreadOnly ? "New replies show up here, and on your phone if Telegram is connected." : "Replies to your outreach will appear here."}</p>
        </div>
      ) : (
        mail.map((m) => (
          <article key={m.id} className={`mail${m.read ? "" : " unread"}`}>
            <div className="mail-head">
              <span className="who">{m.partner ? <Link href={`/admin/partners/${m.partner.id}`}>{m.partner.name}</Link> : (m.fromName ?? m.fromEmail)}</span>
              <span className="to">{m.fromEmail}</span>
              <span className={`pill ${m.kind}`}>{KIND[m.kind]}</span>
              {m.partner && <span className={`pill ${m.partner.status}`}>{STATUS_LABEL[m.partner.status]}</span>}
              <div className="right">
                <span className="hint">{when(m.receivedAt)}</span>
                {m.threadId && (
                  <a className="btn small-btn" href={`https://mail.google.com/mail/#all/${m.threadId}`} target="_blank" rel="noopener noreferrer">
                    Reply in Gmail
                  </a>
                )}
                <ActButton action={markRead.bind(null, m.id, !m.read)} className="btn small-btn">
                  {m.read ? "Mark unread" : "Mark read"}
                </ActButton>
              </div>
            </div>
            <div className="mail-body">
              <b style={{ display: "block", marginBottom: 6 }}>{m.subject}</b>
              <pre>{m.body || m.snippet}</pre>
            </div>
          </article>
        ))
      )}
    </>
  );
}
