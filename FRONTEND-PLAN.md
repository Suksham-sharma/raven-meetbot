# Raven — Frontend Implementation Plan

Companion to `DESIGN.md` (visual/interaction system) and `README.md` (backend).
This plan covers **what to build, in what order, and every state it must render.**
No frontend code exists today; this is greenfield.

---

## 1. Goal

Ship a consumer-grade web app over the existing api-server that lets someone:

1. See their meetings and what came out of them
2. Play back any moment, cited by speaker and timestamp
3. Ask questions across the whole corpus and get grounded answers
4. Approve or reject the actions Raven proposes, before anything fires

Non-goal for v1: mobile apps, team/org sharing, live in-meeting UI, editing
transcripts.

---

## 2. Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | **Next.js 16**, App Router, client-rendered | Backend is a separate Express API, so RSC's server-colocated-data advantage does not apply — it would add a hop and a second Node process to proxy. We use App Router for routing and layouts, not for data. **See the search-param note below.** |
| SSR | Only `/s/:token` share pages | Needs real OG tags so a Slack paste renders the quote |
| Styling | **Tailwind v4**, default palette deleted via `--color-*: initial` | Makes `bg-indigo-500` a compile error, not a temptation |
| Primitives | **base-ui** | `shadcn init -b base` to scaffold, then de-shadcn. Radix has no Combobox, which ⌘K needs. |
| Server state | **TanStack Query** | Approving an action invalidates the ledger, the meeting, and the inbox |
| Streaming | raw `fetch` + `ReadableStream` | `EventSource` is GET-only and cannot send the JWT header |
| Client state | **zustand** | Playback position with selector subscriptions |
| Motion | **motion**, via `LazyMotion` + `m` | 4.6kb initial instead of 34kb |
| Lists | **Virtuoso** | Transcripts exceed 1,000 turns |
| Video | `<video>` + **hls.js** + own controls | Every player library's value is chrome we're replacing |

Enable React Compiler — a transcript re-rendering on `timeupdate` is exactly what
it's for. Not on yet; `next.config.ts` is empty. Check
`node_modules/next/dist/docs/` for the flag in this version before setting it.

**Search params are the open hole in this swap.** The framework was chosen partly
for typed search params, because the whole citation system is `?t=` / `?cue=` /
`?q=` state, and Next gives you `useSearchParams()` returning `string | null`.
Every `?t=` read becomes a hand-rolled parse unless we put something in front of
it. Needs an answer before the player, not after — see §10.

---

## 3. Auth

`POST /auth/login` returns `{ token, user }` and sets an httpOnly cookie.

**Constraint:** `app.use(cors())` uses defaults — `Access-Control-Allow-Origin: *`
with no `Allow-Credentials` — and the cookie is `sameSite: lax`. **The cookie
cannot be used cross-origin.** Two options:

- **(a)** Deploy frontend same-origin behind the API. Cookie works, no token in JS.
- **(b)** Separate origin, store the 7-day JWT in memory + refresh on reload.

**Recommendation: (a).** Option (b) puts a long-lived JWT in JS-reachable storage
for no gain. Flag: this is a deployment decision, not just a frontend one.

---

## 4. Routes

| Route | Screen | Notes |
|---|---|---|
| `/login`, `/register` | Auth | Password ≥8 chars, enforced server-side |
| `/` | Meetings list | Home. Grouped by day. |
| `/m/:id` | Meeting detail | `?t=` seek, `?tab=transcript` |
| `/m/:id/watch` | Theater | Deep-linkable full-size player |
| `/actions` | Proposal inbox | Cross-meeting. Does not exist in API yet. |
| `/tasks` | My action items | Cross-meeting |
| `/answers` | Saved answers | Requires persistence that does not exist |
| `/people`, `/accounts` | Memory views | **v2** — needs a person entity |
| `/settings` | Integrations, bot name | Linear/Slack config status |
| `/s/:token` | Public shared moment | SSR, OG tags. **v2.** |

---

## 5. State model

**zustand — `playbackStore`**
`{ meetingId, currentTime, duration, playing, activeTurnIndex, source }`

Rules:
- `currentTime` updates via `requestVideoFrameCallback`, not `timeupdate` (4Hz, uneven)
- `activeTurnIndex` resolved by **binary search** over a sorted start-time array, not `.find()`
- Only `set()` when the index *changes* — this single guard is 60fps vs. unusable
- Components subscribe with selectors so two rows re-render, not 214

**TanStack Query keys**
`['meetings']` · `['meeting', id]` · `['transcript', id]` · `['actions', meetingId]` ·
`['actions','inbox']` · `['bot', jobId]`

Approve mutation invalidates `['actions', meetingId]`, `['actions','inbox']`, `['meeting', id]`.

**Polling.** Bot status polls `/bots/:jobId/status` every 3s while non-terminal.
Stop on `ended|kicked|timeout|error|complete`.

---

## 6. Interaction states

