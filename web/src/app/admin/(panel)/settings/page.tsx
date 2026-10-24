import { CheckCircle2, Circle } from "lucide-react";
import type { Metadata } from "next";
import { ActButton, ActionForm, Submit } from "@/components/admin/forms";
import { adminApi, type Settings, type Stats } from "@/lib/admin";
import { saveSettings, setPaused, testTelegram } from "../../actions";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const [s, stats] = await Promise.all([adminApi<Settings>("/settings"), adminApi<Stats>("/stats")]);
  const o = stats.outreach;
  const paused = s.paused === "true";

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>Settings</h1>
          <p>Sending limits, your email footer and phone alerts.</p>
        </div>
        <div className="actions">
          <ActButton action={setPaused.bind(null, !paused)} className={paused ? "btn primary" : "btn"} confirm={paused ? undefined : "Pause all outreach sending?"}>
            {paused ? "Resume sending" : "Pause sending"}
          </ActButton>
        </div>
      </div>

      {paused && <div className="banner warn">Sending is paused{s.pauseReason ? `: ${s.pauseReason}` : "."}</div>}

      <div className="grid2">
        <section className="card">
          <h2>Outreach</h2>
          <div className="pad">
            <ActionForm action={saveSettings}>
              <div className="form-grid">
                <div className="field">
                  <label htmlFor="dailyLimit">Emails per day</label>
                  <input id="dailyLimit" name="dailyLimit" type="number" min={1} max={50} defaultValue={s.dailyLimit} />
                </div>
                <div className="field">
                  <label htmlFor="fromName">Sender name</label>
                  <input id="fromName" name="fromName" defaultValue={s.fromName} maxLength={80} />
                </div>
                <div className="field">
                  <label htmlFor="sendStartHour">Send from (Eastern, 24h)</label>
                  <input id="sendStartHour" name="sendStartHour" type="number" min={0} max={23} defaultValue={s.sendStartHour} />
                </div>
                <div className="field">
                  <label htmlFor="sendEndHour">Until</label>
                  <input id="sendEndHour" name="sendEndHour" type="number" min={1} max={24} defaultValue={s.sendEndHour} />
                </div>
                <div className="field">
                  <label htmlFor="followUp1Days">First follow-up after (days)</label>
                  <input id="followUp1Days" name="followUp1Days" type="number" min={1} max={30} defaultValue={s.followUp1Days} />
                </div>
                <div className="field">
                  <label htmlFor="followUp2Days">Second follow-up after (days)</label>
                  <input id="followUp2Days" name="followUp2Days" type="number" min={1} max={60} defaultValue={s.followUp2Days} />
                </div>
                <div className="field full">
                  <label htmlFor="postalAddress">Postal address for the email footer</label>
                  <input id="postalAddress" name="postalAddress" defaultValue={s.postalAddress} maxLength={300} placeholder="PO Box 123, New York, NY 10001" />
                  <span className="hint">US law (CAN-SPAM) requires a real mailing address. A PO box or virtual mailbox works. Nothing sends until this is filled in.</span>
                </div>
                <div className="field full">
                  <label htmlFor="signature">Signature</label>
                  <textarea id="signature" name="signature" rows={3} defaultValue={s.signature} maxLength={1000} />
                </div>
                <label className="switch full">
                  <input type="checkbox" name="autoPrepare" defaultChecked={s.autoPrepare === "true"} />
                  Prepare emails automatically each weekday at 8am Eastern (they still wait for your approval)
                </label>
              </div>
              <div className="form-actions">
                <Submit>Save settings</Submit>
              </div>
            </ActionForm>
          </div>
        </section>

        <div className="stack-16">
          <section className="card">
            <h2>Gmail</h2>
            <div className="pad">
              <ul className="checklist">
                <li>
                  {o.gmailConnected ? <CheckCircle2 size={18} className="yes" aria-hidden /> : <Circle size={18} className="no" aria-hidden />}
                  {o.gmailConnected ? `Connected as ${o.gmailSender}` : "Not connected"}
                </li>
              </ul>
              {!o.gmailConnected && (
                <p className="hint" style={{ marginTop: 10 }}>
                  Needs a Google Workspace mailbox on a separate outreach domain, a Google Cloud OAuth client, and a one-time sign-in. Claude can walk you
                  through it; the values go into the API&apos;s environment, never into code.
                </p>
              )}
            </div>
          </section>
          <section className="card">
            <h2>Phone alerts (Telegram)</h2>
            <div className="pad">
              <ul className="checklist">
                <li>
                  {o.telegramConnected ? <CheckCircle2 size={18} className="yes" aria-hidden /> : <Circle size={18} className="no" aria-hidden />}
                  {o.telegramConnected ? "Connected" : "Not connected"}
                </li>
              </ul>
              <p className="hint" style={{ marginTop: 10 }}>
                You&apos;ll get a message for every reply, opt-out and bounce, plus a weekday-morning summary of emails waiting for approval.
              </p>
              <ActionForm action={testTelegram}>
                <div className="form-actions">
                  <Submit className="btn small-btn" pendingText="Sending…">
                    Send a test alert
                  </Submit>
                </div>
              </ActionForm>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}
