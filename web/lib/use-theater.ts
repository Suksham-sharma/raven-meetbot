"use client";

import * as React from "react";

const KEY = "raven:theater";

/**
 * Theater (video across the column, title and detail beneath it) vs companion
 * (pinned in the rail). Theater is the default: 420px is a thumbnail, and the
 * recording is what people open a meeting for.
 *
 * This departs from DESIGN.md §5, which kept the video out of the top spot
 * because a hero scrolls away exactly when quote-clicking starts. That
 * objection was right and is answered rather than ignored — the player docks to
 * a corner once it leaves the viewport, so a citation still plays somewhere you
 * can see. Companion remains one click away and is remembered.
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
  // Absent means never chosen, which is theater — only an explicit "0" opts out.
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
