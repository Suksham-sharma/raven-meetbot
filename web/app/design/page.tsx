"use client";

import * as React from "react";
import { Button, IconButton } from "@/components/ui/button";
import { Pill, StatusFlag } from "@/components/ui/pill";
import { Field } from "@/components/ui/field";
import { Checkbox } from "@/components/ui/checkbox";
import { SpeakerName, Participants } from "@/components/raven/speaker";
import { EvidenceFootnote, type Source } from "@/components/raven/evidence";
import { MeetingCard } from "@/components/raven/meeting-card";
import {
  MeetingRow,
  DayHeading,
  type Meeting,
} from "@/components/raven/meeting-row";
import { ProposalCard, type Proposal } from "@/components/raven/proposal";
import { TaskRow, type ActionItem } from "@/components/raven/task-row";
import { FollowUps } from "@/components/raven/follow-ups";
import {
  AnswerBlock,
  Openers,
  Thinking,
} from "@/components/raven/ask-panel";
import { cn } from "@/lib/cn";
import type { Answer, Citation, OpenAction } from "@/lib/types";
import {
  EmptyState,
  Processing,
  SkeletonRow,
  Refusal,
  UngroundedNotice,
} from "@/components/raven/states";

const SECTIONS = [
  { id: "color", label: "Colour" },
  { id: "type", label: "Type" },
  { id: "space", label: "Space & radius" },
  { id: "elevation", label: "Elevation" },
  { id: "buttons", label: "Buttons" },
  { id: "inputs", label: "Inputs" },
  { id: "pills", label: "Pills & status" },
  { id: "people", label: "Speakers" },
  { id: "evidence", label: "Evidence" },
  { id: "ask", label: "Ask & answer" },
  { id: "meetings", label: "Rows & cards" },
  { id: "proposals", label: "Proposals" },
  { id: "tasks", label: "Action items" },
  { id: "states", label: "Empty & loading" },
];

export default function DesignSystem() {
  return (
    <div className="grid min-h-full grid-cols-[220px_minmax(0,1fr)]">
      <Nav />
      <main className="min-w-0 px-12 py-14">
        <header className="mb-16 max-w-[640px]">
          <p className="mb-3 text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
            Raven
          </p>
          <h1 className="mb-4 font-serif text-[40px] leading-[1.1] font-normal tracking-[-0.018em] text-balance">
            Design system
          </h1>
          <p className="text-[16px] leading-relaxed text-ink-2">
            Every component, in every state. Screens compose from this page —
            they are not drawn one at a time. Tokens are defined in{" "}
            <Code>app/globals.css</Code> and documented in <Code>DESIGN.md</Code>
            .
          </p>
        </header>

        <Color />
        <Type />
        <Space />
        <Elevation />
        <Buttons />
        <Inputs />
        <Pills />
        <People />
        <Evidence />
        <Ask />
        <Meetings />
        <Proposals />
        <Tasks />
        <States />
      </main>
    </div>
  );
}

/* ─────────────────────────── chrome ─────────────────────────── */

function Nav() {
  return (
    <aside className="sticky top-0 h-screen overflow-y-auto border-r border-rule bg-rail px-4 py-8">
      <div className="mb-7 flex items-center gap-2.5 px-3">
        <span className="size-2 rounded-full bg-accent" />
        <span className="font-serif text-[19px] font-medium tracking-[-0.02em]">
          Raven
        </span>
      </div>
      <nav className="flex flex-col gap-0.5">
        {SECTIONS.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            className="rounded-sm px-3 py-1.5 text-[13.5px] text-ink-2 transition-colors duration-150 hover:bg-card hover:text-ink-1"
          >
            {s.label}
          </a>
        ))}
      </nav>
    </aside>
  );
}

function Section({
  id,
  title,
  note,
  children,
}: {
  id: string;
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="mb-20 scroll-mt-8">
      <div className="mb-7 border-b border-rule pb-3">
        <h2 className="font-serif text-[26px] leading-tight font-normal tracking-[-0.015em]">
          {title}
        </h2>
        {note && (
          <p className="mt-1.5 max-w-[620px] text-[14px] text-ink-3">{note}</p>
        )}
      </div>
      {children}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[136px_minmax(0,1fr)] items-start gap-6 border-b border-rule-lo py-4 last:border-0">
      <span className="pt-1.5 text-[12.5px] text-ink-3">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded-xs bg-card px-1.5 py-0.5 font-mono text-[12.5px] text-ink-1">
      {children}
    </code>
  );
}

/* ─────────────────────────── sections ─────────────────────────── */

