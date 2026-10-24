"use client";

import { Sparkles, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, Suspense, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { getDeal, type DealDetail } from "@/lib/api";
import { CategoryIcon } from "@/lib/icons";
import { ChatPanel } from "./chat-panel";
import { StoreList } from "./store-list";

type DealUI = { openDeal: (slug: string) => void; openChat: (q?: string) => void };
const Ctx = createContext<DealUI>({ openDeal: () => {}, openChat: () => {} });
export const useDealUI = () => useContext(Ctx);

/** Hosts the store picker sheet and the floating assistant so any deal or prompt can open them. */
export function DealUIProvider({ children }: { children: ReactNode }) {
  const [sheet, setSheet] = useState<{ slug: string; deal?: DealDetail | null; error?: boolean } | null>(null);
  const [chat, setChat] = useState<{ open: boolean; started: boolean; q?: string; key: number }>({ open: false, started: false, key: 0 });
  const lastFocus = useRef<HTMLElement | null>(null);
  const fabRef = useRef<HTMLButtonElement>(null);
  const [onAssistantPage, setOnAssistantPage] = useState(false);

  const openDeal = useCallback((slug: string) => {
    lastFocus.current = document.activeElement as HTMLElement | null;
    setSheet({ slug });
    getDeal(slug)
      .then((deal) => setSheet((s) => (s?.slug === slug ? { slug, deal } : s)))
      .catch(() => setSheet((s) => (s?.slug === slug ? { slug, error: true } : s)));
  }, []);

  const closeSheet = useCallback(() => {
    setSheet(null);
    lastFocus.current?.focus();
  }, []);

  const openChat = useCallback((q?: string) => {
    // A new question starts a fresh conversation; reopening keeps the current one.
    setChat((c) => ({ open: true, started: true, q: q ?? c.q, key: q ? c.key + 1 : c.key }));
  }, []);

  const closeChat = useCallback(() => {
    setChat((c) => ({ ...c, open: false }));
    requestAnimationFrame(() => fabRef.current?.focus());
  }, []);

  const onRoute = useCallback((path: string) => {
    // Navigating closes the sheet (e.g. "See price history").
    setSheet(null);
    setOnAssistantPage(path === "/assistant");
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (sheet) closeSheet();
      else if (chat.open) closeChat();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [sheet, chat.open, closeSheet, closeChat]);

  return (
    <Ctx.Provider value={{ openDeal, openChat }}>
      <Suspense fallback={null}>
        <RouteWatcher onRoute={onRoute} />
      </Suspense>
      {children}

      {!onAssistantPage && (
        <>
          <button ref={fabRef} className="chat-fab" aria-expanded={chat.open} onClick={() => openChat()}>
            <Sparkles size={22} aria-hidden />
            <span className="lbl">Ask the deal assistant</span>
          </button>
          {chat.started && <ChatPanel key={chat.key} initial={chat.q} hidden={!chat.open} onClose={closeChat} />}
        </>
      )}

      {sheet && <StoreSheet state={sheet} onClose={closeSheet} />}
    </Ctx.Provider>
  );
}

/** Reads the URL in its own Suspense boundary so pages can still prerender. */
function RouteWatcher({ onRoute }: { onRoute: (path: string) => void }) {
  const pathname = usePathname();
  useEffect(() => onRoute(pathname), [pathname, onRoute]);
  return null;
}

function StoreSheet({ state, onClose }: { state: { slug: string; deal?: DealDetail | null; error?: boolean }; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => closeRef.current?.focus(), []);
  const d = state.deal;

  return (
    <div className="scrim" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <section className="sheet" role="dialog" aria-modal="true" aria-labelledby="shTitle">
        <div className="sh-head">
          <div className={`sh-ico pastel p-${d?.category.color ?? "sky"}`}>{d && <CategoryIcon slug={d.category.slug} />}</div>
          <div>
            <h3 id="shTitle">{d ? d.title : state.error || d === null ? "Deal unavailable" : "Loading stores…"}</h3>
            <p>
              {d
                ? `${d.offers.length} verified store${d.offers.length === 1 ? " has" : "s have"} this deal. Choose where to buy.`
                : state.error
                  ? "We couldn't load this deal. Please try again."
                  : d === null
                    ? "This deal has ended or is no longer available."
                    : "Checking every verified store."}
            </p>
          </div>
          <button ref={closeRef} className="x" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {d ? (
          <>
            <StoreList offers={d.offers} priceUnit={d.priceUnit} />
            <Link className="sh-more" href={`/deals/${d.slug}`}>
              See price history and details
            </Link>
          </>
        ) : (
          !state.error &&
          d === undefined && (
            <div style={{ padding: "0 22px 22px", display: "grid", gap: 10 }}>
              {[0, 1, 2].map((i) => (
                <div key={i} className="skel" style={{ height: 64 }} />
              ))}
            </div>
          )
        )}
      </section>
    </div>
  );
}
