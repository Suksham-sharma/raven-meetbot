"use client";

import { create } from "zustand";

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
  // Position is per-meeting: carrying it across highlights a turn that is gone.
  reset: () => set({ currentS: 0, durationS: 0, playing: false, seek: null }),
}));

export function useIsCurrent(startS: number, endS: number): boolean {
  return usePlayer((s) => s.currentS >= startS && s.currentS < endS);
}

export function toMediaTime(transcriptS: number, offsetS: number): number {
  return transcriptS + offsetS;
}
