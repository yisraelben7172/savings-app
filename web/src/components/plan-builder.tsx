"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { approvePlan, cancelPlan, createPlan, getPlan, money, selectPlanOption, type Plan, type PlanCall, type PlanItemResult } from "@/lib/api";

type Row = { query: string; maxPrice: string; quantity: string };
const blank = (): Row => ({ query: "", maxPrice: "", quantity: "1" });
const MAX_ITEMS = 8;
const POLL_MS = 800;
const POLL_LIMIT = 40;

const unit = (u: string | null) => (u ? ` ${u}` : "");

function Totals({ plan }: { plan: Plan }) {
  const t = plan.result!.totals;
  return (
    <section className="sp-totals" aria-label="Totals">
      <div className="sp-total">
        <span>Total</span>
        <b>{money(t.total)}</b>
      </div>
      {t.totalBudget && (
        <p className={t.totalBudget.over > 0 ? "sp-over" : "sp-ok"}>
          {t.totalBudget.over > 0 ? `${money(t.totalBudget.over)} over your ${money(t.totalBudget.limit)} budget` : `${money(t.totalBudget.remaining)} left of your ${money(t.totalBudget.limit)} budget`}
        </p>
      )}
      {Object.entries(t.categoryBudgets).map(([cat, b]) => (
        <p key={cat} className={b.over > 0 ? "sp-over" : "sp-ok"}>
          {cat}: {b.over > 0 ? `${money(b.over)} over` : `${money(b.remaining)} left`} of {money(b.limit)}
        </p>
      ))}
      {t.uncounted.length > 0 && <p className="sp-note">Not in the total (final cost depends on how many you need): {t.uncounted.map((u) => `${u.label} ${money(u.price)} ${u.priceUnit}`).join(", ")}.</p>}
    </section>
  );
}

function Item({ it, editable, busy, onPick }: { it: PlanItemResult; editable: boolean; busy: boolean; onPick: (slug: string) => void }) {
  const chosen = it.chosen == null ? null : it.options[it.chosen];
  return (
    <li className="sp-item">
      <div className="sp-item-head">
        <h3>
          {it.label}
          {it.quantity > 1 ? ` × ${it.quantity}` : ""}
        </h3>
        {chosen && (
          <b className="sp-price">
            {money(chosen.price * it.quantity)}
            {chosen.priceUnit ? <small>{unit(chosen.priceUnit)}</small> : null}
          </b>
        )}
      </div>
      {!chosen ? (
        <p className="sp-note">{it.note ?? "Nothing currently matches this."}</p>
      ) : (
        <>
          <p>
            <Link href={`/deals/${chosen.slug}`}>{chosen.title}</Link>
            <span className="sp-muted">
              {" "}
              at {chosen.store}, price checked {chosen.priceCheckedHoursAgo} hour{chosen.priceCheckedHoursAgo === 1 ? "" : "s"} ago
            </span>
          </p>
          {chosen.whyItFits[0] && <p className="sp-muted">{chosen.whyItFits[0]}</p>}
          {chosen.notConfirmed.length > 0 && <p className="sp-muted">Not confirmed: {chosen.notConfirmed.join("; ")}</p>}
          {editable && it.options.length > 1 && (
            <details className="sp-alts">
              <summary>Other options ({it.options.length - 1})</summary>
              <ul>
                {it.options.map((o, j) =>
                  j === it.chosen ? null : (
                    <li key={o.slug}>
                      <span>
                        {o.title} <span className="sp-muted">at {o.store}</span>
                      </span>
                      <b>
                        {money(o.price)}
                        {unit(o.priceUnit)}
                      </b>
                      <button type="button" className="btn" disabled={busy} onClick={() => onPick(o.slug)}>
                        Use this
                      </button>
                    </li>
                  ),
                )}
              </ul>
            </details>
          )}
        </>
      )}
    </li>
  );
}

