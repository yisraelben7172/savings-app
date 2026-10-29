"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  API_URL, approveTrip, cancelTrip, createTrip, getTrip, money, reportTripBooking, selectTripOffer,
  type Trip, type TripBooking, type TripCall, type TripItem, type TripKind,
} from "@/lib/api";

const ORDER: TripKind[] = ["FLIGHT", "HOTEL", "CAR"];
const KIND_NAME: Record<TripKind, string> = { FLIGHT: "Flight", HOTEL: "Hotel", CAR: "Car rental" };
const UNIT: Record<TripItem["unitLabel"], string> = { night: "per night", day: "per day", trip: "per traveler, round trip" };
const QTY: Record<TripItem["unitLabel"], (n: number) => string> = {
  night: (n) => `${n} night${n === 1 ? "" : "s"}`,
  day: (n) => `${n} day${n === 1 ? "" : "s"}`,
  trip: (n) => `${n} traveler${n === 1 ? "" : "s"}`,
};

const fmtDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
function checkedAgo(iso: string) {
  const min = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (min < 60) return `price checked ${min} minute${min === 1 ? "" : "s"} ago`;
  const h = Math.round(min / 60);
  return `price checked ${h} hour${h === 1 ? "" : "s"} ago`;
}
const lineTotal = (unitPrice: number, qty: number) => (Math.round(unitPrice * 100) * qty) / 100; // display only; the API's totals are the source of truth
const travelers = (t: Pick<Trip, "adults" | "children">) => `${t.adults} adult${t.adults === 1 ? "" : "s"}${t.children ? `, ${t.children} child${t.children === 1 ? "" : "ren"}` : ""}`;

// ---------------- Form ----------------

export function TripForm() {
  const router = useRouter();
  const [f, setF] = useState({ destination: "", startDate: "", endDate: "", adults: "2", children: "0", origin: "", budget: "", hotelName: "", flight: false, car: false });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<typeof f>) => setF((x) => ({ ...x, ...patch }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await createTrip({
      destination: f.destination,
      startDate: f.startDate,
      endDate: f.endDate,
      adults: Number(f.adults),
      children: Number(f.children) || 0,
      ...(f.flight ? { originAirport: f.origin.trim().toUpperCase() } : {}),
      ...(f.budget ? { budgetUsd: Number(f.budget) } : {}),
      ...(f.hotelName.trim() ? { hotelName: f.hotelName.trim() } : {}),
      includeHotel: true,
      includeFlight: f.flight,
      includeCar: f.car,
    });
    if (r.ok) router.push(`/trip/${r.trip.id}`);
    else {
      setError(r.message);
      setBusy(false);
    }
  }

  return (
    <form className="sp-form tp-form" onSubmit={submit}>
      {error && <p className="sp-error" role="alert">{error}</p>}
      <div className="tp-fields">
        <label className="sp-field tp-wide">
          <span>Where to</span>
          <input required value={f.destination} onChange={(e) => set({ destination: e.target.value })} maxLength={80} placeholder="For example: Miami" />
        </label>
        <label className="sp-field">
          <span>Check-in</span>
          <input required type="date" value={f.startDate} onChange={(e) => set({ startDate: e.target.value })} />
        </label>
        <label className="sp-field">
          <span>Check-out</span>
          <input required type="date" value={f.endDate} onChange={(e) => set({ endDate: e.target.value })} />
        </label>
        <label className="sp-field tp-num">
          <span>Adults</span>
          <input required value={f.adults} onChange={(e) => set({ adults: e.target.value.replace(/\D/g, "").slice(0, 1) })} inputMode="numeric" />
        </label>
        <label className="sp-field tp-num">
          <span>Children</span>
          <input value={f.children} onChange={(e) => set({ children: e.target.value.replace(/\D/g, "").slice(0, 1) })} inputMode="numeric" />
        </label>
        <label className="sp-field">
          <span>Total budget (optional)</span>
          <input value={f.budget} onChange={(e) => set({ budget: e.target.value.replace(/[^\d.]/g, "") })} inputMode="decimal" placeholder="For example: 1500" />
        </label>
        <label className="sp-field tp-wide">
          <span>A hotel you have in mind (optional)</span>
          <input value={f.hotelName} onChange={(e) => set({ hotelName: e.target.value })} maxLength={80} placeholder="Hotel name" />
        </label>
      </div>
      <div className="tp-checks">
        <label>
          <input type="checkbox" checked={f.flight} onChange={(e) => set({ flight: e.target.checked })} /> Add a round-trip flight
        </label>
        {f.flight && (
          <label className="sp-field tp-num">
            <span>From airport</span>
            <input required value={f.origin} onChange={(e) => set({ origin: e.target.value.replace(/[^a-z]/gi, "").slice(0, 3).toUpperCase() })} placeholder="JFK" />
          </label>
        )}
        <label>
          <input type="checkbox" checked={f.car} onChange={(e) => set({ car: e.target.checked })} /> Add a car rental
        </label>
      </div>
      <button type="submit" className="btn primary lg" disabled={busy}>
        {busy ? "Building your plan…" : "Build my trip plan"}
      </button>
      <p className="sp-muted">We only use verified stores with fresh prices, and we never invent a price, a room type or a policy. You book on the partner&apos;s site; Vault never takes payment.</p>
    </form>
  );
}

