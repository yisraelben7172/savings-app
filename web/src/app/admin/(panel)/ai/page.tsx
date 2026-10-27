import { AlertTriangle } from "lucide-react";
import type { Metadata } from "next";
import { adminApi, AI_OUTCOME_LABEL, type AiUsage, type AiWindow } from "@/lib/admin";

export const metadata: Metadata = { title: "AI usage" };

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: n < 1 ? 4 : 2, maximumFractionDigits: n < 1 ? 4 : 2 });
const num = (n: number) => n.toLocaleString("en-US");
const pct = (n: number, of: number) => (of ? `${Math.round((n / of) * 100)}%` : "0%");

export default async function AiPage() {
  const u = await adminApi<AiUsage>("/ai/usage");
  const w = u.last24h;
  const answered = w.outcomes.ok ?? 0;
  const failed = w.outcomes.fallback_error ?? 0;
  const blocked = w.outcomes.blocked_claim ?? 0;
  const used = u.budgetUsd > 0 ? Math.min(100, (u.spentLast24hUsd / u.budgetUsd) * 100) : 100;
  const windows: [string, AiWindow][] = [
    ["Last 24 hours", u.last24h],
    ["Last 7 days", u.last7d],
    ["Last 30 days", u.last30d],
  ];
  const notSetUp = (u.last30d.outcomes.fallback_nokey ?? 0) > 0 && !(u.last30d.outcomes.ok ?? 0);

  return (
    <>
      <div className="ad-head">
        <div>
          <h1>AI usage</h1>
          <p>What the deal assistant costs and how it behaves. Only counts, cost and timing are kept; never what shoppers type or what the assistant answers.</p>
        </div>
      </div>

      {u.budgetUsd <= 0 && (
        <div className="banner warn">
          <AlertTriangle size={18} aria-hidden />
          <div>The daily budget is set to $0, so the assistant uses plain search only.</div>
        </div>
      )}
      {notSetUp && (
        <div className="banner warn">
          <AlertTriangle size={18} aria-hidden />
          <div>No Claude key is set, so every chat uses plain keyword search. Add ANTHROPIC_API_KEY in Render to turn the AI on.</div>
        </div>
      )}

      <div className="kpis">
        <div className="kpi">
          <div className="v">{usd(u.spentLast24hUsd)}</div>
          <div className="l">Estimated AI spend, last 24 hours</div>
        </div>
        <div className="kpi">
          <div className="v">{usd(u.remainingUsd)}</div>
          <div className="l">Left in today&apos;s {usd(u.budgetUsd)} budget</div>
        </div>
        <div className="kpi">
          <div className="v">{num(w.runs)}</div>
          <div className="l">Chats, last 24 hours</div>
        </div>
        <div className={`kpi${failed + blocked ? " attn" : ""}`}>
          <div className="v">{pct(answered, w.runs)}</div>
          <div className="l">Answered by the AI itself</div>
        </div>
      </div>

      <section className="card" style={{ marginBottom: 16 }}>
        <h2>Daily budget</h2>
        <div className="pad">
          <div className="bars" style={{ gridTemplateColumns: "1fr", height: 14, alignItems: "stretch" }} role="img" aria-label={`${Math.round(used)} percent of the daily budget used`}>
            <span style={{ width: `${used}%`, background: used >= 100 ? "var(--rose-d)" : used >= 80 ? "var(--butter-d)" : "var(--save)", borderRadius: 7, minHeight: 0 }} />
          </div>
          <p className="hint" style={{ marginTop: 10 }}>
            When the last 24 hours reach the budget, the assistant switches to plain search until spend drops back under it. Change it with AI_DAILY_BUDGET_USD in Render (0 turns the AI off).
            {" "}{u.priceNote}
          </p>
        </div>
      </section>

      <div className="grid-2">
        {windows.map(([label, win]) => (
          <section key={label} className="card" style={label === "Last 30 days" ? { gridColumn: "1 / -1" } : undefined}>
            <h2>{label}</h2>
            <div className="pad">
              <ul className="rows">
                <li>
                  Chats <span className="n">{num(win.runs)}</span>
                </li>
                <li>
                  Estimated cost <span className="n">{usd(win.costUsd)}</span>
                </li>
                <li>
                  Tokens in / out{" "}
                  <span className="n">
                    {num(win.inputTokens)} / {num(win.outputTokens)}
                  </span>
                </li>
                <li>
                  Tool calls <span className="n">{num(win.toolCalls)}</span>
                </li>
                <li>
                  Average time <span className="n">{(win.avgLatencyMs / 1000).toFixed(1)} s</span>
                </li>
                <li>
                  Slowest 5% (answered by AI) <span className="n">{win.p95LatencyMs === null ? "n/a" : `${(win.p95LatencyMs / 1000).toFixed(1)} s`}</span>
                </li>
              </ul>
              {Object.keys(win.outcomes).length > 0 && (
                <>
                  <p style={{ fontWeight: 600, margin: "14px 0 4px" }}>How chats ended</p>
                  <ul className="rows">
                    {Object.entries(win.outcomes)
                      .sort((a, b) => b[1] - a[1])
                      .map(([k, n]) => (
                        <li key={k}>
                          {AI_OUTCOME_LABEL[k] ?? k}
                          <span className="n">
                            {num(n)} <span className="hint">({pct(n, win.runs)})</span>
                          </span>
                        </li>
                      ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        ))}
      </div>
    </>
  );
}
