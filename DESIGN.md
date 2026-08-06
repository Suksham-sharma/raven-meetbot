# Raven — Design System

The source of truth for every visual and interaction decision in Raven's UI.
Read this before writing any component, screen, or style.

---

## 1. What Raven is, in one line

A meeting bot that records your calls, remembers them across time, and answers
questions with evidence you can play back.

**The atomic unit of this product is the moment** — a speaker, a timestamp, a
quote, a playable clip. Not the meeting. Cross-meeting memory is the product; a
meeting is just where a moment happens to live.

Everything below follows from that.

---

## 2. Aesthetic direction

**An archive you interrogate, not a dashboard you monitor.**

Warm, light, roomy, document-like. The product holds a permanent record of what
people said, so it should feel closer to a well-set book than to an analytics
console. Calm is a functional requirement, not a mood: users open Raven to catch
up on something they missed, often while behind.

Four commitments:

- **Light-first.** Not dark. The primary surfaces (summary, decisions, ask) are
  reading surfaces. Dark mode may ship later; it is not the design order.
- **Warm neutrals, never cool grey.** Every neutral carries a warm hue bias.
  Cool blue-greys read as unfinished SaaS default.
- **Space over lines.** Regions separate by whitespace and background shift,
  not by borders. When in doubt, delete the border.
- **Texture only where there is nothing to read.** Paper grain and painted
  plates belong on auth, empty states and marketing — surfaces that are mostly
  void and briefly read. Never behind the document column, transcript or list
  rows: at body sizes the grain sits at the same spatial frequency as glyph
  antialiasing and the type reads as slightly out of focus. What carries the
  look between screens is the warm ground, the accent and serif-for-speech —
  not the fibre.

### Deliberate departures from the category

Granola, Fathom, Otter and Fireflies all converge on a clean-neutral look with a
notes-or-video hero. Raven departs in three places, on purpose:

1. **Evidence is a card that plays in place**, never a link that navigates away.
   Research on citation UI found source cards beat inline citations, and both beat
   bottom-of-answer lists.
2. **A citation names a person, not a number.** `Priya · 14:32`, never `[3]`.
   Numbered chips are for citing anonymous web pages; ours cite a human at a moment.
3. **Agent actions are human-gated and shown as the artifact they will become.**
   Circleback ships connector writes with no approval step. That gap is our surface.

---

## 3. Color

All values are the shipping tokens. Do not introduce colors outside this list.

### Neutrals — warm-biased

| Token | Hex | Use |
|---|---|---|
| `--paper` | `#FDFCF9` | App background, the ground everything sits on |
| `--rail` | `#F8F6F1` | Nav and side rail — a half-step down from paper |
| `--card` | `#F4F2EC` | Raised blocks: summary, tab chips |
| `--card-2` | `#EAE7DE` | Sunken elements: track backgrounds, avatars |
| `--white` | `#FFFFFF` | Quote cards only — the one true white |
| `--rule` | `#E4E0D6` | Borders that should be seen |
| `--rule-lo` | `#EDEAE2` | Row dividers that should barely register |

### Ink — three text levels, plus one that is not text

| Token | Hex | On paper | Use |
|---|---|---|---|
| `--ink-1` | `#23211D` | 15.7:1 | Primary text, headings, quotes |
| `--ink-2` | `#5C574F` | 6.98:1 | Secondary text, speaker names, metadata |
| `--ink-3` | `#6C675F` | 5.44:1 | Tertiary — timestamps, inactive tabs, the quietest text we ship |
| `--ink-4` | `#ADA79B` | 2.33:1 | **Never text.** Disabled controls, rules, decorative marks only |

Hierarchy comes from these plus weight and space. **Never from boxes.**

**Why four text levels became three.** The original scale had `--ink-3` at
`#8B857A` (3.57:1 on paper) and `--ink-4` at `#ADA79B` (2.33:1), and §9 asked for
both to be verified against every ground. They failed all of them — worst case
`--ink-4` on `--card-2` is 1.93:1, under even the 3:1 floor for UI boundaries.