// ---------------- Plan ----------------

function StorePicker({ item, editable, busy, onPick }: { item: TripItem; editable: boolean; busy: boolean; onPick: (offerId: string) => void }) {
  return (
    <ul className="tp-stores" aria-label={`Stores for ${item.title}`}>
      {item.stores.map((s) => {
        const chosen = s.offerId === item.chosenOfferId;
        return (
          <li key={s.offerId} className={chosen ? "on" : undefined}>
            <div>
              <b>{s.store}</b>
              <span className="sp-muted">{s.cancellationText ?? "Cancellation terms not stated by the source"}</span>
              <span className="sp-muted">{checkedAgo(s.priceCheckedAt)}</span>
            </div>
            <div className="tp-price">
              <b>{money(s.unitPrice)}</b>
              <small>{UNIT[item.unitLabel]}</small>
              <small>{money(lineTotal(s.unitPrice, item.quantity))} for {QTY[item.unitLabel](item.quantity)}</small>
            </div>
            {editable &&
              (chosen ? (
                <span className="tp-chosen">Chosen</span>
              ) : (
                <button type="button" className="btn" disabled={busy} onClick={() => onPick(s.offerId)}>
                  Choose {s.store}
                </button>
              ))}
          </li>
        );
      })}
    </ul>
  );
}

function Part({ kind, items, editable, busy, onPick }: { kind: TripKind; items: TripItem[]; editable: boolean; busy: boolean; onPick: (itemId: string, offerId: string) => void }) {
  const pick = items.find((i) => i.selected);
  const alts = items.filter((i) => !i.selected);
  if (!pick) return null;
  return (
    <li className="sp-item">
      <div className="sp-item-head">
        <h3>{KIND_NAME[kind]}</h3>
        {pick.available && pick.totalPrice != null ? (
          <b className="sp-price">{money(pick.totalPrice)}</b>
        ) : (
          <b className="sp-over">No longer available</b>
        )}
      </div>
      <p>
        {pick.title}
        {pick.namedMatch && <span className="tp-badge">The hotel you asked for</span>}
      </p>
      {pick.unitPrice != null && (
        <p className="sp-muted">
          {money(pick.unitPrice)} {UNIT[pick.unitLabel]} × {QTY[pick.unitLabel](pick.quantity)}
        </p>
      )}
      <StorePicker item={pick} editable={editable} busy={busy} onPick={(offerId) => onPick(pick.id, offerId)} />
      {editable && alts.length > 0 && (
        <details className="sp-alts">
          <summary>
            Other {kind === "HOTEL" ? "hotels" : kind === "FLIGHT" ? "flights" : "cars"} ({alts.length})
          </summary>
          <ul>
            {alts.map((a) => {
              const cheapest = a.stores[0];
              return (
                <li key={a.id}>
                  <span>
                    {a.title} <span className="sp-muted">from {cheapest.store}</span>
                  </span>
                  <b>
                    {money(cheapest.unitPrice)} <small className="sp-muted">{UNIT[a.unitLabel]}</small>
                  </b>
                  <button type="button" className="btn" disabled={busy || !a.available} onClick={() => onPick(a.id, cheapest.offerId)}>
                    Use this instead
                  </button>
                </li>
              );
            })}
          </ul>
        </details>
      )}
    </li>
  );
}

