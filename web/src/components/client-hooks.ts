"use client";

import { useSyncExternalStore } from "react";

const noop = () => () => {};

/** false during server render and hydration, true afterwards. */
export function useHydrated() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function subscribeMinute(cb: () => void) {
  const id = setInterval(cb, 30_000);
  return () => clearInterval(id);
}

/** Current time rounded to the minute (null on the server), so "checked 5 minutes ago" can't mismatch. */
export function useNowMinute() {
  const minute = useSyncExternalStore(subscribeMinute, () => Math.floor(Date.now() / 60_000), () => null);
  return minute === null ? null : minute * 60_000;
}