The fix is not a nudge, because solving each for 4.5:1 lands `--ink-3` at
`#79746B` and `--ink-4` at `#78746C`. **They converge.** Four legible steps do not
fit between `#23211D` and a near-white ground; the scale was over-subdivided.

So `--ink-3` moved down to `#6C675F`, which clears 4.5:1 on `--paper`, `--rail`,
`--card` *and* `--card-2`, and `--ink-4` stopped being a text colour. WCAG 2.2
exempts inactive controls from contrast (1.4.3), which is the one job it keeps.
Anything a user is meant to *read* — including placeholders, boundary lines, and
metadata — is `--ink-3` or darker.

The trap this closes: the quietest text in the product was carrying the copy that
matters most when it appears — the search boundary on a refusal, and the notice
that Raven joins as a visible participant. A privacy disclosure set at 2.33:1 is
not a style problem.

### Accent — Forest

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#2F4A21` | Primary buttons, active state, timestamps, playhead |
| `--accent-tint` | `#E9EDE2` | Proposal blocks, active transcript line, badge fills |
| `--accent-ink` | `#FBFDF7` | Text on solid accent |

Deep and desaturated so it can sit next to warm neutrals without shouting. Used
sparingly — accent means *interactive, current, or evidence*. Nothing decorative
takes accent.

Alternates, if the brand shifts (change three tokens, nothing else):
Ink `#1F3348` / `#E5EAF0` / `#F8FBFE` — Rust `#6E3418` / `#F3E8E1` / `#FEFAF7`

### There is no speaker color system

An eight-hue palette lived here, hash-assigned so a person kept their color
across meetings. It existed to feed a timeline ribbon on the scrubber. The ribbon
was cut for clutter, and once names are written out everywhere a speaker appears,
nothing else needed color.

The tokens went with it. A palette that outlives its only consumer is how a
design system rots — someone finds the hues later and invents a use for them.

**A speaker is their name.** Avatars were tried and cut twice: circles with
initials are the generic SaaS pattern and are illegible at 20px, and the 3px
color bar that replaced them was indistinguishable across eight hues. If a future
surface genuinely needs to tell people apart without naming them, re-add the
scale then, with that surface as the justification.

---

## 4. Typography

Two families, each with a job. **The split is semantic, not decorative.**

| Role | Family | Why |
|---|---|---|
| Display, quotes, transcript, summary prose | **Newsreader** (OFL) | Anything a human *said* or that is meant to be *read* |
| Interface — labels, buttons, nav, metadata | **Instrument Sans** (OFL) | Anything the *system* says |
| Timestamps, IDs, durations | system mono, `tabular-nums` | Digits must align in columns |

**Speech is set in serif; interface is set in sans.** That is the rule. A quote
should be visually distinguishable from UI chrome without any border or icon —
this is Raven's version of Granola's black/grey provenance convention, and it maps
onto the product's core promise: what was *said* versus what the system *asserts*.

Both faces are free (OFL) and self-hosted. Licensing a distinctive pair before
launch is planned; because every size lives in a token, the swap is a token change,
not a layout rewrite.

### Scale

| Use | Size / weight | Notes |
|---|---|---|
| Page title | 34px Newsreader 400 | `-0.018em`, `text-wrap: balance` |
| Proposal title | 21px Newsreader 400 | `-0.012em` |
| Summary prose | 18.5px Newsreader 300 | line-height 1.62 |
| Quote / transcript turn | 16.5px Newsreader 300 | italic for quotes only |
| Decision statement | 16.5px Instrument Sans 500 | |
| Body / task | 15px Instrument Sans 400 | line-height 1.6 |
| Metadata, facts | 13px Instrument Sans 400 | |
| Section eyebrow | 11.5px 600 | uppercase, `0.11em` tracking |
| Timestamps | 11–12px mono | always `tabular-nums` |

Reading measure caps at **700px** regardless of column width. A wider column
grows the gutter, never the line.

---

## 5. Layout and hierarchy

### Ranked by how often a user needs it

1. **What happened** — summary, decisions, actions. Every visit.
2. **What I have to do** — my action items.
3. **Show me where that was said** — jump to a moment, play it. The thesis.
4. **Approve or kill an agent proposal** — blocking, intermittent.
5. **Read the whole transcript** — rare, enormous.