function BookingRow({ b, onReport }: { b: TripBooking; onReport: (itemId: string, booked: boolean) => void }) {
  const [opened, setOpened] = useState(false);
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(b.details);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }
  return (
    <li className="sp-item tp-book">
      <div className="sp-item-head">
        <h3>{KIND_NAME[b.kind]}</h3>
        <span className="sp-muted">{b.store}</span>
      </div>
      <p>{b.title}</p>
      <div className="tp-details">
        <span>{b.prefilled ? "These details are filled in for you. Check them on the site:" : `Enter these on ${b.store}:`}</span>
        <code>{b.details}</code>
        <button type="button" className="btn" onClick={() => void copy()}>
          {copied ? "Copied" : "Copy details"}
        </button>
      </div>
      <a className="btn primary" href={`${API_URL}${b.goUrl}`} target="_blank" rel="noopener noreferrer sponsored" onClick={() => setOpened(true)}>
        Finish booking on {b.store}
      </a>
      {b.disclosure && <p className="sp-muted">{b.disclosure}</p>}
      {b.attribution && <p className="sp-muted">{b.attribution}</p>}
      {(opened || b.selfReport) && (
        <div className="tp-report">
          {b.selfReport ? (
            <span className="sp-muted">Thanks, noted{b.selfReport === "yes" ? " that you completed this booking" : ""}.</span>
          ) : (
            <>
              <span>Did you complete this booking? (optional)</span>
              <button type="button" className="btn" onClick={() => onReport(b.itemId, true)}>Yes</button>
              <button type="button" className="btn" onClick={() => onReport(b.itemId, false)}>Not yet</button>
            </>
          )}
        </div>
      )}
    </li>
  );
}

