"use client";

import * as React from "react";
import {
  ArrowsOut,
  Pause,
  Play,
  SpeakerHigh,
  SpeakerSlash,
} from "@phosphor-icons/react";
import { cn } from "@/lib/cn";
import { timecode } from "@/lib/speaker";
import { usePlayer } from "@/lib/player";
import type { Chapter, Recording, TranscriptTurn } from "@/lib/types";

/**
 * No player library. Their value is their default chrome and we replace all of
 * it — a scrubber marked with chapters, wired to the transcript (DESIGN.md §11).
 *
 * Chrome floats over the video, which is the one place §8 permits a frosted
 * surface: it sits over moving picture, so an opaque bar would punch a hole in
 * the frame.
 */
export function Player({
  recording,
  chapters,
  turns,
  title,
}: {
  recording: Recording;
  chapters: Chapter[];
  turns?: TranscriptTurn[];
  title: string;
}) {
  const ref = React.useRef<HTMLVideoElement>(null);
  const shell = React.useRef<HTMLDivElement>(null);
  const [muted, setMuted] = React.useState(false);
  const [captions, setCaptions] = React.useState(false);
  const [hover, setHover] = React.useState<number | null>(null);

  const currentS = usePlayer((s) => s.currentS);
  const durationS = usePlayer((s) => s.durationS);
  const playing = usePlayer((s) => s.playing);
  const seek = usePlayer((s) => s.seek);
  const { setCurrent, setDuration, setPlaying, consumeSeek } =
    usePlayer.getState();

  // Media duration wins over the stored one: the recording keeps rolling for a
  // while after the last thing anybody says, so the transcript's end is short of
  // the file's by however long the bot lingered.
  const total = durationS || recording.duration_s || 0;

  React.useEffect(() => {
    if (!seek) return;
    const el = ref.current;
    if (!el) return;
    el.currentTime = seek.t;
    setCurrent(seek.t);
    if (seek.play) void el.play().catch(() => undefined);
    consumeSeek();
  }, [seek, setCurrent, consumeSeek]);

  const vtt = useCaptionTrack(turns, recording.recording_offset_s);

  function nudge(by: number) {
    const el = ref.current;
    if (!el) return;
    el.currentTime = Math.min(Math.max(0, el.currentTime + by), total || 1e9);
    setCurrent(el.currentTime);
  }

  function toggle() {
    const el = ref.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const el = ref.current;
    if (!el) return;
    // The scrubber is a real range input; it owns the arrow keys when focused.
    const onSlider = (e.target as HTMLElement).tagName === "INPUT";
    const keys: Record<string, () => void> = {
      " ": toggle,
      k: toggle,
      ArrowRight: () => nudge(5),
      ArrowLeft: () => nudge(-5),
      l: () => nudge(10),
      j: () => nudge(-10),
      ArrowUp: () => (el.volume = Math.min(1, el.volume + 0.1)),
      ArrowDown: () => (el.volume = Math.max(0, el.volume - 0.1)),
      m: () => setMuted((v) => !v),
      f: fullscreen,
      c: () => setCaptions((v) => !v),
    };
    if (onSlider && e.key.startsWith("Arrow")) return;
    const run = keys[e.key] ?? keys[e.key.toLowerCase()];
    if (!run) return;
    e.preventDefault();
    run();
  }

  function fullscreen() {
    const box = shell.current;
    if (!box) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    // A 420px rail cannot render a shared slide or code (§5); this is the
    // escape hatch that keeps screen-share content readable.
    else void box.requestFullscreen?.().catch(() => undefined);
  }

  const pct = total ? Math.min(100, (currentS / total) * 100) : 0;

  return (
    <div
      ref={shell}
      onKeyDown={onKeyDown}
      className="group/player relative overflow-hidden rounded-lg bg-ink-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
    >
      <video
        ref={ref}
        src={recording.url}
        poster={recording.poster_url ?? undefined}
        muted={muted}
        playsInline
        preload="metadata"
        aria-label={`Recording of ${title}`}
        className="aspect-video w-full bg-ink-1"
        onClick={toggle}
        onLoadedMetadata={(e) => {
          const d = e.currentTarget.duration;
          if (Number.isFinite(d) && d > 0) setDuration(d);
        }}
        onTimeUpdate={(e) => setCurrent(e.currentTarget.currentTime)}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
      >
        {vtt && (
          <track
            kind="captions"
            src={vtt}
            srcLang="en"
            label="English"
            default={captions}
          />
        )}
      </video>

      <div
        className={cn(
          "absolute inset-x-0 bottom-0 px-3 pt-8 pb-2.5",
          "bg-gradient-to-t from-ink-1/85 to-transparent",
          "supports-[backdrop-filter:blur(0px)]:backdrop-blur-[2px]",
        )}
      >
        <Scrubber
          pct={pct}
          total={total}
          currentS={currentS}
          chapters={chapters}
          offsetS={recording.recording_offset_s}
          seekable={recording.seekable}
          playing={playing}
          hover={hover}
          onHover={setHover}
          onSeek={(t) => {
            const el = ref.current;
            if (!el) return;
            el.currentTime = t;
            setCurrent(t);
          }}
        />

        <div className="mt-1.5 flex items-center gap-2">
          <Control
            onClick={toggle}
            label={playing ? "Pause" : "Play"}
            icon={
              playing ? (
                <Pause size={14} weight="fill" />
              ) : (
                <Play size={14} weight="fill" />
              )
            }
          />
          <span className="font-mono text-[11px] tabular-nums text-paper/85">
            {timecode(currentS)}
            <span className="text-paper/45"> / {timecode(total)}</span>
          </span>

          <span className="ml-auto flex items-center gap-1">
            {vtt && (
              <Control
                onClick={() => setCaptions((v) => !v)}
                label={captions ? "Hide captions" : "Show captions"}
                pressed={captions}
                icon={<span className="text-[10px] font-semibold">CC</span>}
              />
            )}
            <Control
              onClick={() => setMuted((v) => !v)}
              label={muted ? "Unmute" : "Mute"}
              icon={
                muted ? <SpeakerSlash size={14} /> : <SpeakerHigh size={14} />
              }
            />
            <Control
              onClick={fullscreen}
              label="Fullscreen"
              icon={<ArrowsOut size={14} />}
            />
          </span>
        </div>
      </div>
    </div>
  );
}

