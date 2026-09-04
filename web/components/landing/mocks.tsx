import { Play, Check } from "@phosphor-icons/react/dist/ssr";
import { cn } from "@/lib/cn";

const EYEBROW =
  "text-[11.5px] font-semibold uppercase tracking-[0.11em] text-ink-3";

function Chip({
  speaker,
  at,
  open,
}: {
  speaker: string;
  at: string;
  open?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex h-[22px] items-center gap-1.5 rounded-[999px] px-2 text-[12px] font-medium",
        open ? "bg-accent text-accent-ink" : "bg-accent-tint text-accent",
      )}
    >
      {speaker}
      <span className="font-mono text-[11px] opacity-70">{at}</span>
    </span>
  );
}

function Quote({
  text,
  clip,
}: {
  text: string;
  clip: string;
}) {
  return (
    <div className="mt-3 border-l-2 border-accent-line pl-4">
      <q className="mb-1.5 block font-serif text-[15.5px] leading-[1.55] font-light text-ink-2 italic [quotes:none]">
        {text}
      </q>
      <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
        <Play size={11} weight="fill" />
        Play {clip}
      </span>
    </div>
  );
}

export function NotesCrop() {
  return (
    <div className="max-w-[560px]">
      <p className={cn(EYEBROW, "mb-3")}>What happened</p>
      <p className="font-serif text-[17.5px] leading-[1.62] font-light sm:text-[18.5px]">
        Anya walked through the pilot timeline and the room agreed to move the
        start to the 14th so Platform can rate-limit the ingest endpoint
        first. Dev took that for Thursday. Priya raised the DPA the vendor
        still hasn&rsquo;t returned; Maya will chase it.
      </p>

      <p className={cn(EYEBROW, "mt-8 mb-3")}>Decided</p>
      <ul className="divide-y divide-rule-lo border-y border-rule-lo">
        <li className="py-3 text-[16px] font-medium">
          Pilot start moves from the 7th to the 14th.
        </li>
        <li className="py-3 text-[16px] font-medium">
          Ingest gets a rate limit before any pilot traffic.
        </li>
      </ul>

      <div className="mt-6 flex flex-wrap gap-1.5">
        <Chip speaker="Anya" at="12:04" />
        <Chip speaker="Priya" at="22:07" open />
        <Chip speaker="Dev" at="22:41" />
      </div>
      <Quote
        text="If we don't cap ingest before they're on it, one bad import takes everyone down. I'd rather slip a week."
        clip="0:14"
      />
    </div>
  );
}

const TASKS = [
  {
    text: "Rate-limit the ingest endpoint before pilot traffic",
    owner: "Dev",
    due: "Thu",
    at: "22:41",
  },
  {
    text: "Chase the vendor for the signed DPA",
    owner: "Maya",
    due: "Fri",
    at: "27:15",
  },
  {
    text: "Send Anya the revised pilot timeline",
    owner: "You",
    due: "Tomorrow",
    at: "12:30",
  },
  {
    text: "Book the pilot retro for the 21st",
    owner: "You",
    due: "Done",
    at: "41:02",
    done: true,
  },
];