This is the section most likely to be wrong. Enumerated deliberately.

### 6.1 Bot / meeting lifecycle

The API exposes **13+ status values**, and `StatusEvent.state` is typed `string`,
so there is no enum to exhaust. The UI must render every one:

| Status | Render |
|---|---|
| `queued` | "Waiting to join" |
| `dispatched` | "Starting up" |
| `joining_meeting` | "Joining" |
| `waiting_admission` | "Knocking — waiting to be let in" (can last **5 min**) |
| `admitted` | "In the call" |
| `recording` | "Recording" + live dot |
| `alone_detected` | "Everyone left — leaving in a moment" |
| `finalizing_upload` | "Saving the recording" |
| `ended` | normal end |
| `complete` | full success |
| `kicked` | "The host removed the bot" |
| `timeout` | "Hit the time limit" |
| `error` | carries `reason` — surface it |
| `paused`, `waiting-children` | raw BullMQ passthrough — **must not crash the UI** |

**Unknown status must render as a neutral fallback, never blank and never a throw.**

### 6.2 The invisible pipeline — the hardest problem here

Once the bot job hits `complete`, `/bots/:jobId/status` freezes. Diarize → memory →
agent takes **2–10 minutes with no upper bound** and is **completely unobservable**.
`meetings.status` only ever holds `pending` or `ingested` — no `diarizing`, no
`failed`.

There is also no `meetingId` ↔ `jobId` mapping in any response. The only link is
string-munging `recording` (`<meetingId>.webm`), replicating backend logic.

Worse: if the bot finishes without both `recording` and `speakers` keys, the
diarize handoff is **silently skipped** — job reports success, meeting never appears.

