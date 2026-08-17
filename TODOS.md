# TODOS

Deferred work with the reasoning intact. Every item here was a deliberate decision,
not an oversight — that distinction is the whole point of the file. `FUTURE_PLAN.md`
stays the spine (what's done, what's next); this holds the things consciously
declined and why, so a future session can re-open them with the original context.

Opened 2026-08-17 during the Calendar Auto-Join engineering review. Item 8 added the
same day from the design review of the Integrations surface.

---

## 1. Per-user bot identity

**What:** Replace the single shared Google account the bot uses with one identity
per user (BYO Google account), stored encrypted per `users.id` and mounted per
container by the orchestrator.

**Why:** Today `bot/src/auth.ts` captures one Playwright storage state and
`orchestrator/src/lib/dockerManager.ts:65-68` mounts that same state read-only into
every container. One Google account joins every user's meetings. Manual join makes
this fine — one join at a time, a human watching. Auto-join makes that same account
knock on many unrelated meetings, unattended, clustered at :00.

**Pros:** Correct blast radius — one user's lockout stops only that user. The bot
also shows up as an account the host may actually recognize, which materially
improves lobby admission (see item 6, they interact).

**Cons:** Large. Needs per-user secret storage, a session-expiry UX, and a much
heavier onboarding step (each user runs an auth bootstrap in a real browser).
Against the design doc's "buildable in focused weekends" constraint.

**Context:** Accepted as a risk on 2026-08-17 (review D2) — shipping auto-join on
the shared identity with no rate limit. The failure mode to watch for is a Google
lockout, which would stop capture for *every* user at once and require a manual
`pnpm auth` at a browser to recover. If that ever happens, this item becomes urgent
rather than deferred.

**Depends on:** nothing. Blocked by appetite, not sequencing.

---

## 2. Late-join guard / admission control

**What:** Carry `scheduledStartMs` on the job and, at the top of
`orchestrator/src/lib/worker.ts` `processJob`, skip with `UnrecoverableError` when
the bot would join more than N minutes late. Mark the calendar row `skipped_late`
with a reason the UI can show.

**Why:** `MAX_CONCURRENT_BOTS = 10` (`orchestrator/src/config/index.ts:8`) and
calendar meetings cluster hard at :00 and :30. Bot #11 doesn't error — BullMQ holds
it and it joins whenever a slot frees, potentially 40 minutes into a 30-minute
meeting. There is no admission control anywhere in the path.

**Pros:** Converts the single worst failure class in the product — a recording that
looks complete but contains the wrong half of the meeting — into a visible error.
Cheap: roughly fifteen lines.

**Cons:** A skipped meeting is a meeting you didn't record. Some users would rather
have the last ten minutes than nothing, which is an argument for pairing the guard
with a "joined late" badge instead of a hard skip.

**Context:** Accepted as a risk on 2026-08-17 (review D3), with the decision to
raise `MAX_CONCURRENT_BOTS` instead. Note that raising it trades a queueing problem
for host CPU/memory exhaustion — a path `FUTURE_PLAN.md` already marks unverified
under real load. The `scheduledStartMs` field this needs is being added anyway for
the alone-detector fix (D10), so the marginal cost drops once that lands.

**Depends on:** D10's `scheduledStartMs` plumbing (in Phase A).

---

## 3. Strict Meet-link parsing

**What:** Parse `hangoutLink` and `conferenceData.entryPoints[].uri` only, with a
`https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}` regex on `description` as a
last resort. Drop substring matching on `location`.

**Why:** The planned filter matches the substring "meet" in `location` or
`description`. `location: "Meeting Room 3"` matches. So does any description
mentioning a meeting. Each false match dispatches a bot at something that isn't a
URL, burning a container slot and dead-lettering a job with no explanation.

**Pros:** Effectively free — it's a stricter version of code being written anyway,
and it lives in `lib/calendarRules.ts` where it's already unit-tested.

**Cons:** Stricter parsing can miss genuinely unusual link placements. Worth
checking against a real captured `events.list` response rather than guessing.

**Context:** Declined on 2026-08-17 (review D4). Cheapest item in this file; revisit
the moment a false dispatch is observed.

**Depends on:** `lib/calendarRules.ts` existing (Phase A).

---

## 4. Cross-user dedupe on hangoutLink

**What:** Before scheduling, check whether another owner already has a bot scheduled
for the same `hangout_link` at the same start time. First owner wins; the second
gets read access to the resulting meeting, or a "already covered" state.

**Why:** Two colleagues with auto-join enabled and the same meeting on both
calendars produce two containers, two recordings, two Deepgram bills, two `meetings`
rows, and the same call appearing twice across two dashboards.

**Pros:** Halves cost on any shared meeting and removes a confusing duplicate from
the product surface.

**Cons:** "First owner wins" is only obviously right in a single-org deployment.
`meetings.owner_id` is the entire tenancy boundary — there are no orgs or teams — so
sharing the resulting meeting across owners needs a sharing concept the schema
doesn't have. That's the real reason this is deferred, not the dedupe logic itself.

**Context:** Declined on 2026-08-17 (review D4). Reconsider alongside any future
org/team model; the two decisions are entangled.

**Depends on:** a sharing or org concept in `schema.ts` for the non-trivial version.

---

## 5. Integration tests for the calendar sync worker

**What:** Four worker-level tests against a real Redis and a faked `googleapis`
client: a new event enqueues exactly once; a second poll no-ops on jobId collision;
a deleted event removes the delayed job; a terminal error marks the account
disconnected.

**Why:** Phase A ships unit coverage of the pure decision logic in
`lib/calendarRules.ts`, which is most of the risk but not all of it. The reconcile
loop — where the dedup design has to actually hold against BullMQ's real semantics —
is only exercised by hand.

