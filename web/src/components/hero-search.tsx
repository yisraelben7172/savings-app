"use client";

import { ArrowUpRight, Search } from "lucide-react";
import { useState } from "react";
import { useDealUI } from "./providers";

/** One-line search: plain-language questions go straight to the deal assistant. */
export function HeroSearch() {
  const { openChat } = useDealUI();
  const [q, setQ] = useState("");
  return (
    <form
      className="omni"
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        openChat(q.trim() || "Running shoes under $80");
        setQ("");
      }}
    >
      <Search className="spark" size={20} aria-hidden />
      <label className="sr" htmlFor="q">
        Search deals or ask the assistant
      </label>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="What are you looking for?" maxLength={1000} />
      <button className="btn primary" type="submit">
        Find deals
      </button>
    </form>
  );
}

/** Example questions that open the assistant (used on the assistant banner). */
export function AskChips({ asks }: { asks: string[] }) {
  const { openChat } = useDealUI();
  return (
    <div className="asks">
      {asks.map((a) => (
        <button key={a} type="button" onClick={() => openChat(a)}>
          {a}
          <ArrowUpRight size={18} aria-hidden />
        </button>
      ))}
    </div>
  );
}

export function AskButton() {
  const { openChat } = useDealUI();
  return (
    <button type="button" className="btn" onClick={() => openChat()}>
      Ask the assistant
    </button>
  );
}