export function TripView({ id }: { id: string }) {
  const [trip, setTrip] = useState<Trip | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const show = useCallback((r: TripCall) => {
    setLoaded(true);
    if (r.ok) {
      setTrip(r.trip);
      setError(null);
      setNotice(null);
    } else {
      if (r.trip) setTrip(r.trip);
      setError(r.message);
      setNotice(r.changes?.length ? r.changes.map((c) => (c.now == null ? `${c.title} at ${c.store} is no longer available for these dates.` : `${c.title} at ${c.store} changed from ${money(c.was)} to ${money(c.now)}.`)).join(" ") : null);
    }
  }, []);

  useEffect(() => {
    void getTrip(id).then(show);
  }, [id, show]);

  async function act(fn: () => Promise<TripCall>) {
    setBusy(true);
    show(await fn());
    setBusy(false);
  }

  if (!loaded) return <div className="sp-status" aria-busy="true"><p>Loading your trip plan…</p></div>;
  if (!trip) {
    return (
      <div className="sp-status">
        <p>{error ?? "This trip plan isn't available."}</p>
        <Link className="btn primary" href="/trip">Plan a trip</Link>
      </div>
    );
  }

  const editable = trip.status === "READY";
  const t = trip.totals;
  const kinds = ORDER.filter((k) => trip.wants.includes(k));

  return (
    <div className="sp-wrap tp-wrap" aria-live="polite">
      <p className="tp-sub">
        {fmtDay(trip.startDate)} to {fmtDay(trip.endDate)}, {trip.nights} night{trip.nights === 1 ? "" : "s"}, {travelers(trip)}
        {trip.originAirport ? `, flying from ${trip.originAirport}` : ""}
      </p>
      {error && <p className="sp-error" role="alert">{error}</p>}
      {notice && <p className="sp-notice">{notice}</p>}
      {trip.status === "EXPIRED" && <p className="sp-notice">This trip plan has expired (plans are kept for 7 days). Prices may have changed, so please make a new one.</p>}
      {trip.status === "CANCELLED" && <p className="sp-notice">This trip plan was cancelled.</p>}
      {trip.status === "APPROVED" && (
        <p className="sp-approved">
          Approved. We re-checked every price just now. Vault doesn&apos;t book or take payment: finish each booking on the partner&apos;s site below, in this order.
        </p>
      )}
      {trip.notes.map((n) => (
        <p key={n} className="sp-note">{n}</p>
      ))}

      <div className="sp-grid">
        <div className="tp-main">
          {trip.status === "APPROVED" ? (
            <ul className="sp-list">
              {trip.booking.map((b) => (
                <BookingRow key={b.itemId} b={b} onReport={(itemId, booked) => void act(() => reportTripBooking(trip.id, itemId, booked))} />
              ))}
            </ul>
          ) : (
            <ul className="sp-list">
              {kinds.map((k) => {
                const items = trip.items.filter((i) => i.kind === k);
                return items.length ? (
                  <Part key={k} kind={k} items={items} editable={editable} busy={busy} onPick={(itemId, offerId) => void act(() => selectTripOffer(trip.id, itemId, offerId, trip.version))} />
                ) : (
                  <li key={k} className="sp-item">
                    <h3>{KIND_NAME[k]}</h3>
                    <p className="sp-note">Nothing from a verified store matches these dates.</p>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <aside>
          <section className="sp-totals" aria-label="Trip total">
            <div className="sp-total">
              <span>Trip total</span>
              <b>{money(t.total)}</b>
            </div>
            {t.budget && (
              <p className={t.budget.over > 0 ? "sp-over" : "sp-ok"}>
                {t.budget.over > 0 ? `${money(t.budget.over)} over your ${money(t.budget.limit)} budget` : `${money(t.total)} of ${money(t.budget.limit)}`}
              </p>
            )}
            {t.missingKinds.length > 0 && <p className="sp-muted">Not included: {t.missingKinds.map((k) => KIND_NAME[k].toLowerCase()).join(", ")}.</p>}
            {editable && trip.suggestion && (
              <div className="tp-swap">
                <p>
                  Cheapest way to save: {trip.suggestion.title} at {trip.suggestion.store} saves {money(trip.suggestion.saves)}
                  {trip.suggestion.withinBudgetAfter ? " and brings you within budget." : "."}
                </p>
                <button type="button" className="btn" disabled={busy} onClick={() => void act(() => selectTripOffer(trip.id, trip.suggestion!.toItemId, trip.suggestion!.toOfferId, trip.version))}>
                  Make this swap
                </button>
              </div>
            )}
          </section>
          {editable && (
            <div className="sp-actions">
              <button type="button" className="btn primary lg" disabled={busy || t.total === 0} onClick={() => void act(() => approveTrip(trip.id, trip.version))}>
                Approve plan
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void act(() => cancelTrip(trip.id))}>Cancel plan</button>
              <p className="sp-muted">Approving checks every price again first. If something changed, we update the plan and ask you again. Approving doesn&apos;t book or pay for anything.</p>
            </div>
          )}
          {!editable && (
            <div className="sp-actions">
              <Link className="btn" href="/trip">Plan another trip</Link>
            </div>
          )}
        </aside>
      </div>
      <p className="sp-muted sp-fine">
        Prices and availability can change on the booking site. Vault puts plans together automatically from verified store prices (our AI assistant can start one for you); it never books or takes payment. We may earn a
        commission when you book through our links, at no extra cost to you. It never affects what we show or how we rank it. Trip plans are kept for 7 days and hold no personal details.
      </p>
    </div>
  );
}