**Pros:** The reconcile loop is where the six-bots-per-meeting bug would come back
if `jobIdFor` or the job-state check regresses. Unit tests can't catch that; they
test the id, not the queue's response to it.

**Cons:** Needs a Redis fixture in the test setup, which the repo doesn't have today
(`vitest` runs pure unit tests with no external services). That setup cost is most
of the work.

**Context:** Declined on 2026-08-17 (review D6) in favour of unit coverage only.
Worth revisiting the first time a reconcile bug reaches production.

**Depends on:** Phase A sync worker; a Redis test fixture.

---

## 6. Google OAuth verification

**What:** Take the OAuth app out of Testing publishing status: privacy policy,
homepage, domain ownership, scope justification, demo video, then submission and
review.

**Why:** This is not a deferral — nothing has started it and nothing else in the
repo tracks it. `calendar.readonly` is a sensitive scope. In Testing status the app
is capped at 100 users, shows the unverified-app interstitial, and (per the outside
voice, unverified against current Google docs — **check this first**) issues refresh
tokens that expire after 7 days. That last point matters most: if true, the
`invalid_grant → mark disconnected` handler fires for every user every week and the
system will misreport it as "user revoked access."

**Pros:** Calendar auto-join exists specifically to unlock adoption. A 100-user cap
and a scary consent screen defeat the purpose of the feature.

**Cons:** Multi-week external dependency with no code in it, and a real ask for a
self-hosted solo project (privacy policy, a real homepage, domain ownership).

**Context:** Longest lead time of anything connected to this feature. Start it in
parallel with Phase A rather than after — it costs nothing to have in flight, and
being blocked on Google after the code is done is the avoidable outcome. First
action is cheap: confirm the 7-day refresh-token expiry claim against current
Google documentation, because it changes how Phase A's error handling should read.

**Depends on:** nothing. Start now.

---

## 7. Config boot-time validation

**What:** Assert required secrets are present and non-default at process start
rather than defaulting them to `""` in `api-server/src/config/index.ts`.

**Why:** Every secret currently defaults to empty string, and `JWT_SECRET` has a
live insecure default (`config/index.ts:17`) with nothing asserting it changed in
production. Adding five `GOOGLE_*` keys with the same pattern means a misconfigured
deploy fails at the first API call rather than at boot, with an error that points at
Google rather than at the config.

**Pros:** Fails fast and points at the actual cause. Small.

**Cons:** Pre-existing pattern across the whole config object — doing it properly
means touching every key, which is a separate change from this feature.

**Context:** Flagged as adjacent during the 2026-08-17 review, deliberately kept out
of the calendar PR to avoid mixing a config refactor into a feature. Good candidate
for a standalone cleanup commit.

**Depends on:** nothing.

---

## 8. Where Phase C's per-event overrides live

**What:** Decide whether the upcoming-events list with per-event "Raven will join"
toggles renders inside the Google Calendar block on `/settings/integrations`, or on
its own view.

**Why:** Phase A ships the connection and the all-or-manual mode choice nested inside
the account block. Phase C adds a list of the next 24h of meetings, each individually
overridable. That list is a fundamentally different density regime from a settings
page — DESIGN.md §5 names three regimes that deliberately do not share a spacing
scale, and a scrolling list of meetings inside a settings block is the document-column
regime wearing a settings block's clothes.

**Pros of deciding now:** the Phase A layout is being built this week, and whether the
account block is a container for a list or just a settings block changes how it is
structured. Deciding later means either a refactor or a list crammed into a container
that was not designed to hold one.

**Cons:** Phase C is genuinely far off, and the right answer may depend on what the
list turns out to need (grouping by day? search? past events?). Deciding early on
incomplete information is how you get a container built for a list that never arrives
in that shape.

**Context:** Raised during the 2026-08-17 design review (Pass 7) and deliberately left
open. The two candidates are: (a) inline under the mode selector inside the Calendar
block, which keeps everything about the calendar in one place but nests a scrolling
list inside an 18px settings block; (b) its own route, which respects the density-regime
split and gives the list room, at the cost of separating "which meetings" from "when
Raven joins" — two questions users will think of as one. Neither is obviously right.
The state board at `~/.gstack/projects/Suksham-sharma-raven-meetbot/designs/settings-calendar-20260817/state-board.html`
shows the Phase A block this would extend.

**Depends on:** Phase A shipping. Do not decide before the account block exists in code.

---

## Scope delta recorded 2026-08-17 (design review → Phase A)

The design review moved this surface from a calendar-only page to an Integrations page.
That added backend surface the engineering review did not price. Small, but recorded so
Phase A's estimate stays honest:

- **One extra endpoint** — a read exposing `ActionAdapter.configured()` per kind
  (`api-server/src/actions/registry.ts` already has `ACTION_KINDS`), so the UI can render
  the "Available to this workspace" group. No new adapter contract; a new consumer of an
  existing one.
- **One extra route** — the post-OAuth mode-choice step, which the callback lands on
  before the user reaches `/settings/integrations` in its normal state. It reuses the same
  `ChoiceRow` component, so the cost is the route and its redirect logic, not new UI.
- **One new UI component** — `ChoiceGroup`/`ChoiceRow`, composed entirely from existing
  tokens (`accent-tint` selected background, 11px radius, `cva` pattern matching `Button`
  and `Pill`). No new design vocabulary.
- **One refactor** — generalize `Processing` in `web/components/raven/states.tsx` into a
  shared `NoticeLine` taking `{ tone, message, hint, action }`, with `Processing` re-expressed
  as a caller. Keeps the neutral→amber escalation rule in one place instead of re-derived
  per surface.