Space follows that ranking. Frequency earns real estate; volume does not.

### Full-viewport, three zones

```
┌─────────┬───────────────────────────┬──────────────────┐
│  nav    │ title + facts + tabs      │  recording       │  pinned,
│  232px  ├───────────────────────────┤  chapters        │  never scrolls
│         │ summary · decided ·       │                  │  away
│  fixed  │ proposals · actions       ├──────────────────┤
│         │        (scrolls)          │  ask, scoped     │
└─────────┴───────────────────────────┴──────────────────┘
   232px        fluid, text ≤700px          420px
```

Each region scrolls independently. The page itself never scrolls — this is an
app, not a document.

Breakpoints: `1280px` → rail 360, nav 200. `1040px` → nav collapses to icons,
rail drops, page reverts to normal scroll.

### Why the video is pinned, not a hero

As a top hero it scrolls away exactly when the user starts clicking quotes,
breaking the single most important interaction in the product. Pinned in the rail
it stays seekable while reading. The cost is permanent screen space, which is the
right price for something this central.

A 420px player cannot render a shared slide or code, so the pinned player is the
**companion** size and expands to **theater** on demand. Screen-share content
exists nowhere but the video — never make it unreadable.

### Density regimes

Three, and they do not share a spacing scale:

- **Nav** — compact, quiet, cheap to scan.
- **Document column** — comfortable. This is read continuously; resist densifying it.
- **Rail** — compact, must not compete with the column.

Spacing scale, 4px base, eight steps only: `4 8 12 16 24 32 48 64`.

### Radii

`999px` pills and buttons · `18px` large blocks · `13px` media and quote cards ·
`11px` list items · `8px` nav items. **Uniform radius everywhere is a tell** —
inputs and cards must not match.

---

## 6. Interaction and motion

Motion is restrained by rule, not by taste.

- **Frequency governs whether a thing animates at all.** Anything touched 100+
  times a session (transcript rows, list rows) gets color change only — no
  transform, no movement.
- Durations: **120–160ms** for state change, **160–220ms** for layout.
- Easing: `ease-out` in, `ease-in` out. **Never bounce or elastic** — reads dated.
- Never `scale(0)`; start at `scale(0.95)` with opacity.
- Press states: `transform: scale(0.97)` on `:active` for buttons only.
- Everything behind `prefers-reduced-motion: reduce`.

Focus is always visible, via `:focus-visible` so mouse users never see rings.
Never `opacity: 0` to hide a control — it stays focusable. Use `display: none`.

---

## 7. Component conventions

**Status is exception-only.** A meeting that processed normally displays no
status at all. Only recording, still-processing, and failed states speak. Do not
render a "Ready" badge on thirty rows.

**Processing is not a warning.** "Working out who said what" is the happy path
for the first 2–10 minutes after *every* call, so it takes a neutral tone. Amber
is reserved for the case that has actually gone wrong — past ~15 minutes, where
the copy changes to "This is taking longer than usual." Colouring the normal
post-meeting state as caution turns every finished meeting amber for ten minutes,
in a product whose first commitment is that calm is functional.

**Evidence is a footnote.** A citation chip sits at the end of the answer,
naming a person and a moment — `Priya · 14:32`, never `[3]`. Clicking it unfolds
that quote directly beneath, with a play control. One open at a time.

The reasoning: a box around a quote asserts the quote is an object in its own
right, which hands a fallible retrieval result more standing than it has earned.
A footnote makes verification *available* rather than insisting on it, and a
wrong citation stays collapsed where it does the least damage.

Two alternatives were built and cut. Both are recoverable from this note if the
footnote proves too quiet in use:

- **Margin** — a boxless pull-quote with attribution set small beneath, treating
  evidence as part of the same document rather than an object inside it. Most
  distinctive of the three. Cut because it does not scale: three or more quotes
  turn an answer into a wall of serif, and the playable affordance is weak.
- **Log** — a fixed timecode column, speaker, then what they said, like reading
  the transcript filtered to what mattered. Scales to any number of sources. Cut
  because it reads as a developer tool rather than a consumer product.

Evidence never navigates away. It plays in place.

