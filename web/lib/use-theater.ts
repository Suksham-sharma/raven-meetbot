"use client";

import * as React from "react";

const KEY = "raven:theater";

/**
 * Companion (pinned in the rail) vs theater (full column width, sticky above
 * the document). DESIGN.md §5 keeps companion as the default on purpose — a
 * video hero scrolls away exactly when quote-clicking starts — but it also asks
 * for theater on demand, because 420px cannot render a shared slide or code.
 *
 * Remembered, so someone who always wants it large pays for that choice once
 * rather than on every meeting they open.
 *
 * Read through useSyncExternalStore rather than an effect that calls setState:
 * localStorage cannot be touched while rendering on the server, and this is the
 * primitive built for exactly that shape — a server snapshot, a client
 * snapshot, and a subscription. The `storage` event only fires in *other* tabs,
 * so toggling keeps its own listener set for this one.
 */
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function clientSnapshot(): boolean {
  if (cached === null) cached = localStorage.getItem(KEY) === "1";
  return cached;
}

function serverSnapshot(): boolean {
  return false;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const fromOtherTab = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = e.newValue === "1";
    listeners.forEach((l) => l());
  };
  window.addEventListener("storage", fromOtherTab);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", fromOtherTab);
  };
}

export function useTheater(): [boolean, () => void] {
  const theater = React.useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );

  const toggle = React.useCallback(() => {
    cached = !clientSnapshot();
    localStorage.setItem(KEY, cached ? "1" : "0");
    listeners.forEach((l) => l());
  }, []);

  return [theater, toggle];
}
