"use client";

import { ArrowRight, Sparkles, X } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { money, sendChat, type ChatReply, type Deal } from "@/lib/api";
import { useDealUI } from "./providers";

type Turn = { role: "user" | "assistant"; content: string; deals?: Deal[]; compareSlugs?: string[]; trip?: ChatReply["trip"] };

const SUGGESTIONS = ["Running shoes under $80", "Moisturizer for dry skin", "Headphones deal", "Car rental this weekend"];
const GREETING = "Hi! Tell me what you're shopping for and your budget. I'll find the best deal from stores we've checked.";

/** The deal assistant conversation; used by the floating widget and the /assistant page. */
export function ChatPanel({
  initial,
  onClose,
  hidden,
  variant = "widget",
}: {
  initial?: string;
  onClose?: () => void;
  hidden?: boolean;
  variant?: "widget" | "page";
}) {
  const { openDeal } = useDealUI();
  const [turns, setTurns] = useState<Turn[]>([]);
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  const logRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const sentInitial = useRef(false);

  async function send(raw: string) {
    const q = raw.trim();
    if (!q || busy) return;
    const history = turns.map(({ role, content }) => ({ role, content }));
    setTurns((t) => [...t, { role: "user", content: q }]);
    setBusy(true);
    try {
      const r = await sendChat(q, history);
      setTurns((t) => [...t, { role: "assistant", content: r.reply, deals: r.deals, compareSlugs: r.compareSlugs, trip: r.trip }]);
    } catch {
      setTurns((t) => [...t, { role: "assistant", content: "I couldn't reach our deal database just now. Please try again in a moment." }]);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (initial && !sentInitial.current) {
      sentInitial.current = true;
      send(initial);
    } else inputRef.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [turns, busy]);

  useEffect(() => {
    if (hidden === false) inputRef.current?.focus();
  }, [hidden]);

  return (
    <section
      className={`chat${variant === "page" ? " page" : ""}`}
      hidden={hidden}
      role={variant === "widget" ? "dialog" : undefined}
      aria-label="Deal assistant"
    >
      <div className="chat-head">
        <div className="av">
          <Sparkles size={20} aria-hidden />
        </div>
        <div>
          <b>Deal assistant</b>
          <small>Only recommends verified stores</small>
        </div>
        {onClose && (
          <button className="x" onClick={onClose} aria-label="Close chat">
            <X size={18} />
          </button>
        )}
      </div>
      <div className="chat-log" ref={logRef} aria-live="polite">
        <div className="msg bot">{GREETING}</div>
        {turns.map((t, i) => (
          <div key={i} style={{ display: "contents" }}>
            <div className={`msg ${t.role === "user" ? "me" : "bot"}`}>{t.content}</div>
            {t.deals?.map((d) => (
              <button key={d.id} type="button" className="pick" onClick={() => openDeal(d.slug)}>
                <div className="top">
                  <span className="ver">
                    <span className="dot" />
                    Verified store{d.storeCount > 1 ? "s" : ""}
                  </span>
                  <span>{d.category.name}</span>
                </div>
                <div className="name">{d.title}</div>
                <div className="pp">
                  <b>
                    {money(d.bestPrice)}
                    {d.priceUnit ? `/${d.priceUnit.replace("per ", "")}` : ""}
                  </b>
                  {d.saved > 0 && <s>{money(d.originalPrice)}</s>}
                  {d.saved > 0 && <em>Save {money(d.saved)}</em>}
                </div>
                <span className="go">Compare {d.storeCount} store{d.storeCount === 1 ? "" : "s"}</span>
              </button>
            ))}
            {t.trip && (
              <Link href={`/trip/${t.trip.id}`} className="pick tp-card" onClick={onClose}>
                <div className="top">
                  <span>Trip plan</span>
                  <span>{t.trip.withinBudget ? "Within budget" : "Over budget"}</span>
                </div>
                <div className="name">{t.trip.destination}, {t.trip.startDate} to {t.trip.endDate}</div>
                <div className="pp">
                  <b>{money(t.trip.total)}</b>
                </div>
                <span className="go">View your trip plan</span>
              </Link>
            )}
            {t.compareSlugs && t.compareSlugs.length > 1 && (
              <Link href={`/compare?slugs=${t.compareSlugs.join(",")}`} className="pick go" style={{ textAlign: "center" }} onClick={onClose}>
                Compare these side by side
              </Link>
            )}
          </div>
        ))}
        {busy && (
          <div className="typing" aria-label="Assistant is typing">
            <i />
            <i />
            <i />
          </div>
        )}
      </div>
      {turns.length === 0 && !busy && (
        <div className="suggest">
          {SUGGESTIONS.map((s) => (
            <button key={s} type="button" onClick={() => send(s)}>
              {s}
            </button>
          ))}
        </div>
      )}
      <form
        className="chat-form"
        onSubmit={(e) => {
          e.preventDefault();
          send(text);
          setText("");
        }}
      >
        <label className="sr" htmlFor={`cin-${variant}`}>
          Message the deal assistant
        </label>
        <input
          id={`cin-${variant}`}
          ref={inputRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Ask for a deal…"
          autoComplete="off"
          maxLength={1000}
        />
        <button type="submit" aria-label="Send" disabled={busy || !text.trim()}>
          <ArrowRight size={18} strokeWidth={2.2} />
        </button>
      </form>
      <div className="disclose">AI assistant. Prices can change at the store. We may earn a commission.</div>
    </section>
  );
}
