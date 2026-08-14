"use client";

import { create } from "zustand";

/**
 * Playback position lives here rather than in React state because `timeupdate`
 * fires ~4x a second and a real transcript runs past a thousand turns. Held in
 * a component, every tick re-renders all of them.
 *
 * Rows subscribe through `useIsCurrent`, which selects a *boolean*. zustand
 * only re-renders a subscriber when its selected value changes, so a tick
 * re-renders the row losing the playhead and the row gaining it — two, not all
 * of them. That is the whole reason DESIGN.md §11 calls this load-bearing.
 *
 * Seeks travel the same way. The store holds a request rather than a reference
 * to the media element: a citation, a chapter and the transcript all seek, and
 * handing each of them a DOM node makes every one of them the player's problem.
 * The nonce is what makes seeking to the same second twice actually fire.
 */
interface SeekRequest {
  t: number;
  nonce: number;
  play: boolean;
}

interface PlayerState {
  currentS: number;
  durationS: number;
  playing: boolean;
  seek: SeekRequest | null;

  setCurrent: (s: number) => void;
  setDuration: (s: number) => void;
  setPlaying: (p: boolean) => void;
  /** Ask the player to jump. `play` starts playback on arrival. */
  requestSeek: (t: number, play?: boolean) => void;
  consumeSeek: () => void;
  reset: () => void;
}

export const usePlayer = create<PlayerState>((set) => ({
  currentS: 0,
  durationS: 0,
  playing: false,
  seek: null,

  setCurrent: (s) => set({ currentS: s }),
  setDuration: (s) => set({ durationS: s }),
  setPlaying: (p) => set({ playing: p }),
  requestSeek: (t, play = true) =>
    set((prev) => ({
      seek: { t: Math.max(0, t), nonce: (prev.seek?.nonce ?? 0) + 1, play },
    })),
  consumeSeek: () => set({ seek: null }),
  // Navigating between meetings must not leave the previous position behind —
  // it would highlight a turn in a transcript that no longer exists.
  reset: () => set({ currentS: 0, durationS: 0, playing: false, seek: null }),
}));

/** True while the playhead sits inside [start, end). One boolean per row. */
export function useIsCurrent(startS: number, endS: number): boolean {
  return usePlayer((s) => s.currentS >= startS && s.currentS < endS);
}

/**
 * Citation and chapter times are transcript-relative; the media is not. Every
 * jump goes through here so the offset is applied in exactly one place.
 */
export function toMediaTime(transcriptS: number, offsetS: number): number {
  return transcriptS + offsetS;
}