function Control({
  icon,
  label,
  onClick,
  pressed,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      className={cn(
        // 24px minimum touch target, §9.
        "grid size-6 place-items-center rounded-xs transition-colors duration-150 ease-out",
        pressed ? "bg-paper/90 text-ink-1" : "text-paper/85 hover:bg-paper/15",
      )}
    >
      {icon}
    </button>
  );
}

function Scrubber({
  pct,
  total,
  currentS,
  chapters,
  offsetS,
  seekable,
  playing,
  hover,
  onHover,
  onSeek,
}: {
  pct: number;
  total: number;
  currentS: number;
  chapters: Chapter[];
  offsetS: number;
  seekable: boolean;
  playing: boolean;
  hover: number | null;
  onHover: (v: number | null) => void;
  onSeek: (t: number) => void;
}) {
  const at = chapters.find(
    (c) => currentS >= c.start_s + offsetS && currentS < c.end_s + offsetS,
  );

  return (
    <div className="relative">
      {(hover !== null || at) && (
        <p className="mb-1.5 truncate text-[11.5px] font-medium text-paper/90">
          {hover !== null
            ? (chapterAt(chapters, hover - offsetS)?.title ?? timecode(hover))
            : at?.title}
        </p>
      )}

      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 h-[3px] -translate-y-1/2 overflow-hidden rounded-[999px] bg-paper/25">
          <div
            className={cn(
              "h-full rounded-[999px] bg-accent-tint",
              // timeupdate lands ~4x a second; without this the fill steps
              // rather than travels. Off while paused so a seek is instant.
              playing && "motion-safe:transition-[width] duration-250 ease-linear",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Chapter marks, drawn by us from the chapters table (§11). */}
        {total > 0 &&
          chapters.map((c) => (
            <span
              key={c.seq}
              aria-hidden="true"
              className="absolute top-1/2 h-[9px] w-px -translate-y-1/2 bg-paper/55"
              style={{ left: `${((c.start_s + offsetS) / total) * 100}%` }}
            />
          ))}

        <input
          type="range"
          min={0}
          max={total || 1}
          step={0.1}
          value={Math.min(currentS, total || 1)}
          disabled={!seekable || !total}
          aria-label="Seek"
          aria-valuetext={`${timecode(currentS)} of ${timecode(total)}`}
          onChange={(e) => onSeek(Number(e.target.value))}
          onPointerMove={(e) => {
            const box = e.currentTarget.getBoundingClientRect();
            onHover(((e.clientX - box.left) / box.width) * total);
          }}
          onPointerLeave={() => onHover(null)}
          className={cn(
            "absolute inset-0 h-6 w-full cursor-pointer appearance-none bg-transparent",
            "disabled:cursor-not-allowed",
            "[&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none",
            "[&::-webkit-slider-thumb]:rounded-[999px] [&::-webkit-slider-thumb]:bg-paper",
            "[&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:border-0",
            "[&::-moz-range-thumb]:rounded-[999px] [&::-moz-range-thumb]:bg-paper",
          )}
        />
      </div>

      {!seekable && (
        <p className="mt-1 text-[11px] text-paper/70">
          Still converting — you can watch, but not skip ahead yet.
        </p>
      )}
    </div>
  );
}

function chapterAt(chapters: Chapter[], s: number): Chapter | undefined {
  return chapters.find((c) => s >= c.start_s && s < c.end_s);
}

/**
 * Captions are built from the transcript we already have rather than shipped as
 * a file, because the transcript *is* the caption track — §9 leaves no room to
 * skip this. Blob URL so nothing has to be generated server-side.
 */
function useCaptionTrack(
  turns: TranscriptTurn[] | undefined,
  offsetS: number,
): string | null {
  // Derived, not stored: building the URL in an effect and then setting state
  // renders the player once without captions and again with them, for a value
  // that is a pure function of the transcript.
  const url = React.useMemo(() => {
    if (!turns?.length) return null;
    const body = turns
      .map(
        (t, i) =>
          `${i + 1}\n${vttTime(t.start_s + offsetS)} --> ${vttTime(
            t.end_s + offsetS,
          )}\n${t.speaker ? `<v ${t.speaker}>` : ""}${t.text}\n`,
      )
      .join("\n");
    const blob = new Blob([`WEBVTT\n\n${body}`], { type: "text/vtt" });
    return URL.createObjectURL(blob);
  }, [turns, offsetS]);

  // The object URL pins the blob until it is revoked, so the previous one has
  // to go whenever this recomputes or the component unmounts.
  React.useEffect(() => {
    if (!url) return;
    return () => URL.revokeObjectURL(url);
  }, [url]);

  return url;
}

function vttTime(s: number): string {
  const whole = Math.max(0, s);
  const h = String(Math.floor(whole / 3600)).padStart(2, "0");
  const m = String(Math.floor((whole % 3600) / 60)).padStart(2, "0");
  const sec = (whole % 60).toFixed(3).padStart(6, "0");
  return `${h}:${m}:${sec}`;
}
