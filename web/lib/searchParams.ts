export function parseT(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export function parseQ(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.trim();
  return s ? s : null;
}

export function buildT(t: number): string {
  return `?t=${Math.floor(t)}`;
}