**v1 approach:** show an honest indeterminate state ("Working out who said what —
usually a few minutes") derived from meeting-row absence. Do **not** fake a
progress bar. After 15 minutes, show "This is taking longer than usual" with a
support path.

**Flagged as a real product gap** — proper fix is real `meetings.status` values
written by each worker. Documented in §8, not built here.

### 6.3 Meeting detail

- **No title.** `title` is null for every real meeting — `realSource.ts` never sets
  one. Fall back to a formatted date, never the raw id. Offer inline "Add a title"
  (needs a PATCH that does not exist).
- **Recording missing / expired signed URL** → poster + "Recording unavailable",
  transcript still works
- **Transcript still processing** → tab disabled with reason, summary may exist first
- **Zero decisions / zero action items** → omit the section entirely, don't render an empty header
- **Single-speaker meeting** → participants line reads one name; nothing else changes
- **4-hour meeting** → Virtuoso; chapter marks must not overflow (bug already hit once)

### 6.4 Ask

- **Thinking** — `/ask` is a blocking POST taking **3–40s** with no streaming and
  no progress signal (`iterations` returns only on completion). Show what it's
  doing, not a spinner. Client timeout 60s.
- **Refused** — `refused: true`, `answer` starts with "I couldn't find that in your
  meetings." HTTP is still **200**. Render as a neutral empty state, **never an
  error**. Show the search boundary: "Searched 34 meetings, Jan 3 – Aug 2."
- **Ungrounded** — `grounded: false` means claims with no resolvable citation, and
  it is served as a normal 200 with the answer intact. **The API delegates this
  decision entirely to us.** Decided: a plain caveat line under the answer — no
  box, no tint, no alert glyph. The caveat is the words.
  Reason for the restraint: `grounded: false` also fires when citations fell
  outside the 3s resolution tolerance, so a resolution bug is indistinguishable
  from a hallucination. Alert chrome asserts a confidence about the cause that we
  do not have, and crying wolf on our own retrieval bug is the fastest way to
  teach people to ignore the one that matters.
- **Citations are positionless.** The server strips `[[meeting@sec]]` markers before
  returning and citations carry no offsets. **Inline numbered chips are impossible
  without a server change.** v1 renders prose + evidence cards below. Accepted.
- **No conversation history.** `/ask` is stateless — no threads, no persistence.
  Follow-ups ("what about the second one?") will fail. v1: single-shot only, and the
  UI must not imply chat. **Do not build a chat transcript UI.**

### 6.5 Proposals

Four statuses: `proposed` → `executed` | `failed` | `rejected`.
`failed` is **retryable** (server allows re-approve); `executed` and `rejected` are
terminal with no undo.

- Approve → three outcomes: **200** executed, **409** adapter not configured
  (missing `LINEAR_API_KEY` etc.), **502** upstream failed. All three need distinct copy.
- `dry_run` returns a `would` string — use it for a preview-before-approve.
- **Serialization inconsistency:** the list response includes `evidence.clip`, but
  approve/reject responses call `serialize()` without recording args, so `clip` is
  **always null** there. Treat the mutation response as authoritative for
  `status`/`result` only; refetch the list or merge locally.
- Slack recap actions always have `evidence: null` — the card must render without it.
- Neither adapter `fetch` sets a timeout — a hung Linear can hang the request.
  Client-side timeout + cancel required.
- Optimistic approve, rollback on failure. Failed actions stay **persistently
  visible** — never a toast that scrolls away.

### 6.6 Empty states

- **Zero meetings** — not an illustration. Three-step setup path plus a real sample
  meeting the user can explore before generating any data.
- **Meetings but never asked** — 4–6 questions generated from *their* meetings.
- **Search no results** — reflect the query, state the boundary, offer to widen.

### 6.7 Failure

- 401 → clear cache, redirect to login
- 500 → the API leaks raw exception messages via `asyncHandler`; **never surface
  them verbatim**. Map to friendly copy, log the original.
- Offline → banner, disable mutations
- `/bots` list caps at 100 rows **before** owner filtering, so results can be
  silently wrong, not merely truncated. Do not present it as complete.

---

## 7. Component inventory

**Primitives** — Button, IconButton, Pill, Field, Dialog, Popover, Menu, Tabs,
Checkbox, Toast, Tooltip, Skeleton

**Domain** — `MeetingRow` · `MeetingCard` · `StatusFlag` (exception-only) ·
`EvidenceFootnote` · `CitationChip` (`Priya · 14:32`) · `ProposalCard` · `TaskRow` ·
`TranscriptTurn` · `ChapterMarks` · `PinnedPlayer` · `TheaterPlayer` · `AskPanel` ·
`AnswerBlock` · `CommandPalette` (cmdk) · `EmptyState`

No `SpeakerAvatar` and no `SpeakerRibbon`. Both were cut — see DESIGN.md §3. A
speaker is written out by name everywhere they appear, so nothing needs a hue
hash or a canvas band. Do not reintroduce either from an older draft of this list.

**Layout** — `AppShell` (232 / fluid / 420, independent scroll regions) ·
`NavRail` · `DocumentColumn` (text ≤700px) · `SideRail`

---

## 8. Backend additions required

**Not built in this pass — documented so the plan is honest.** Ranked by leverage.
Three of the first four already exist as owner-scoped functions and are trapped
behind the LLM tool layer.

| # | Endpoint | Notes |
|---|---|---|
| 1 | `GET /meetings` | Wrap `listMeetings` (`agent/tools.ts:422`). **Unblocks the entire app** — there is currently no way to discover a meeting id. |
| 2 | `GET /meetings/:id` | Wrap `fetchMeeting` (`agent/tools.ts:347`) — summary + chapters |
| 3 | `GET /meetings/:id/recording-url` | Presign the R2 key. **`recording_url` stores a key, not a URL** — every citation deep link is currently unplayable. |
| 4 | `GET /meetings/:id/transcript` | Serve the R2 `.named-transcript.jsonl`. **`chunks` is unusable** — 500-token multi-speaker blobs with 75-token overlap, so rendering them sequentially duplicates dialogue. |
| 5 | Real `meetings.status` from each worker | Makes the pipeline observable (§6.2) |
| 6 | `GET /actions?status=proposed` | Cross-meeting inbox. The `agent_actions_status` index already exists for exactly this query. |
| 7 | `GET /meetings/:id/decisions`, `/action-items`, `/chapters` | Populated, user-facing, zero HTTP exposure |
| 8 | Cursor pagination on all lists | Nothing is paginated today |
| 9 | `PATCH /meetings/:id` | Set a title. No mutation on domain data exists at all. |
| 10 | SSE on `/ask` + raw answer with markers | Unlocks streaming and inline citations |

Also: `action_items` has no `completed` column, so **checkboxes have nowhere to
persist**. Either add one or render them read-only. Decision needed.

---

## 9. Build sequence

1. Scaffold + design tokens from DESIGN.md; delete Tailwind's palette
2. `AppShell` + `NavRail` + auth
3. Meetings list against `GET /meetings` (#1)
4. Meeting detail: summary, decisions, tasks
5. Player + chapter marks (#3)
6. Transcript tab, virtualized, with find (#4)
7. Ask panel + evidence cards
8. Proposals, inline-editable, with the three approve outcomes
9. ⌘K palette
10. Empty, loading, and failure states as a dedicated pass — not sprinkled

Player and transcript ship **before** ask: they're the hardest surfaces and set
the quality bar everything else inherits.

---

## 10. Open questions

1. Same-origin deploy, or JWT in memory? (§3)
2. Action-item checkboxes — add a `completed` column, or read-only? (§8)
3. Is a fake sample meeting for onboarding worth building? (§6.6)
4. Do we ship `/answers` in v1 given it needs a persistence layer that doesn't exist?
5. **Typed search params on Next.** The citation system is entirely `?t=` / `?cue=` /
   `?q=` state and `useSearchParams()` is untyped. A thin parse/serialize module per
   route is probably enough — but decide before the player, since `?t=` is how every
   citation deep-link lands. (§2)

Resolved: `grounded: false` renders as a plain caveat line, not a banner — see §6.4.
