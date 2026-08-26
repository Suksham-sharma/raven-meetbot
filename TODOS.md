# TODOS

Calendar handoff and deferred work with the reasoning intact. Every deferred item
here was a deliberate decision, not an oversight. `FUTURE_PLAN.md` stays the spine;
this file keeps the calendar-specific resumption context and the things consciously
declined.

Opened 2026-08-17 during the Calendar Auto-Join engineering review. Item 5 added the
same day from the design review of the Integrations surface.

---

## Calendar implementation handoff — next session

**Implemented, landed in `78f4c2f`:** migration `0009`; `calendar_accounts`, OAuth-state,
and schedule tables; AES-256-GCM refresh-token storage; Google connect/callback,
read/update/disconnect/sync endpoints; rolling 48-hour reconciliation; deterministic
owner-scoped delayed jobs; cancellation and late-join protection; scheduled start and
title propagation; empty-room suppression; Calendar worker; Settings navigation; and
the Calendar-only `/settings/integrations` page.

**Verified locally:** temporary Postgres migration; 22 API tests; a real-Redis
duplicate-enqueue proof; API, orchestrator, bot, and media-worker typechecks; targeted
web lint; Next production build; empty, connected, denied, and join-mode browser
states at desktop and 640px; React Doctor 100/100.

**Verified against a real Google account 2026-08-21:** migration `0009` applied to the
dev database, OAuth connect end to end, the refresh token on disk as AES-256-GCM
ciphertext, a live sync listing real events, and cancellation of rows Google no longer
returns inside the 48-hour window. Steps 1–4 below are therefore closed.

**What is left, and it all needs one real scheduled meeting:**

5. Create a Meet event starting within the rolling window. Run reconciliation more
   than once and prove one schedule row and one delayed BullMQ job.
6. Let the job fire and verify unattended lobby admission, title propagation,
   scheduled-start alone handling, empty-room suppression, live transcription, and
   the resulting meeting pipeline.
7. Keep `rules.test.ts` and `calendarQueue.redis.test.ts` until this live path passes;
   remove them afterward to match the repository's no-tests convention.

**Scope boundary:** do not add event overrides, incremental sync tokens, webhook
channels, Linear/Slack settings, a separate post-OAuth route, or a calendar mirror.
Phase A stays one account, one mode, one rolling scheduler, and one actionable UI
failure state.

**Repository convention:** pnpm only. Never use npm or npx. Root `AGENTS.md` records
the rule; the web, bot, and media-worker workspace files now declare `packages: ['.']`.

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
improves lobby admission (see item 3, they interact).

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

## 2. Cross-user dedupe on hangoutLink

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

## 3. Google OAuth verification

**What:** Take the OAuth app out of Testing publishing status: privacy policy,
homepage, domain ownership, scope justification, demo video, then submission and
review.

**Why:** This is not a deferral — nothing has started it and nothing else in the
repo tracks it. `calendar.readonly` is a sensitive scope. In Testing status the app
is capped at 100 users, shows the unverified-app interstitial, and current Google
documentation confirms that it issues refresh tokens that expire after 7 days.
That last point matters most: the
`invalid_grant → mark disconnected` handler fires for every user every week and the
system will misreport it as "user revoked access."

**Pros:** Calendar auto-join exists specifically to unlock adoption. A 100-user cap
and a scary consent screen defeat the purpose of the feature.

**Cons:** Multi-week external dependency with no code in it, and a real ask for a
self-hosted solo project (privacy policy, a real homepage, domain ownership).

**Context:** Longest lead time of anything connected to this feature. It is now a
Phase A launch gate and should run in parallel with implementation.

**Depends on:** nothing. Start now.

---

## 4. Config boot-time validation — **done** (PR #6)

**What:** Assert required secrets are present and non-default at process start
rather than defaulting them to `""` in `api-server/src/platform/config/index.ts`.

**Why:** Every secret currently defaults to empty string, and `JWT_SECRET` has a
live insecure default with nothing asserting it changed in
production. Adding five `GOOGLE_*` keys with the same pattern means a misconfigured
deploy fails at the first API call rather than at boot, with an error that points at
Google rather than at the config.

**Pros:** Fails fast and points at the actual cause. Small.

**Cons:** Pre-existing pattern across the whole config object — doing it properly
means touching every key, which is a separate change from this feature.

**Context:** Flagged as adjacent during the 2026-08-17 review, deliberately kept out
of the calendar PR to avoid mixing a config refactor into a feature. Shipped as the
standalone cleanup it wanted to be.

**Shipped:** `assertConfig()` in `platform/config/validate.ts`, called from the API
entrypoint and all three workers. It reports every problem at once rather than the
first: production secrets unset or still the committed dev value, half-configured
R2/Google/Linear groups, a `CALENDAR_TOKEN_KEY` that is not 32 bytes, and numeric
settings that would silently coerce to a default. `COOKIE_SECURE` was deliberately
left out — requiring it in production is a policy change, not a presence check.

**Depends on:** nothing.

---

## 5. Where Phase C's per-event overrides live

**What:** Decide whether the upcoming-events list with per-event "Raven will join"
toggles renders inside the Google Calendar block on `/settings/integrations`, or on
its own view.

**Why:** Phase A ships the connection and the all-or-manual mode choice nested inside
the account block. Phase C adds a list of the next 24h of meetings, each individually
overridable. That list is a fundamentally different density regime from a settings
page — DESIGN.md §5 names three regimes that deliberately do not share a spacing
scale, and a scrolling list of meetings inside a settings block is the document-column
regime wearing a settings block's clothes.

**Why it stays deferred:** Phase A now treats the account block as settings only.
The list gets its own design pass if event overrides become necessary.

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

Phase A keeps `/settings/integrations` but renders only Google Calendar. The
configured-adapters endpoint, Linear/Slack group, shared notice refactor, separate
post-OAuth choice route, and graduated five-state liveness treatment are removed
from this slice. A connected account defaults to `manual`; enabling `all` happens
on the integrations page.