export function FollowUpsCrop() {
  return (
    <div className="max-w-[520px]">
      <p className={cn(EYEBROW, "mb-2")}>Someone needs to</p>
      <div>
        {TASKS.map((t) => (
          <div
            key={t.text}
            className="flex items-start gap-3 border-t border-rule-lo py-3.5 first:border-0"
          >
            <span
              className={cn(
                "mt-[3px] grid size-[18px] shrink-0 place-items-center rounded-xs border",
                t.done
                  ? "border-accent bg-accent text-accent-ink"
                  : "border-field bg-paper",
              )}
            >
              {t.done && <Check size={12} weight="bold" />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span
                className={cn(
                  "text-[15px] leading-[1.45]",
                  t.done && "text-ink-3 line-through decoration-ink-4/50",
                )}
              >
                {t.text}
              </span>
              <span className="text-[12.5px] text-ink-3">
                {t.owner === "You" ? (
                  <span className="font-medium text-ink-2">You</span>
                ) : (
                  t.owner
                )}
                {" · "}
                {t.due}
                {" · "}
                <span className="font-mono text-accent">{t.at}</span>
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function AskCrop() {
  return (
    <div className="max-w-[560px]">
      <div className="mb-6 rounded-lg border border-rule bg-paper px-4 py-3.5">
        <p className="font-serif text-[17px] leading-[1.5] font-light">
          What did we decide about the pilot start date?
        </p>
      </div>
      <p className="mb-4 text-[12.5px] text-ink-3">
        Searched 34 meetings · Jan 3 – Sep 2
      </p>
      <p className="font-serif text-[16.5px] leading-[1.65] font-light">
        It moved to the 14th. Anya proposed the 7th at the kickoff, but Priya
        wanted the ingest rate limit in first and the room agreed to slip a
        week. Dev confirmed Thursday for the rate-limit work at the following
        standup, and nothing since has reopened the date.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        <Chip speaker="Anya" at="12:04" />
        <Chip speaker="Priya" at="22:07" />
        <Chip speaker="Dev" at="4:18" open />
      </div>
      <Quote
        text="Thursday. I'll have the limiter behind a flag by then, and we can turn it on before they start."
        clip="0:09"
      />
    </div>
  );
}

type Tense = "proposed" | "executed" | "rejected";

function ProposalStatic({
  kind,
  title,
  reason,
  speaker,
  at,
  tense,
  result,
}: {
  kind: string;
  title: string;
  reason: string;
  speaker: string;
  at: string;
  tense: Tense;
  result?: string;
}) {
  const settled = tense !== "proposed";
  return (
    <div
      className={cn(
        "rounded-xl p-5 sm:p-6",
        settled ? "border border-rule-lo bg-paper" : "bg-accent-tint",
      )}
    >
      <div className="mb-1.5 flex items-start justify-between gap-3">
        <p className="text-[13px] text-ink-2">{kind}</p>
        {tense === "executed" && (
          <span className="inline-flex h-6 items-center rounded-[999px] bg-good-tint px-2.5 text-[13px] leading-none font-medium text-good">
            {result}
          </span>
        )}
        {tense === "rejected" && (
          <span className="text-[13px] text-ink-3">Dismissed</span>
        )}
      </div>
      <p
        className={cn(
          "mb-3 font-serif text-[20px] leading-[1.25] tracking-[-0.012em] text-balance",
          settled && "text-ink-3",
          tense === "rejected" && "line-through decoration-ink-4/50",
        )}
      >
        {title}
      </p>
      <p className={cn("text-[13px]", settled ? "text-ink-3" : "text-ink-2")}>
        {reason} — because of what {speaker} said at{" "}
        <span className={cn("font-mono", !settled && "text-accent")}>{at}</span>
      </p>
      {tense === "proposed" && (
        <div className="mt-5 flex flex-wrap items-center gap-2">
          <span className="inline-flex h-9 items-center rounded-[999px] bg-accent px-4 text-sm font-medium text-accent-ink">
            Approve
          </span>
          <span className="inline-flex h-9 items-center rounded-[999px] border border-rule bg-paper px-4 text-sm font-medium">
            Play the moment
          </span>
          <span className="ml-auto text-sm font-medium text-ink-3">Dismiss</span>
        </div>
      )}
    </div>
  );
}

export function ActionsCrop() {
  return (
    <div className="flex max-w-[560px] flex-col gap-3">
      <ProposalStatic
        tense="proposed"
        kind="Message to #design"
        title="Pilot start moved to the 14th. Timeline doc is updated."
        reason="Raven would like to post this"
        speaker="Anya"
        at="12:04"
      />
      <ProposalStatic
        tense="executed"
        kind="Linear issue · Platform"
        title="Rate-limit the ingest endpoint before pilot traffic"
        reason="Filed for Dev, due Thursday"
        speaker="Priya"
        at="22:07"
        result="PLT-214"
      />
      <ProposalStatic
        tense="rejected"
        kind="Linear issue · Platform"
        title="Add a retry budget to the vendor import"
        reason="Raven proposed this"
        speaker="Dev"
        at="33:50"
      />
    </div>
  );
}

const STEPS = [
  { at: "13:59", label: "Knocks, and is let in", done: true },
  { at: "14:00", label: "Recording, as a visible participant", done: true },
  { at: "14:47", label: "Everyone leaves. So does Raven", done: true },
  { at: "14:56", label: "Notes, decisions and follow-ups are ready", done: false },
  { at: "Later", label: "Ask about it, from any meeting", done: false },
];

export function JoinCrop() {
  return (
    <div className="max-w-[600px]">
      <p className={cn(EYEBROW, "mb-2")}>Up next</p>
      <ul className="divide-y divide-rule-lo border-y border-rule-lo">
        <li className="flex items-baseline gap-4 py-3.5">
          <span className="w-[3.5rem] shrink-0 font-mono text-[12.5px] text-ink-2">
            14:00
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Pilot kickoff</span>
            <span className="mt-0.5 block text-[12.5px] text-ink-3">
              Anya, Priya, Dev, Maya · Raven joins a minute early
            </span>
          </span>
        </li>
        <li className="flex items-baseline gap-4 py-3.5 opacity-55">
          <span className="w-[3.5rem] shrink-0 font-mono text-[12.5px] text-ink-2">
            16:30
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] font-medium">Dentist</span>
            <span className="mt-0.5 block text-[12.5px] text-ink-3">
              No Meet link
            </span>
          </span>
          <span className="shrink-0 text-[12.5px] text-ink-3">Not joining</span>
        </li>
      </ul>

      <div className="mt-9">
        <div className="timeline-track relative h-[3px] w-full rounded-full bg-sunk">
          <span className="timeline-fill absolute inset-y-0 left-0 rounded-full bg-accent" />
          {STEPS.map((s, i) => (
            <span
              key={s.at}
              className={cn(
                "absolute top-1/2 size-[9px] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card",
                s.done ? "bg-accent" : "bg-ink-4",
              )}
              style={{ left: `${(i / (STEPS.length - 1)) * 100}%` }}
            />
          ))}
        </div>
        <ol className="mt-4 grid grid-cols-2 gap-x-3 gap-y-5 sm:grid-cols-5 sm:gap-x-2">
          {STEPS.map((s) => (
            <li key={s.at} className="min-w-0">
              <span
                className={cn(
                  "block font-mono text-[11.5px]",
                  s.done ? "text-accent" : "text-ink-3",
                )}
              >
                {s.at}
              </span>
              <span className="mt-1 block text-[13px] leading-snug text-ink-2">
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
