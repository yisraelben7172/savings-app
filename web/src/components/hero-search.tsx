"use client";

import { Sparkles } from "lucide-react";
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
      <Sparkles className="spark" size={22} aria-hidden />
      <label className="sr" htmlFor="q">
        Search deals or ask the assistant
      </label>
      <input id="q" value={q} onChange={(e) => setQ(e.target.value)} placeholder='What are you looking for? Try "running shoes under $80"' maxLength={1000} />
      <button className="btn primary" type="submit">
        Find deals
      </button>
    </form>
  );
}

/** Example prompts that open the assistant (used on the blue banner). */
export function AskChips({ asks }: { asks: string[] }) {
  const { openChat } = useDealUI();
  return (
    <div className="asks">
      {asks.map((a) => (
        <button key={a} type="button" onClick={() => openChat(a)}>
          &ldquo;{a}&rdquo;
        </button>
      ))}
    </div>
  );
}