const NEUTRALS = [
  ["paper", "bg-paper", "#F8F6F1", "app ground"],
  ["rail", "bg-rail", "#F3F0E9", "nav, side rail"],
  ["card", "bg-card", "#EFECE4", "raised blocks"],
  ["sunk", "bg-sunk", "#E5E1D6", "tracks, wells"],
  ["white", "bg-white", "#FFFFFF", "quote cards only"],
];

const INKS = [
  ["ink-1", "bg-ink-1", "#23211D", "primary text"],
  ["ink-2", "bg-ink-2", "#5C574F", "secondary"],
  ["ink-3", "bg-ink-3", "#6C675F", "tertiary"],
  ["ink-4", "bg-ink-4", "#ADA79B", "NOT text — disabled, rules"],
];

const ACCENTS = [
  ["accent", "bg-accent", "#2F4A21", "primary action"],
  ["accent-hi", "bg-accent-hi", "#3D6029", "hover"],
  ["accent-tint", "bg-accent-tint", "#E9EDE2", "proposal, active line"],
  ["accent-line", "bg-accent-line", "#CBD6BD", "chip hover"],
];

const SEMANTIC = [
  ["live", "bg-live", "#A33B28", "recording, error"],
  ["warn", "bg-warn", "#8A6520", "processing"],
  ["good", "bg-good", "#2F5D3A", "executed"],
];

function Swatch({
  name,
  cls,
  hex,
  use,
}: {
  name: string;
  cls: string;
  hex: string;
  use: string;
}) {
  return (
    <div className="w-[128px]">
      <div
        className={`mb-2 h-14 rounded-md border border-rule/60 ${cls}`}
        aria-hidden="true"
      />
      <div className="font-mono text-[11.5px] text-ink-1">{name}</div>
      <div className="font-mono text-[11px] text-ink-3">{hex}</div>
      <div className="mt-0.5 text-[11.5px] text-ink-3">{use}</div>
    </div>
  );
}

function Color() {
  return (
    <Section
      id="color"
      title="Colour"
      note="Warm-biased neutrals — a pure grey reads as unconsidered. Tailwind's default palette is deleted, so bg-slate-800 is a build error."
    >
      {[
        ["Neutrals", NEUTRALS],
        ["Ink — four levels, no more", INKS],
        ["Accent — Forest", ACCENTS],
        ["Semantic — never used as an accent", SEMANTIC],
      ].map(([label, items]) => (
        <div key={label as string} className="mb-8">
          <p className="mb-3 text-[12px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
            {label as string}
          </p>
          <div className="flex flex-wrap gap-4">
            {(items as string[][]).map(([n, c, h, u]) => (
              <Swatch key={n} name={n} cls={c} hex={h} use={u} />
            ))}
          </div>
        </div>
      ))}

      <div>
        <p className="mb-3 text-[12px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
          Speaker hues — fixed lightness, hue varies only
        </p>
        <div className="flex flex-wrap gap-2">
          {[
            "Priya",
            "Marcus",
            "Jonas",
            "Sana",
            "Aditi",
            "Dev",
            "Lena",
            "Omar",
          ].map((n) => (
            <SpeakerName key={n} name={n} className="pr-4" />
          ))}
        </div>
        <p className="mt-3 max-w-[620px] text-[13px] text-ink-3">
          Assigned by hash of the name, so a person keeps their colour in every
          meeting. Never carries meaning alone — always paired with the name.
        </p>
      </div>
    </Section>
  );
}

function Type() {
  return (
    <Section
      id="type"
      title="Type"
      note="Serif is for speech. Sans is for interface. That split is semantic, not decorative — it is how a reader tells what someone said from what the system asserts."
    >
      <div className="space-y-6 border-b border-rule-lo pb-8">
        <Spec label="Page title · Newsreader 400 · 34px">
          <span className="font-serif text-[34px] leading-[1.1] tracking-[-0.018em]">
            Acme — renewal &amp; pricing
          </span>
        </Spec>
        <Spec label="Summary prose · Newsreader 300 · 18.5px/1.62">
          <span className="measure block font-serif text-[18.5px] leading-[1.62] font-light">
            Acme pushed back on the renewal number, opening at $42k against our
            $48k. Priya held the line on the grounds that discounting here sets
            the floor for the three other renewals closing this quarter.
          </span>
        </Spec>
        <Spec label="Quote · Newsreader 300 italic · 16.5px">
          <span className="measure block font-serif text-[16.5px] leading-[1.55] font-light italic">
            If we go to forty-two we&rsquo;ve set the floor for every renewal
            this quarter.
          </span>
        </Spec>
      </div>

      <div className="space-y-5 pt-8">
        <Spec label="Decision · Instrument 500 · 16.5px">
          <span className="text-[16.5px] font-medium tracking-[-0.012em]">
            Hold at $48k on a 14-month term
          </span>
        </Spec>
        <Spec label="Body · Instrument 400 · 15px">
          <span className="text-[15px]">
            Confirm what onboarding support actually costs us
          </span>
        </Spec>
        <Spec label="Meta · Instrument 400 · 13px">
          <span className="text-[13px] text-ink-3">
            Jonas · before the paperwork goes out
          </span>
        </Spec>
        <Spec label="Eyebrow · 600 · 11.5px · 0.11em">
          <span className="text-[11.5px] font-semibold tracking-[0.11em] text-ink-3 uppercase">
            Someone needs to
          </span>
        </Spec>
        <Spec label="Timecode · mono · tabular">
          <span className="font-mono text-[12px] text-accent">
            14:32 · 22:07 · 1:04:38
          </span>
        </Spec>
      </div>
    </Section>
  );
}