**Meeting row vs meeting card.** Different questions, so both exist.
A **row** answers *"which of my 34 meetings is the one I mean?"* — dense,
title-led, travelled through. A **card** answers *"what happened here, is it
worth opening?"* — gives the recording presence and shows a line of summary, at
roughly 4× the vertical cost. Cards for a handful on a home surface; rows for
the archive. Both carry a video thumbnail with duration as an overlay badge,
which keeps duration out of the metadata line.

**Agent proposal.** Renders as the artifact it will become — a Linear issue looks
like a Linear issue, with its fields inline-editable. Three actions, deliberately
unequal: `Approve` (solid) · `Edit first` (outline) · `Not this one` (text, pushed
right). Symmetric approve/reject buttons imply equal weight; they are not equal.

Provenance ("because of what he said at 22:07") is carried at **every** status,
not just while the proposal is pending. It matters most after the fact: "why did
Raven file this?" is a question you ask about the thing that already got filed. On
a settled card it drops to `--ink-2` rather than disappearing.

The card speaks in the tense it is in. "Raven wants to file…" is correct while
`proposed`; once the action is `executed` or `rejected` it reads as past, because
the decision has been made. A settled card still offering to do the thing it
already did reads as a stuck UI.

**Plain language over system labels.** Section headings read
"What happened", "Decided", "Someone needs to", "Raven would like to",
"Everything said" — not "Summary / Decisions / Action Items / Agent Actions /
Transcript". Buttons say what happens.

**Empty and refusal states are neutral, never errors.** No red, no warning
triangle, no sad illustration. Reflect the query back, state the search boundary
("Searched 34 meetings, Jan 3 – Jul 28"), and offer the next move. A refusal
styled like an error reads as a bug.

---

## 8. Do not

These are the specific tells of generated UI. All are forbidden.

- Purple / indigo / violet anything, and gradient heroes
- The three-column icon-in-a-circle feature grid
- Colored left-border accent bars on cards (`border-left: 3px solid`)
- Cards nested inside cards
- Glassmorphism, except on player chrome floating over moving video
- Emoji used as icons
- Uniform large border-radius on every element
- Bounce or elastic easing
- `system-ui` / `-apple-system` as the primary display or body face
- Inter, or Space Grotesk as the "safe alternative" to Inter
- Centering everything
- Flat type hierarchy — sizes must differ by ≥1.25 ratio

---

## 9. Accessibility floor — WCAG 2.2 AA

Non-negotiable for a general-audience product.

- Contrast 4.5:1 body, 3:1 large text and UI boundaries. Measured, not assumed —
  see §3. `--ink-4` is not a text colour; if you are reaching for it to set type,
  the answer is `--ink-3`.
- Touch targets ≥ 24×24px, including timestamps and player controls.
- Transcript turns are real buttons with accessible names that include speaker
  and time: *"Priya, 14:32, jump to this moment"*.
- Captions ship as WebVTT from the existing transcript. There is no excuse.
- Full keyboard operation of the player: Space, ←/→ ±5s, J/L ±10s, ↑/↓ volume,
  M mute, F fullscreen, C captions. Custom chrome means we own this.
- Virtualized lists need `aria-setsize` / `aria-posinset`, or screen readers
  report wrong counts. Intercept `⌘F` for in-transcript search, since browser
  find breaks on virtualized content.
- Streaming answers: `aria-live="polite"`, `role="log"`, announce at sentence
  boundaries, not per token.

---

## 10. Open decisions

- **Licensed typeface pair** — shipping on Newsreader + Instrument Sans; a
  licensed pair is planned pre-launch. Swap is token-level.
- **Dark mode** — deferred, not cancelled. Every token is semantic, so it costs
  one block when we do it. Do not naively invert; reduce chroma on dark.
- **Waveform on the scrubber** — open, and deliberately *not* a locked pick. It
  was listed as one while paired with the speaker ribbon; the ribbon was cut and
  the waveform came off the locked list with it. Unlike the ribbon it was never
  rejected on merit — a real waveform encodes where speech is, which helps
  seeking — but nothing consumes it today, and it costs a peaks stage in the
  diarize worker. Decide when the scrubber is built, not before. Chapter marks
  ship first; if they turn out to be enough, this stays cut.

