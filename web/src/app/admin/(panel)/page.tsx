import { AlertTriangle, CheckCircle2, Circle } from "lucide-react";
import Link from "next/link";
import { adminApi, STATUS_LABEL, when, type PartnerStatus, type Stats } from "@/lib/admin";

export default async function Overview() {
  let s: Stats;
  try {
    s = await adminApi<Stats>("/stats");
  } catch (e) {
    return (
      <div className="banner warn">
        <AlertTriangle size={18} aria-hidden />
        <div>
          Couldn&apos;t reach the API ({(e as Error).message}). Check that it&apos;s running and that ADMIN_API_KEY matches on both sides.
        </div>
      </div>
    );
  }
  const o = s.outreach;
  const max = Math.max(1, ...s.clicks.days.map((d) => d.clicks));
  const pipeline: PartnerStatus[] = ["NEW", "CONTACTED", "REPLIED", "PARTNERED", "DECLINED", "OPTED_OUT", "BOUNCED"];
  const setup = [
    { done: o.gmailConnected, label: o.gmailConnected ? `Gmail connected (${o.gmailSender})` : "Connect the outreach Gmail mailbox" },
    { done: o.telegramConnected, label: o.telegramConnected ? "Telegram alerts on" : "Connect Telegram for phone alerts" },
    { done: !o.sendingStatus.includes("postal address"), label: "Postal address in the email footer" },
  ];

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Overview</h1>
          <p>Clicks to stores and partner outreach at a glance.</p>
        </div>
      </div>

      <div className="kpis">
        <div className="kpi">
          <div className="v">{s.clicks.today.toLocaleString("en-US")}</div>
          <div className="l">Store clicks, last 24 hours</div>
        </div>
        <div className="kpi">
          <div className="v">{s.clicks.month.toLocaleString("en-US")}</div>
          <div className="l">Store clicks, last 30 days</div>
        </div>
        <Link href="/admin/queue" className={`kpi${o.drafts ? " attn" : ""}`}>
          <div className="v">{o.drafts}</div>
          <div className="l">Emails waiting for approval</div>
        </Link>
        <Link href="/admin/inbox" className={`kpi${o.unread ? " attn" : ""}`}>
          <div className="v">{o.unread}</div>
          <div className="l">Unread replies</div>
        </Link>
      </div>

      <div className="grid2">
        <div className="stack-16">
          <section className="card">
            <h2>Store clicks, last 14 days</h2>
            <div className="pad">
              <div className="bars" role="img" aria-label={`${s.clicks.week} clicks in the last 7 days`}>
                {s.clicks.days.map((d, i) => (
                  <span key={d.day} className={i === s.clicks.days.length - 1 ? "today" : undefined} style={{ height: `${(d.clicks / max) * 100}%` }} title={`${d.day}: ${d.clicks}`} />
                ))}
              </div>
              <div className="bars-axis">
                <span>{s.clicks.days[0]?.day.slice(5)}</span>
                <span>Today</span>
              </div>
              <p className="hint" style={{ marginTop: 12 }}>
                Clicks are visits sent to stores, not sales. Commissions show up in each affiliate network&apos;s reports.
              </p>
            </div>
          </section>
          <section className="card">
            <h2>Most-clicked deals, last 30 days</h2>
            <div className="pad">
              {s.clicks.top.length ? (
                <ul className="rows">
                  {s.clicks.top.map((t) => (
                    <li key={t.slug}>
                      <Link href={`/deals/${t.slug}`} target="_blank">
                        {t.title}
                      </Link>
                      <span className="n">{t.n}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="hint">No clicks yet. They&apos;ll appear here once shoppers start tapping &ldquo;Go to store&rdquo;.</p>
              )}
            </div>
          </section>
        </div>

        <div className="stack-16">
          <section className="card">
            <h2>Outreach</h2>
            <div className="pad">
              <p style={{ fontWeight: 600 }}>{o.sendingStatus === "Sending" ? "Sending approved emails during business hours" : o.sendingStatus}</p>
              <p className="hint" style={{ marginTop: 4 }}>
                {o.sent24h} sent in the last 24 hours. {o.approved} approved and waiting to send.
                {o.lastInboxCheck ? ` Inbox checked ${when(o.lastInboxCheck)}.` : ""}
              </p>
              <ul className="rows" style={{ marginTop: 12 }}>
                {pipeline.map((st) => (
                  <li key={st}>
                    <Link href={`/admin/partners?status=${st}`}>{STATUS_LABEL[st]}</Link>
                    <span className="n">{o.partners[st] ?? 0}</span>
                  </li>
                ))}
              </ul>
            </div>
          </section>
          <section className="card">
            <h2>Setup</h2>
            <div className="pad">
              <ul className="checklist">
                {setup.map((x) => (
                  <li key={x.label}>
                    {x.done ? <CheckCircle2 size={18} className="yes" aria-label="Done" /> : <Circle size={18} className="no" aria-label="To do" />}
                    {x.label}
                  </li>
                ))}
              </ul>
              <Link href="/admin/settings" className="btn small-btn" style={{ marginTop: 14 }}>
                Open settings
              </Link>
            </div>
          </section>
          <section className="card">
            <h2>Catalog</h2>
            <div className="pad">
              <ul className="rows">
                <li>
                  Active deals <span className="n">{s.deals.active}</span>
                </li>
                <li>
                  Verified stores <span className="n">{s.deals.merchants}</span>
                </li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
