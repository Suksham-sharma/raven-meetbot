"use client";

import * as React from "react";
import { Virtuoso, type VirtuosoHandle } from "react-virtuoso";
import { CaretDown, CaretUp, MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/speaker";
import { useIsCurrent, usePlayer } from "@/lib/player";
import type { TranscriptTurn } from "@/lib/types";

/**
 * Virtuoso is not optional here — real transcripts run past a thousand turns
 * (§11). The consequence is that browser ⌘F cannot see the rows that are not
 * mounted, so find is ours to ship, not a nice-to-have.
 */
export function TranscriptView({
  turns,
  offsetS,
}: {
  turns: TranscriptTurn[];
  offsetS: number;
}) {
  const handle = React.useRef<VirtuosoHandle>(null);
  const [q, setQ] = React.useState("");
  const [hit, setHit] = React.useState(0);
  const [following, setFollowing] = React.useState(true);
  const find = React.useRef<HTMLInputElement>(null);

  const playing = usePlayer((s) => s.playing);
  const currentS = usePlayer((s) => s.currentS);

  const matches = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return [];
    return turns.reduce<number[]>((acc, t, i) => {
      if (t.text.toLowerCase().includes(needle)) acc.push(i);
      return acc;
    }, []);
  }, [q, turns]);

  // Browser find is broken on virtualized content, so ⌘F has to mean ours or it
  // means nothing (§9).
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "f") {
        e.preventDefault();
        find.current?.focus();
        find.current?.select();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const active = React.useMemo(
    () =>
      turns.findIndex(
        (t) => currentS >= t.start_s + offsetS && currentS < t.end_s + offsetS,
      ),
    [turns, currentS, offsetS],
  );

  // Follows playback, but yields the moment the reader scrolls away — a list
  // that drags the viewport back while you are reading is unusable.
  React.useEffect(() => {
    if (!following || !playing || active < 0) return;
    handle.current?.scrollToIndex({
      index: active,
      align: "center",
      behavior: "smooth",
    });
  }, [active, following, playing]);

  function jump(delta: number) {
    if (!matches.length) return;
    const next = (hit + delta + matches.length) % matches.length;
    setHit(next);
    setFollowing(false);
    handle.current?.scrollToIndex({ index: matches[next], align: "center" });
  }

  return (
    // Its own scroll region, unlike the summary: a thousand turns is a place you
    // scroll *within*, and hoisting it into the column would push find out of
    // reach and drag the player off screen on the one tab you read longest.
    <div className="flex h-full min-h-0 flex-col">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-[999px] border border-rule bg-paper px-3.5 py-1.5 focus-within:border-field">
          <MagnifyingGlass size={13} className="shrink-0 text-ink-3" />
          <input
            ref={find}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setHit(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                jump(e.shiftKey ? -1 : 1);
              }
            }}
            placeholder="Find in what was said"
            aria-label="Find in transcript"
            className="min-w-0 flex-1 bg-transparent text-[13.5px] outline-none placeholder:text-ink-3"
          />
          {q && (
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-3">
              {matches.length ? `${hit + 1}/${matches.length}` : "none"}
            </span>
          )}
        </div>

        {matches.length > 0 && (
          <span className="flex shrink-0 items-center gap-0.5">
            <Step label="Previous match" onClick={() => jump(-1)}>
              <CaretUp size={13} />
            </Step>
            <Step label="Next match" onClick={() => jump(1)}>
              <CaretDown size={13} />
            </Step>
          </span>
        )}

        {!following && playing && (
          <button
            type="button"
            onClick={() => setFollowing(true)}
            className="shrink-0 rounded-[999px] bg-accent-tint px-3 py-1.5 text-[12.5px] font-medium text-accent transition-colors duration-150 ease-out hover:bg-accent-line"
          >
            Follow along
          </button>
        )}
      </div>

      <Virtuoso
        ref={handle}
        data={turns}
        components={LIST_SEMANTICS}
        className="min-h-0 flex-1"
        // Any scroll the reader starts hands them control until they ask for it
        // back. Virtuoso's own programmatic scrolls do not raise this.
        isScrolling={(scrolling) => {
          if (scrolling && playing) setFollowing(false);
        }}
        itemContent={(i, turn) => (
          <Turn
            turn={turn}
            index={i}
            total={turns.length}
            offsetS={offsetS}
            query={q.trim()}
            matched={matches[hit] === i && matches.length > 0}
          />
        )}
      />
    </div>
  );
}

/**
 * `aria-setsize` / `aria-posinset` are ignored on `role="button"`, so putting
 * them on the row control looks like it satisfies §9 while telling a screen
 * reader nothing — it would still announce the mounted window as the whole
 * transcript. They belong on a `listitem`, which needs a `list` above it, and
 * Virtuoso's own wrapper sits in between: marking that one presentational makes
 * the item the effective child of the list.
 */
const LIST_SEMANTICS = {
  List: function List({
    ref,
    ...props
  }: React.ComponentProps<"div"> & {
    ref?: React.Ref<HTMLDivElement>;
  }) {
    return <div {...props} ref={ref} role="list" />;
  },
  Item: function Item(props: React.ComponentProps<"div">) {
    return <div {...props} role="presentation" />;
  },
};

function Step({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid size-6 place-items-center rounded-xs text-ink-2 transition-colors duration-150 ease-out hover:bg-card"
    >
      {children}
    </button>
  );
}

/**
 * Touched hundreds of times a session, so §6 allows colour change only — no
 * transform, no movement. The row subscribes to a boolean, so the playhead
 * moving re-renders the row that lost it and the row that gained it.
 */
const Turn = React.memo(function Turn({
  turn,
  index,
  total,
  offsetS,
  query,
  matched,
}: {
  turn: TranscriptTurn;
  index: number;
  total: number;
  offsetS: number;
  query: string;
  matched: boolean;
}) {
  const current = useIsCurrent(turn.start_s + offsetS, turn.end_s + offsetS);
  const requestSeek = usePlayer((s) => s.requestSeek);

  return (
    // Virtuoso mounts a window of rows, so without the count a screen reader
    // reports "1 of 12" on a thousand-turn transcript (§9).
    <div role="listitem" aria-setsize={total} aria-posinset={index + 1}>
      <button
        type="button"
        onClick={() => requestSeek(turn.start_s + offsetS)}
        aria-current={current ? "true" : undefined}
        aria-label={`${turn.speaker}, ${timecode(turn.start_s)}, jump to this moment`}
        className={cn(
          "flex w-full gap-3 rounded-md px-3 py-2 text-left",
          "transition-colors duration-150 ease-out",
          current ? "bg-accent-tint" : "hover:bg-card",
          matched && !current && "bg-warn-tint",
        )}
      >
        <span className="w-[38px] shrink-0 pt-[3px] font-mono text-[11px] tabular-nums text-ink-3">
          {timecode(turn.start_s)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="mb-0.5 block text-[12.5px] font-medium text-ink-2">
            {turn.speaker}
          </span>
          {/* Speech is serif (§4). */}
          <span className="block font-serif text-[16.5px] leading-[1.6] font-light text-ink-1">
            <Highlight text={turn.text} query={query} />
          </span>
        </span>
      </button>
    </div>
  );
});

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>;
  const i = text.toLowerCase().indexOf(query.toLowerCase());
  if (i < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="bg-warn-tint text-ink-1">
        {text.slice(i, i + query.length)}
      </mark>
      <Highlight text={text.slice(i + query.length)} query={query} />
    </>
  );
}
