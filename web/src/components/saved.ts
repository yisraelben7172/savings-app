"use client";

import { useCallback, useSyncExternalStore } from "react";

// Saved deals live in this browser until accounts exist; then they move to the API (SavedDeal).
const KEY = "vault:saved";
const listeners = new Set<() => void>();
const EMPTY: string[] = [];
let cache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY };

function read(): string[] {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(KEY);
  } catch {}
  if (raw === cache.raw) return cache.value;
  let value = EMPTY;
  try {
    const parsed = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) value = parsed.filter((s): s is string => typeof s === "string");
  } catch {}
  cache = { raw, value };
  return value;
}

function write(next: string[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {}
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  const onStorage = (e: StorageEvent) => e.key === KEY && cb();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
  };
}

export function useSaved() {
  const saved = useSyncExternalStore(subscribe, read, () => EMPTY);
  const toggle = useCallback((slug: string) => {
    const cur = read();
    write(cur.includes(slug) ? cur.filter((s) => s !== slug) : [slug, ...cur]);
  }, []);
  return { saved, toggle, isSaved: (slug: string) => saved.includes(slug) };
}
