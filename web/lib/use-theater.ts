"use client";

import * as React from "react";

const KEY = "raven:theater";

// Theater vs companion, and why theater wins: DESIGN.md §5.
// useSyncExternalStore, not an effect — localStorage cannot be read while
// rendering on the server, and `storage` only fires in other tabs.
const listeners = new Set<() => void>();
let cached: boolean | null = null;

function clientSnapshot(): boolean {
  if (cached === null) cached = localStorage.getItem(KEY) !== "0";
  return cached;
}

function serverSnapshot(): boolean {
  return true;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  const fromOtherTab = (e: StorageEvent) => {
    if (e.key !== KEY) return;
    cached = e.newValue !== "0";
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
