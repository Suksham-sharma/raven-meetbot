
export function speakerTrackerMain(opts: {
  sampleMs: number;
  levelThreshold: number;
  voteWindowMs: number;
  bindVotes: number;
}): void {
  const log = (type: string, data: Record<string, unknown> = {}) => {
    try {
      window.__speakerEvent(JSON.stringify({ type, t: Date.now(), ...data }));
    } catch {
    }
  };

  interface Tile {
    el: Element;
    names: string[];
  }
  const tiles = new Map<string, Tile>();

  const NOISE = /_|^[0-9]+$/;

  const extractNames = (el: Element): string[] => {
    const counts = new Map<string, number>();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    let visited = 0;
    while ((node = walker.nextNode()) && visited < 200) {
      visited++;
      const s = (node.textContent || "").trim();
      if (s.length < 2 || s.length > 40 || NOISE.test(s)) continue;
      counts.set(s, (counts.get(s) || 0) + 1);
    }
    return [...counts.keys()].sort((a, b) => a.length - b.length).slice(0, 3);
  };

  const rescanTiles = () => {
    const seen = new Set<string>();
    document.querySelectorAll("[data-participant-id]").forEach((el) => {
      const pid = el.getAttribute("data-participant-id") || "";
      if (!pid) return;
      seen.add(pid);
      const existing = tiles.get(pid);
      if (!existing) {
        const names = extractNames(el);
        tiles.set(pid, { el, names });
        log("tile", { pid, names });
        return;
      }
      if (existing.el !== el) existing.el = el;
      const names = extractNames(el);
      if (names.length && names.join("|") !== existing.names.join("|")) {
        existing.names = names;
        log("tile", { pid, names });
      }
    });
    for (const pid of [...tiles.keys()]) {
      if (!seen.has(pid)) {
        tiles.delete(pid);
        toggles.delete(pid);
        log("tile-", { pid });
      }
    }

    const cutoff = Date.now() - opts.voteWindowMs;
    for (const map of toggles.values()) {
      for (const [token, ts] of map) {
        if (ts < cutoff) map.delete(token);
      }
    }
  };

  const toggles = new Map<string, Map<string, number>>();

  const observer = new MutationObserver((muts) => {
    const now = Date.now();
    for (const m of muts) {
      if (m.type !== "attributes" || m.attributeName !== "class") continue;
      const target = m.target instanceof Element ? m.target : null;
      if (!target) continue;
      const holder = target.closest("[data-participant-id]");
      if (!holder) continue;
      const pid = holder.getAttribute("data-participant-id") || "";
      if (!pid) continue;
      const before = new Set((m.oldValue || "").split(/\s+/).filter(Boolean));
      const after = new Set(
        (target.getAttribute("class") || "").split(/\s+/).filter(Boolean)
      );
      let map = toggles.get(pid);
      if (!map) {
        map = new Map();
        toggles.set(pid, map);
      }
      const tokenTimes = map;
      after.forEach((c) => {
        if (!before.has(c)) tokenTimes.set(c, now);
      });
      before.forEach((c) => {
        if (!after.has(c)) tokenTimes.set(c, now);
      });
    }
  });
  observer.observe(document.body, {
    subtree: true,
    attributes: true,
    attributeOldValue: true,
    attributeFilter: ["class"],
  });

  const tilesTogglingWithin = (now: number, windowMs: number): string[] => {
    const out: string[] = [];
    for (const [pid, map] of toggles) {
      if (!tiles.has(pid)) continue;
      for (const ts of map.values()) {
        if (now - ts > windowMs) continue;
        out.push(pid);
        break;
      }
    }
    return out;
  };

  const readContributors = (): Array<{ id: number; lvl: number; kind: string }> => {
    const out: Array<{ id: number; lvl: number; kind: string }> = [];
    const seen = new Set<string>();
    for (const pc of window.__pcs || []) {
      if (pc.connectionState === "closed") continue;
      for (const receiver of pc.getReceivers()) {
        if (receiver.track.kind !== "audio") continue;
        const contribs = receiver.getContributingSources();
        const list =
          contribs.length > 0
            ? contribs.map((s) => ({
                id: s.source,
                lvl: s.audioLevel ?? 0,
                kind: "csrc",
              }))
            : receiver.getSynchronizationSources().map((s) => ({
                id: s.source,
                lvl: s.audioLevel ?? 0,
                kind: "ssrc",
              }));
        for (const e of list) {
          if (e.id < 1000) continue;
          const key = `${e.kind}:${e.id}`;
          if (seen.has(key)) continue;
          seen.add(key);
          out.push(e);
        }
      }
    }
    return out;
  };

  const bindTallies = new Map<number, Map<string, number>>();
  const locked = new Map<number, string>();
  let lastVoteSec = 0;
  let lastChurnKey = "";

  const sample = () => {
    const now = Date.now();
    const contributors = readContributors();
    const hot = contributors.filter((c) => c.lvl >= opts.levelThreshold);

    if (hot.length > 0) {
      log("csrc", {
        entries: hot.map((c) => ({
          id: c.id,
          lvl: Math.round(c.lvl * 1000) / 1000,
          kind: c.kind,
        })),
      });
    }

    const churning = tilesTogglingWithin(now, opts.voteWindowMs);
    const churnKey = churning.slice().sort().join("|");
    if (churnKey !== lastChurnKey) {
      lastChurnKey = churnKey;
      log("churn", { pids: churning });
    }

    const nowSec = Math.floor(now / 1000);
    if (hot.length !== 1 || churning.length !== 1 || nowSec === lastVoteSec) return;
    lastVoteSec = nowSec;

    const id = hot[0].id;
    if (locked.has(id)) return;
    const pid = churning[0];
    let tally = bindTallies.get(id);
    if (!tally) {
      tally = new Map();
      bindTallies.set(id, tally);
    }
    tally.set(pid, (tally.get(pid) || 0) + 1);
    const ranked = [...tally.entries()].sort((a, b) => b[1] - a[1]);
    const [leadPid, leadVotes] = ranked[0];
    const runnerUp = ranked[1]?.[1] ?? 0;
    if (leadVotes >= opts.bindVotes && leadVotes >= runnerUp * 2) {
      locked.set(id, leadPid);
      bindTallies.delete(id);
      log("bind", {
        id,
        kind: hot[0].kind,
        pid: leadPid,
        names: tiles.get(leadPid)?.names || [],
      });
    }
  };

  rescanTiles();
  log("start", { tiles: tiles.size });

  const timers: number[] = [];
  timers.push(window.setInterval(sample, opts.sampleMs));
  timers.push(window.setInterval(rescanTiles, 1500));

  let stopped = false;
  window.__speakerStop = () => {
    if (stopped) return;
    stopped = true;
    timers.forEach((t) => window.clearInterval(t));
    observer.disconnect();
    log("end", {
      bindings: [...locked.entries()].map(([id, pid]) => ({
        id,
        pid,
        names: tiles.get(pid)?.names || [],
      })),
    });
  };
}