export function PlanBuilder() {
  const [rows, setRows] = useState<Row[]>([blank(), blank()]);
  const [budget, setBudget] = useState("");
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const polls = useRef(0);

  const show = useCallback((r: PlanCall, keepNotice = false) => {
    if (r.ok) {
      setPlan(r.plan);
      setError(null);
      if (!keepNotice) setNotice(null);
      try {
        window.history.replaceState(null, "", `/plan?id=${r.plan.id}`);
      } catch {}
    } else {
      if (r.plan) setPlan(r.plan);
      setError(r.message);
      setNotice(r.changes?.length ? r.changes.map((c) => (c.now == null ? `${c.label} is no longer available.` : `${c.label} changed from ${money(c.was)} to ${money(c.now)}.`)).join(" ") : null);
    }
  }, []);

  // open a plan from the address (?id=…)
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("id");
    if (id && /^[a-f0-9]{32}$/.test(id)) void getPlan(id).then((r) => show(r));
  }, [show]);

  // follow a running plan until it finishes
  useEffect(() => {
    if (plan?.status !== "RUNNING") return;
    if (polls.current++ >= POLL_LIMIT) {
      setError("This is taking longer than expected. Please try again.");
      return;
    }
    const t = setTimeout(() => void getPlan(plan.id).then((r) => show(r)), POLL_MS);
    return () => clearTimeout(t);
  }, [plan, show]);

  const update = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const filled = rows.filter((r) => r.query.trim());

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!filled.length) return setError("Add at least one item.");
    const items = filled.map((r) => ({
      query: r.query.trim(),
      ...(r.maxPrice ? { maxPrice: Number(r.maxPrice) } : {}),
      quantity: Number(r.quantity) || 1,
    }));
    setBusy(true);
    polls.current = 0;
    show(await createPlan({ items, ...(budget ? { totalBudget: Number(budget) } : {}) }));
    setBusy(false);
  }

  async function act(fn: () => Promise<PlanCall>, keepNotice = false) {
    setBusy(true);
    show(await fn(), keepNotice);
    setBusy(false);
  }

  const restart = () => {
    setPlan(null);
    setError(null);
    setNotice(null);
    try {
      window.history.replaceState(null, "", "/plan");
    } catch {}
  };

  if (plan) {
    const r = plan.result;
    return (
      <div className="sp-wrap" aria-live="polite">
        {error && <p className="sp-error" role="alert">{error}</p>}
        {notice && <p className="sp-notice">{notice}</p>}

        {plan.status === "RUNNING" && (
          <div className="sp-status">
            <p>Finding the best deals for your list…</p>
            <button type="button" className="btn" disabled={busy} onClick={() => void act(() => cancelPlan(plan.id))}>Cancel</button>
          </div>
        )}
        {plan.status === "FAILED" && (
          <div className="sp-status">
            <p>{plan.error === "timeout" ? "That took too long, so we stopped." : "We couldn't finish this plan."} Nothing was saved to approve.</p>
            <button type="button" className="btn primary" onClick={restart}>Start again</button>
          </div>
        )}
        {plan.status === "CANCELLED" && (
          <div className="sp-status">
            <p>This plan was cancelled.</p>
            <button type="button" className="btn primary" onClick={restart}>Make a new plan</button>
          </div>
        )}

        {r && (plan.status === "READY" || plan.status === "APPROVED") && (
          <>
            {plan.status === "APPROVED" && (
              <p className="sp-approved">
                Approved. We re-checked every price just now. Vault doesn&apos;t sell anything: open each item to see its verified stores and buy at the store. Prices can change at the store.
              </p>
            )}
            {r.notes.map((n) => (
              <p key={n} className="sp-note">{n}</p>
            ))}
            <div className="sp-grid">
              <ul className="sp-list">
                {r.items.map((it) => (
                  <Item key={it.index} it={it} editable={plan.status === "READY"} busy={busy} onPick={(slug) => void act(() => selectPlanOption(plan.id, it.index, slug, plan.version))} />
                ))}
              </ul>
              <aside>
                <Totals plan={plan} />
                {plan.status === "READY" ? (
                  <div className="sp-actions">
                    <button type="button" className="btn primary lg" disabled={busy || !r.items.some((i) => i.chosen != null)} onClick={() => void act(() => approvePlan(plan.id, plan.version), true)}>
                      Approve this plan
                    </button>
                    <button type="button" className="btn" disabled={busy} onClick={() => void act(() => cancelPlan(plan.id))}>Cancel</button>
                    <p className="sp-muted">Approving checks every price again first. If something changed, we update the plan and ask you to review it.</p>
                  </div>
                ) : (
                  <div className="sp-actions">
                    <button type="button" className="btn" onClick={restart}>Make another plan</button>
                  </div>
                )}
              </aside>
            </div>
            <p className="sp-muted sp-fine">We may earn a commission when you buy through our links, at no extra cost to you. It never affects what we show or how we rank it. Plans are kept for 7 days.</p>
          </>
        )}
      </div>
    );
  }

  return (
    <form className="sp-form" onSubmit={submit}>
      {error && <p className="sp-error" role="alert">{error}</p>}
      <ul className="sp-rows">
        {rows.map((r, i) => (
          <li key={i}>
            <label className="sp-field sp-grow">
              <span>Item {i + 1}</span>
              <input value={r.query} onChange={(e) => update(i, { query: e.target.value })} maxLength={120} placeholder="For example: wireless headphones" />
            </label>
            <label className="sp-field">
              <span>Max price</span>
              <input value={r.maxPrice} onChange={(e) => update(i, { maxPrice: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="Optional" />
            </label>
            <label className="sp-field sp-qty">
              <span>Qty</span>
              <input value={r.quantity} onChange={(e) => update(i, { quantity: e.target.value.replace(/\D/g, "").slice(0, 2) })} inputMode="numeric" />
            </label>
            {rows.length > 1 && (
              <button type="button" className="btn" onClick={() => setRows((rs) => rs.filter((_, k) => k !== i))} aria-label={`Remove item ${i + 1}`}>Remove</button>
            )}
          </li>
        ))}
      </ul>
      {rows.length < MAX_ITEMS && (
        <button type="button" className="btn" onClick={() => setRows((rs) => [...rs, blank()])}>Add another item</button>
      )}
      <label className="sp-field sp-budget">
        <span>Total budget (optional)</span>
        <input value={budget} onChange={(e) => setBudget(e.target.value.replace(/[^\d.]/g, ""))} inputMode="decimal" placeholder="For example: 300" />
      </label>
      <button type="submit" className="btn primary lg" disabled={busy || !filled.length}>Build my plan</button>
      <p className="sp-muted">We only use deals from verified stores with fresh prices, and we never invent a product or a discount.</p>
    </form>
  );
}