function Spec({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_260px] items-baseline gap-8">
      <div>{children}</div>
      <span className="font-mono text-[11.5px] text-ink-3">{label}</span>
    </div>
  );
}

function Space() {
  const steps = [4, 8, 12, 16, 24, 32, 48, 64];
  const radii = [
    ["xs", "rounded-xs", "5px"],
    ["sm", "rounded-sm", "8px"],
    ["md", "rounded-md", "11px"],
    ["lg", "rounded-lg", "14px"],
    ["xl", "rounded-xl", "18px"],
    ["full", "rounded-[999px]", "pills"],
  ];
  return (
    <Section
      id="space"
      title="Space & radius"
      note="Eight spacing steps, and no more — extra steps produce inconsistency, not flexibility. Radius varies by element on purpose; uniform radius everywhere is a tell."
    >
      <div className="mb-9 flex flex-wrap items-end gap-4">
        {steps.map((s) => (
          <div key={s} className="text-center">
            <div className="mb-1.5 bg-accent-line" style={{ width: s, height: s }} />
            <span className="font-mono text-[11px] text-ink-3">{s}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {radii.map(([n, cls, v]) => (
          <div key={n} className="w-[92px] text-center">
            <div className={`mb-2 h-14 border border-rule bg-card ${cls}`} />
            <div className="font-mono text-[11.5px] text-ink-1">{n}</div>
            <div className="font-mono text-[11px] text-ink-3">{v}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Elevation() {
  return (
    <Section
      id="elevation"
      title="Elevation"
      note="Warm-tinted shadows, never neutral black. Most separation should come from space and background shift; reach for shadow only when something genuinely floats."
    >
      <div className="flex flex-wrap gap-6">
        {[
          ["e1", "shadow-e1", "cards on hover"],
          ["e2", "shadow-e2", "popovers, menus"],
          ["e3", "shadow-e3", "modals, theater"],
        ].map(([n, cls, use]) => (
          <div key={n} className="w-[168px]">
            <div className={`mb-2.5 h-20 rounded-lg bg-white ${cls}`} />
            <div className="font-mono text-[11.5px]">{n}</div>
            <div className="text-[12px] text-ink-3">{use}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function Buttons() {
  return (
    <Section
      id="buttons"
      title="Buttons"
      note="Weights are deliberately unequal. On a proposal, Approve is solid, Edit is outline, Dismiss is text — symmetric buttons imply the choices carry equal weight, and approve is the irreversible one."
    >
      <Row label="Primary">
        <Button variant="primary">Approve</Button>
        <Button variant="primary" size="sm">
          Approve
        </Button>
        <Button variant="primary" loading>
          Filing issue
        </Button>
        <Button variant="primary" disabled>
          Approve
        </Button>
      </Row>
      <Row label="Secondary">
        <Button variant="secondary">Edit first</Button>
        <Button variant="secondary" size="sm">
          Edit first
        </Button>
        <Button variant="secondary" disabled>
          Edit first
        </Button>
      </Row>
      <Row label="Ghost / quiet">
        <Button variant="ghost">Show all 214 turns</Button>
        <Button variant="quiet">Not this one</Button>
      </Row>
      <Row label="Danger">
        <Button variant="danger">Delete recording</Button>
      </Row>
      <Row label="Icon">
        <IconButton aria-label="Play">
          <svg viewBox="0 0 9 10" className="size-2.5" fill="currentColor">
            <path d="M.5.5 8.5 5 .5 9.5z" />
          </svg>
        </IconButton>
        <IconButton aria-label="More" variant="secondary">
          <svg viewBox="0 0 16 16" className="size-4" fill="currentColor">
            <circle cx="3" cy="8" r="1.4" />
            <circle cx="8" cy="8" r="1.4" />
            <circle cx="13" cy="8" r="1.4" />
          </svg>
        </IconButton>
      </Row>
      <Row label="In context">
        <div className="flex w-full items-center gap-2 rounded-xl bg-accent-tint p-4">
          <Button variant="primary">Approve</Button>
          <Button variant="secondary">Edit first</Button>
          <Button variant="quiet" className="ml-auto">
            Not this one
          </Button>
        </div>
      </Row>
    </Section>
  );
}

function Inputs() {
  const [checked, setChecked] = React.useState(true);
  return (
    <Section
      id="inputs"
      title="Inputs"
      note="Labels stay visible when the field has content — placeholder-as-label is forbidden, because the label vanishes exactly when the user needs to check what they typed."
    >
      <div className="grid max-w-[760px] grid-cols-2 gap-x-8 gap-y-6">
        <Field label="Meeting title" placeholder="Add a title" />
        <Field
          label="Email"
          defaultValue="priya@acme.com"
          hint="Used to match you to meeting participants"
        />
        <Field
          label="Password"
          type="password"
          defaultValue="short"
          error="Needs at least 8 characters"
        />
        <Field label="Bot name" defaultValue="Raven" disabled />
        <Field
          pill
          placeholder="Ask anything about this meeting"
          icon={
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="7" cy="7" r="4.75" />
              <path d="M10.5 10.5 14 14" />
            </svg>
          }
        />
        <Field
          pill
          placeholder="Find in this transcript"
          icon={
            <svg
              viewBox="0 0 16 16"
              className="size-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <circle cx="7" cy="7" r="4.75" />
              <path d="M10.5 10.5 14 14" />
            </svg>
          }
        />
      </div>

      <div className="mt-8 flex items-center gap-8 border-t border-rule-lo pt-6">
        <label className="flex items-center gap-2.5 text-[14px]">
          <Checkbox checked={checked} onCheckedChange={setChecked} />
          Checked
        </label>
        <label className="flex items-center gap-2.5 text-[14px]">
          <Checkbox />
          Unchecked
        </label>
        <label className="flex items-center gap-2.5 text-[14px] opacity-60">
          <Checkbox disabled />
          Disabled
        </label>
      </div>
    </Section>
  );
}

function Pills() {
  return (
    <Section
      id="pills"
      title="Pills & status"
      note="Status is exception-only. A meeting that processed normally shows nothing at all — putting a Ready badge on thirty rows is pure noise. Only four states are allowed to speak."
    >
      <Row label="Tones">
        <Pill>Today, 15:00</Pill>
        <Pill tone="accent">1 waiting on you</Pill>
        <Pill tone="live">Recording</Pill>
        <Pill tone="warn">Processing</Pill>
        <Pill tone="good">Filed ENG-4417</Pill>
        <Pill tone="bare">42 min</Pill>
      </Row>
      <Row label="Meeting states">
        <StatusFlag state="recording" />
        <StatusFlag state="waiting" />
        <StatusFlag state="processing" />
        <StatusFlag state="failed" detail="Host removed the bot" />
      </Row>
      <Row label="Normal meeting">
        <span className="text-[13px] text-ink-3">
          renders nothing —{" "}
          <span className="font-mono text-[12px]">{`<StatusFlag state="ok" />`}</span>{" "}
          returns null
        </span>
      </Row>
    </Section>
  );
}

function People() {
  return (
    <Section
      id="people"
      title="Speakers"
      note="A speaker is their name, and that is the whole component. Three devices were tried and cut: circles-with-initials (the generic SaaS pattern), a 3px colour bar (indistinguishable at that size), and the eight-hue palette that justified it (its only consumer, the timeline ribbon, was clutter). Nothing needed colour once names were written out."
    >
      <Row label="Name">
        <SpeakerName name="Priya" />
        <SpeakerName name="Marcus" />
        <SpeakerName name="Jonas" />
        <SpeakerName name="Sana" />
      </Row>
      <Row label="Participants">
        <span className="text-[13px] text-ink-3">
          <Participants names={["Priya", "Marcus", "Jonas", "Sana"]} />
        </span>
      </Row>
      <Row label="Many">
        <span className="text-[13px] text-ink-3">
          <Participants
            names={["Marcus", "Sana", "Aditi", "Dev", "Lena", "Omar"]}
          />
        </span>
      </Row>
    </Section>
  );
}

const SOURCES: Source[] = [
  {
    speaker: "Priya",
    at: 872,
    clipLength: 22,
    quote:
      "If we go to forty-two we've set the floor for every renewal this quarter. I'd rather hold at forty-eight and give them the longer term.",
  },
  {
    speaker: "Marcus",
    at: 1327,
    clipLength: 14,
    quote:
      "Fine — forty-eight. But onboarding support has to be in the package, or they'll churn in month three.",
  },
  {
    speaker: "Jonas",
    at: 2415,
    clipLength: 9,
    quote:
      "Firm on the number, soft on the timeline. That's usually where there's room.",
  },
  {
    speaker: "Sana",
    at: 904,
    clipLength: 12,
    quote:
      "Fourteen months instead of twelve pushes the next negotiation past the pricing change.",
  },
];

function Evidence() {
  return (
    <Section
      id="evidence"
      title="Evidence"
      note="A footnote. The answer reads clean and evidence unfolds only when someone asks for it, so verification is available rather than insisted upon. A bordered card was tried first and cut: a box around a quote asserts the quote is an object in its own right, which hands a fallible retrieval result more standing than it has earned."
    >
      <div className="grid gap-12">
        <div>
          <Label>Collapsed — click a chip</Label>
          <EvidenceFootnote sources={SOURCES.slice(0, 2)}>
            You held at $48k on a 14-month term rather than discounting to $42k,
            on the condition that onboarding support is bundled into the package.
          </EvidenceFootnote>
        </div>

        <div>
          <Label>Several sources</Label>
          <EvidenceFootnote sources={SOURCES}>
            Acme opened at $42k and the team held at $48k, trading the discount
            for a longer term and bundled onboarding support.
          </EvidenceFootnote>
        </div>
      </div>
    </Section>
  );
}

/* ─────────────────────────── ask ─────────────────────────── */

const CORPUS = "34 meetings · 3 Jan – 3 Aug";

// Same four moments as the Evidence section above, in the shape the API
// actually returns them — AnswerBlock maps them to Sources itself.
const CITATIONS: Citation[] = SOURCES.slice(0, 3).map((s) => ({
  meetingId: "acme_2026-08-03_15-00-00",
  start_s: s.at,
  end_s: s.at + (s.clipLength ?? 10),
  speaker: s.speaker,
  text: s.quote,
  recordingUrl: `acme_2026-08-03_15-00-00.webm#t=${s.at}`,
}));

const ANSWERED: Answer = {
  answer:
    "You held at $48k rather than dropping to $42k, and traded the discount for a longer term — fourteen months instead of twelve, which pushes the next negotiation past the pricing change. Onboarding support was folded into the package as the condition for holding the number.",
  citations: CITATIONS,
  grounded: true,
  refused: false,
  retrieved_meetings: ["acme_2026-08-03_15-00-00"],
  iterations: 3,
};

// No chips, because that is what ungrounded means: nothing resolved to a
// moment. An answer that hedges and then offers three sources is telling the
// user two different things.
const HEDGED: Answer = {
  ...ANSWERED,
  answer:
    "The team seemed broadly aligned on holding the price, though the exact term length was still being debated when the call ended.",
  citations: [],
  grounded: false,
};

const REFUSED: Answer = {
  ...ANSWERED,
  answer: "I couldn't find that in your meetings.",
  citations: [],
  retrieved_meetings: [],
  refused: true,
};

/**
 * The rail at 360px, which is the only width this is ever seen at. Rendering it
 * wide would flatter it — the answer has to hold up in a column narrower than
 * the document it sits beside, and the citation chips have to wrap without
 * shredding the last line.
 */
function Rail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="w-[360px] rounded-lg border border-rule-lo bg-rail px-7 py-8">
        {children}
      </div>
    </div>
  );
}

function Ask() {
  return (
    <Section
      id="ask"
      title="Ask & answer"
      note="One question, one answer, no thread — /ask is stateless, so this must never look like a chat. The answer is prose in serif because it is built from what people said; the chips under it are the only way to check it, and they unfold in place rather than navigating away."
    >
      <div className="flex flex-wrap items-start gap-8">
        <Rail label="At rest">
          <AskHeader />
          <AskBox />
          <Openers onPick={() => {}} />
        </Rail>

        <Rail label="Working — 3 to 40 seconds">
          <AskHeader />
          <AskBox value="What did we settle on for Acme's pricing?" />
          <div className="mt-6">
            <Thinking from={1} />
          </div>
        </Rail>

        <Rail label="Answered">
          <AskHeader />
          <AskBox value="What did we settle on for Acme's pricing?" />
          <div className="mt-6">
            <AnswerBlock
              answer={ANSWERED}
              query="What did we settle on for Acme's pricing?"
              corpus={CORPUS}
            />
          </div>
        </Rail>

        <Rail label="Answered, but nothing to cite">
          <AskHeader />
          <AskBox value="How did the room feel about the number?" />
          <div className="mt-6">
            <AnswerBlock
              answer={HEDGED}
              query="How did the room feel about the number?"
              corpus={CORPUS}
            />
          </div>
        </Rail>

        <Rail label="Nothing matched — still a 200">
          <AskHeader />
          <AskBox value="Acme's renewal date" />
          <div className="mt-6">
            <AnswerBlock
              answer={REFUSED}
              query="Acme's renewal date"
              corpus={CORPUS}
            />
          </div>
        </Rail>
      </div>

      <p className="mt-8 max-w-[620px] text-[12.5px] text-ink-3">
        Citations carry no position in the response — the server strips the
        <Code>[[meeting@sec]]</Code> markers before it returns — so inline
        numbered chips are impossible without a server change. They sit at the
        end of the answer instead, naming a person and a moment rather than a
        number.
      </p>
    </Section>
  );
}

/* Chrome copied from AskPanel's own header and box, because those two are
   welded to the live mutation and there is nothing to fixture them with. Kept
   deliberately thin — everything below the box is the real component. */
function AskHeader() {
  return (
    <header className="mb-5">
      <h2 className="font-serif text-[23px] leading-tight tracking-[-0.014em]">
        Ask across everything
      </h2>
      <p className="mt-1 text-[12.5px] text-ink-3">{CORPUS}</p>
    </header>
  );
}

function AskBox({ value }: { value?: string }) {
  return (
    <div className="rounded-lg border border-field bg-paper px-4 pt-3.5 pb-3">
      <p
        className={cn(
          "font-serif text-[17px] leading-[1.5] font-light",
          value ? "text-ink-1" : "text-ink-3",
        )}
      >
        {value ?? "Ask about anything that was said…"}
      </p>
      <div className="mt-2 flex items-center justify-between">
        <span className="text-[11.5px] text-ink-3">Enter to ask</span>
        <Button variant="primary" size="sm">
          Ask
        </Button>
      </div>
    </div>
  );
}

/* ─────────────────────────── domain ─────────────────────────── */

const MEETINGS: Meeting[] = [
  {
    id: "acme_2026-08-03_15-00-00",
    title: "Acme — renewal & pricing",
    startedAt: "2026-08-03T15:00:00",
    durationS: 2530,
    participants: ["Priya", "Marcus", "Jonas", "Sana"],
    state: "recording",
  },
  {
    id: "eng_2026-08-03_10-00-00",
    title: "Weekly eng sync",
    startedAt: "2026-08-03T10:00:00",
    durationS: 3130,
    participants: ["Marcus", "Sana", "Aditi", "Dev", "Lena", "Omar"],
    state: "ok",
  },
  {
    id: "kdz-mrqa-fhi_2026-08-02_15-00-00",
    title: null,
    startedAt: "2026-08-02T15:00:00",
    durationS: 1865,
    participants: ["Dev", "Jonas", "Sana"],
    state: "processing",
  },
  {
    id: "screen_2026-08-02_11-00-00",
    title: "Candidate screen — staff backend",
    startedAt: "2026-08-02T11:00:00",
    durationS: 251,
    participants: ["Marcus", "Sana"],
    state: "failed",
    stateDetail: "Host removed the bot",
  },
];

function Meetings() {
  const [sel, setSel] = React.useState(1);
  return (
    <Section
      id="meetings"
      title="Rows & cards"
      note="Two components answering different questions. A row answers 'which of my 34 meetings is the one I mean?' — dense, title-led, you travel through it. A card answers 'what happened here, is it worth opening?' — it gives the recording presence and shows a line of summary, at roughly 4x the vertical cost. Cards for a handful on a home surface; rows for the archive."
    >
      <div className="mb-12 max-w-[680px]">
        <Label>Row — dense, scannable</Label>
        <DayHeading>Today</DayHeading>
        {MEETINGS.slice(0, 2).map((m, i) => (
          <MeetingRow
            key={m.id}
            meeting={m}
            selected={sel === i}
            onClick={() => setSel(i)}
          />
        ))}
        <DayHeading>Yesterday</DayHeading>
        {MEETINGS.slice(2).map((m, i) => (
          <MeetingRow
            key={m.id}
            meeting={m}
            selected={sel === i + 2}
            onClick={() => setSel(i + 2)}
          />
        ))}
        <p className="mt-4 text-[12.5px] text-ink-3">
          Three of these four say nothing about their state, because nothing is
          wrong with them. Row three has no title — the backend leaves it null
          for every real meeting, so it falls back to a date, never the raw id.
        </p>
      </div>

      <div>
        <Label>Card — browsing, few items</Label>
        <div className="grid max-w-[760px] grid-cols-3 gap-4">
          <MeetingCard meeting={MEETINGS[1]} />
          <MeetingCard meeting={MEETINGS[0]} />
          <MeetingCard meeting={MEETINGS[2]} />
        </div>
      </div>
    </Section>
  );
}

const BASE_PROPOSAL: Proposal = {
  id: 1,
  kind: "linear_issue",
  title: "Add onboarding support to the Acme renewal package",
  target: "ENG",
  owner: "Marcus",
  due: "before signature",
  reason: "Assigned to Marcus, due before signature",
  evidenceSpeaker: "Marcus",
  evidenceAt: 1327,
  status: "proposed",
};

function Proposals() {
  return (
    <Section
      id="proposals"
      title="Proposals"
      note="Renders as the artifact it will become, not a description of it. Every status the ledger can hold — and failed is retryable, because the server permits re-approving it."
    >
      <div className="grid max-w-[560px] gap-4">
        <ProposalCard proposal={BASE_PROPOSAL} />
        <ProposalCard
          proposal={{ ...BASE_PROPOSAL, status: "executing" }}
          onCancel={() => {}}
        />
        <ProposalCard
          proposal={{
            ...BASE_PROPOSAL,
            status: "executed",
            result: { externalId: "ENG-4417", url: "#" },
          }}
        />
        <ProposalCard
          proposal={{
            ...BASE_PROPOSAL,
            status: "failed",
            result: {
              error:
                "Linear rejected the request: no API key configured for this workspace.",
            },
          }}
        />
        <ProposalCard proposal={{ ...BASE_PROPOSAL, status: "rejected" }} />
      </div>
    </Section>
  );
}

const TASKS: ActionItem[] = [
  {
    id: 1,
    text: "Confirm what onboarding support actually costs us",
    owner: "Jonas",
    due: "before the paperwork goes out",
    at: 1455,
  },
  {
    id: 2,
    text: "Send Acme the revised quote at $48k / 14 months",
    owner: null,
    due: "this week",
    at: 2282,
    mine: true,
  },
  {
    id: 3,
    text: "Warn the other three renewals we're not discounting this quarter",
    owner: "Marcus",
    due: null,
    at: 2444,
    done: true,
  },
];

function Tasks() {
  const [items, setItems] = React.useState(TASKS);
  const [commitments, setCommitments] = React.useState(COMMITMENTS);
  return (
    <Section
      id="tasks"
      title="Action items"
      note="`due` is free text as spoken — 'before the paperwork goes out', not a date. Never parse it. Note the backend has no completed column, so the checkbox currently has nowhere to persist."
    >
      <div className="mb-12 max-w-[620px]">
        <Label>In a meeting — checkable</Label>
        {items.map((t) => (
          <TaskRow
            key={t.id}
            item={t}
            onToggle={(v) =>
              setItems((prev) =>
                prev.map((p) => (p.id === t.id ? { ...p, done: v } : p)),
              )
            }
          />
        ))}
      </div>

      <div className="max-w-[360px] bg-rail p-6">
        <Label>Across every meeting — the home rail</Label>
        <FollowUps
          items={commitments}
          me="Marco Reyes"
          onOpen={() => {}}
          onToggle={(item, completed) =>
            setCommitments((prev) =>
              prev.map((c) =>
                c.id === item.id
                  ? {
                      ...c,
                      completed_at: completed ? new Date().toISOString() : null,
                    }
                  : c,
              ),
            )
          }
        />
        <p className="mt-5 text-[12.5px] text-ink-3">
          Split on the owner, because &ldquo;what do I have to do&rdquo; and
          &ldquo;what did the team commit to&rdquo; are different questions and
          only the first is a task list — so the second one starts shut. A row
          is one line and, when there is one, the date as it was spoken; the
          meeting, the speaker and the quote sit one click under it, because an
          action item with no visible provenance is just a to-do and the claim
          of this product is that every one traces to a person saying it at a
          time. One open at a time, same as a citation. The checkbox persists
          now — <Code>action_items.completed_at</Code>, carried across
          re-ingest on the evidence quote so a re-run cannot untick your work.
        </p>
      </div>
    </Section>
  );
}

const COMMITMENTS: OpenAction[] = [
  {
    id: 1,
    text: "send over the annual contract",
    owner: "Marco",
    due: "by Thursday",
    evidence_quote: "I can send over the annual contract for you guys to sign.",
    speaker: "Marco",
    start_s: 462.1,
    end_s: 470,
    meeting_id: "acme_2026-08-03_15-00-00",
    meeting_title: "Acme — renewal & pricing",
    meeting_started_at: "2026-08-03T15:00:00",
    completed_at: null,
  },
  {
    id: 2,
    text: "schedule the kickoff for SSO/SAML integration",
    owner: "Dana",
    due: "next week",
    evidence_quote: "I can schedule the kickoff for next week.",
    speaker: "Dana",
    start_s: 486.7,
    end_s: 491.7,
    meeting_id: "acme_2026-08-03_15-00-00",
    meeting_title: "Acme — renewal & pricing",
    meeting_started_at: "2026-08-03T15:00:00",
    completed_at: null,
  },
  {
    id: 3,
    text: "check whether the ingest worker is dropping recordings over 90 minutes",
    owner: "Aditi",
    due: null,
    evidence_quote: "Anything over ninety minutes just never shows up.",
    speaker: "Lena",
    start_s: 1204.5,
    end_s: 1209.2,
    meeting_id: "eng_2026-08-03_10-00-00",
    meeting_title: "Weekly eng sync",
    meeting_started_at: "2026-08-03T10:00:00",
    completed_at: null,
  },
  {
    id: 4,
    text: "write up the SOC 2 answers for procurement",
    owner: "Marco",
    due: "before the paperwork goes out",
    evidence_quote: "I'll write up the SOC 2 answers before the paperwork goes out.",
    speaker: "Marco",
    start_s: 1712.4,
    end_s: 1718.9,
    meeting_id: "acme_2026-08-03_15-00-00",
    meeting_title: "Acme — renewal & pricing",
    meeting_started_at: "2026-08-03T15:00:00",
    completed_at: null,
  },
  {
    id: 5,
    text: "pull the churn numbers for the board deck",
    owner: "Priya",
    due: "Monday",
    evidence_quote: "I can pull the churn numbers for the board deck by Monday.",
    speaker: "Priya",
    start_s: 288.2,
    end_s: 294.6,
    meeting_id: "eng_2026-08-03_10-00-00",
    meeting_title: "Weekly eng sync",
    meeting_started_at: "2026-08-03T10:00:00",
    completed_at: null,
  },
  {
    id: 6,
    text: "get the revised quote in front of legal",
    owner: "Dana",
    due: null,
    evidence_quote: "Let me get the revised quote in front of legal.",
    speaker: "Dana",
    start_s: 2203.7,
    end_s: 2208.1,
    meeting_id: "acme_2026-08-03_15-00-00",
    meeting_title: "Acme — renewal & pricing",
    meeting_started_at: "2026-08-03T15:00:00",
    completed_at: null,
  },
  {
    id: 7,
    text: "confirm the Okta tenant is on the enterprise plan",
    owner: "Raj",
    due: "this week",
    evidence_quote: "I'll confirm the Okta tenant is on the enterprise plan.",
    speaker: "Raj",
    start_s: 934.8,
    end_s: 940.2,
    meeting_id: "acme_2026-08-03_15-00-00",
    meeting_title: "Acme — renewal & pricing",
    meeting_started_at: "2026-08-03T15:00:00",
    completed_at: null,
  },
];

function States() {
  return (
    <Section
      id="states"
      title="Empty & loading"
      note="Neutral, never errors. No red, no warning triangle, no sad illustration — a refusal styled like an error reads as a bug rather than an honest answer."
    >
      <div className="grid max-w-[680px] gap-10">
        <div>
          <Label>Processing — honestly indeterminate</Label>
          <div className="grid gap-2.5">
            <Processing />
            <Processing late />
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-3">
            No progress bar, because there is no progress signal to render.
            Neutral for the normal case — it is the happy path after every call,
            and amber for ten minutes a meeting is not calm. The second one is
            past 15 minutes, which is the state that has actually gone wrong.
          </p>
        </div>

        <div>
          <Label>Loading — shape-matched skeletons</Label>
          <div className="rounded-md border border-rule-lo">
            <SkeletonRow />
            <SkeletonRow />
            <SkeletonRow />
          </div>
          <p className="mt-2.5 text-[12.5px] text-ink-3">
            Matches MeetingRow: thumbnail left, title and one meta line right. A
            skeleton shaped like a different component is worse than none.
          </p>
        </div>

        <div>
          <Label>Refusal — served as HTTP 200</Label>
          <Refusal
            query="Acme's renewal date"
            searched="Searched 34 meetings, 3 Jan – 3 Aug"
            actions={[
              { label: "Search all time", onClick: () => {} },
              { label: "Ask something else", onClick: () => {} },
            ]}
          />
        </div>

        <div>
          <Label>Ungrounded answer</Label>
          <p className="measure font-serif text-[16.5px] leading-[1.62] font-light">
            The team seemed broadly aligned on holding the price, though the
            exact term length was still being debated.
          </p>
          <UngroundedNotice />
        </div>

        <div>
          <Label>Nothing here yet</Label>
          <EmptyState
            title="No meetings yet"
            body="Invite Raven to a Google Meet call and it will join, record, and remember it. You can explore a sample meeting first if you'd rather see it working."
            action={{ label: "Open a sample meeting" }}
            boundary="Raven joins as a visible participant. Everyone in the call can see it."
          />
        </div>
      </div>
    </Section>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11.5px] font-semibold tracking-[0.09em] text-ink-3 uppercase">
      {children}
    </p>
  );
}