---

## 11. Libraries

Locked picks. Do not substitute without a stated reason.

| Need in Raven | Library |
|---|---|
| Dialogs, popovers, menus, selects (proposal edit, filters) | **base-ui** |
| The ⌘K palette behind "Search everything" | **cmdk** |
| Action executed / failed notifications | **Sonner** |
| Layout + exit animation (evidence expand, proposal approve) | **motion** |
| Transcript and meeting list virtualization | **Virtuoso** |
| Shared playback state | **zustand** |
| Conditional classNames / typed variants | **clsx** + **cva** |
| Dark mode, when we do it | **next-themes** |

**Why zustand is load-bearing here:** the pinned player and the transcript must
not share React state that updates per frame. Playback position lives in a store
with selector subscriptions so a `timeupdate` re-renders two transcript rows, not
all 214. Getting this wrong is the difference between 60fps and an unusable page.

**Virtuoso is not optional.** Real transcripts run past 1,000 turns. Note that
browser `⌘F` does not work on virtualized content — the in-transcript find field
is a v1 requirement, not a nice-to-have.

Off the curated list, decided separately:

| Need | Choice |
|---|---|
| Video playback / adaptive streaming | `<video>` + **hls.js**, custom control layer |
| Chapter marks on the scrubber | Rendered by us from the `chapters` table |
| Server state / caching | **TanStack Query** |
| Streaming answers | raw `fetch` + `ReadableStream` — not `EventSource` (GET-only, cannot send the JWT header), not TanStack `streamedQuery` (hides chunks) |

No player library. Their value is their default chrome, and we replace 100% of it
with a transcript-synced scrubber and chapter marks. Vidstack, Media Chrome and
Plyr are also mid-merger into Video.js v10 — adopting any of them today means
adopting a migration.

---

## 12. Decisions log

| Date | Decision | Why |
|---|---|---|
| 2026-08-02 | Light-first, warm neutrals | Primary surfaces are reading surfaces; cool grey reads as default |
| 2026-08-02 | Newsreader + Instrument Sans, serif for speech only | Provenance encoded in type, no chrome needed |
| 2026-08-02 | Forest accent | Deep and desaturated, survives next to warm neutrals, rare in category |
| 2026-08-02 | Meeting list home, ask scoped in a rail | Category convention; Granola, Otter and Fathom converged independently |
| 2026-08-02 | Video pinned in rail, not hero | A hero scrolls away exactly when quote-clicking starts |
| 2026-08-02 | Transcript behind a tab | Rare job, enormous volume — must not hold primary space |
| 2026-08-02 | Status is exception-only | Removes ~⅓ of visual noise from list rows |
| 2026-08-03 | Cut the timeline ribbon | No use case; read as clutter on the scrubber |
| 2026-08-03 | Cut the speaker color system | Its only consumer was the ribbon; unused tokens rot |
| 2026-08-03 | Evidence is a footnote, not a card | A box asserts standing a fallible retrieval result hasn't earned |
| 2026-08-03 | Meeting card alongside row | Browsing and seeking are different jobs |
| 2026-08-03 | No summary on the meeting card | Title, thumbnail and one meta line are enough to decide a click |
| 2026-08-03 | Ink scale cut to three text levels | `ink-3` 3.57:1 and `ink-4` 2.33:1 both failed AA; solving both converges them |
| 2026-08-03 | `ink-4` demoted to non-text | Only job left is disabled controls and rules, which 1.4.3 exempts |
| 2026-08-03 | Processing takes a neutral tone, not warn | It is the happy path after every call; amber is for the 15-minute case |
| 2026-08-03 | Proposals keep provenance after they settle | "Why was this filed?" is asked about filed things |
| 2026-08-03 | Waveform off the locked list, into open decisions | Never rejected on merit, but nothing consumes it and it costs a worker stage |
| 2026-08-06 | Texture decided, and fenced to empty surfaces | Reads as paper only where there is negative space; behind body text it reads as a dirty screen |
| 2026-08-06 | Auth ground is `rail`, no new parchment token | Within Δ6 of the painting's own parchment; a token with one consumer is how the palette rots |
