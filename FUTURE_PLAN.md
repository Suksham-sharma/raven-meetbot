# Raven — Future Plan

> **This is the operational spine.** One doc, read at the start of every session,
> updated at the end of it. It answers exactly two questions: *what is actually
> done* and *what is the next thing to pick up*.

## How to use this doc

**Start of session:** read §1 (Position) and the first unchecked phase. That's it.
Don't re-derive state from `git log`.

**End of session:**
1. Tick the boxes you actually finished — `[x]`, plus the commit SHA in the line.
2. File anything discovered mid-session into the right phase.
3. Append one line to §14 Session Log.
4. Anything **unverified** gets `⚠️` and stays unchecked until it's proven at runtime.

**The rule that keeps this doc honest:** a box is checked when it has been *verified
working*, not when the code compiles. "Written but unverified" is a different state
and it gets `⚠️`, because that distinction is exactly what has bitten this project
before (the live-transcription fix sat "done" for weeks while being broken).

### Shape of the plan

| Part | Phases | Question it answers |
|---|---|---|
| **A — Ship what exists** | 0–2 | Can a stranger use the thing already built? |
| **B — Make it adoptable** | 3–5 | Can data get in, and can value get out? |
| **C — The bet** | 6 | Why this instead of Granola? |
| **D — Make it real** | 7–8 | Can it run in production and be trusted? |

### Phases remaining at a glance (2026-09-03)

| Phase | Left | One line |
|---|---|---|
| 1 — complete the loop | 4 items | accessibility pass, responsive shell, keyboard nav beyond ⌘K, answers persistence |
| 2 — capture | 6 items | call-ended exit on a real teardown, bot's own tile filter, login-wall detection, concurrency under load, time-based flush, audio-duration guard |
| 3 — get data in | 2 items | publish the Google OAuth app (hard gate), Zoom/Teams capture |
| 4 — get value out | all 6 | digest email, share link, clip export, Slack delivery, webhooks, proposal notifications. Nothing started |
| 5 — actions surface | 6 items | payload editor, cross-meeting inbox, real Linear/Slack creds, assignee mapping, Slack DMs, integration settings, third integration. The approve/reject UI is done |
| 6 — compounding memory | 6 of 7 | open questions, commitment ledger, decision timelines + contradiction, brief delivery, person view, correction flywheel, honest confidence. Only the pre-meeting brief is done |
| 7 — production | see the deploy steps below | |
| 8 — depth | all | temporal tool, decomposition revisit, token streaming, model experiment, golden set to 100, coverage, writeup |

Part C is the differentiated work. It is sequenced *after* adoption plumbing but
*before* production polish on purpose: compounding memory is worthless without a
corpus to compound, and pointless to deploy if it isn't built.

### Where the other docs stand

| Doc | Status | Use for |
|---|---|---|
| **`FUTURE_PLAN.md`** (this) | **Live spine** | What's done, what's next |
| `DESIGN.md` | **Live, enforced** | Every visual/UI decision. Read before writing any component |
| `AGENTS.md` | **Live, enforced** | Repository conventions — pnpm only; never npm or npx |
| `web/AGENTS.md` | **Live** | Next.js 16 rules — read `node_modules/next/dist/docs/` first |
| `docs/decisions.md` | **Live** | Architecture decisions D1–D6, failure modes, non-goals — the "why" |
| `TODOS.md` | **Live** | Calendar handoff and deferred decisions, with reasoning intact |

`PLAN.md`, `ROADMAP.md`, `FRONTEND-PLAN.md` and `API-SURFACE.md` were retired on
2026-08-17 — all four had gone stale enough to mislead. Their durable reasoning
lives in `docs/decisions.md`; endpoint contracts come from `api-server/src/routes`.

---

## 1. Position

**Branch:** `main` = `ab5a909`. The Home/Meetings split, the `Up next` block, the
overlay/menu/toast primitives, the live-session surface and the proposal wiring
all landed in PR #4. Two PRs are open against `main` and neither needs a live
meeting to review: **#5** creates the `meetings` row the moment processing starts,
**#6** makes a misconfigured deploy fail at boot instead of at the first call.

**What works end to end today:** bot joins a real Google Meet → records →
transcode to a seekable mp4 → batch diarization with real speaker names → memory
ingest → agentic `/ask` with cited clips → action proposals gated behind human
approval → **a meeting page you can watch, read and seek**. Per-user isolated.

**Phase 0 is closed.** The citation loop is wired end to end: an answer's
footnote navigates to the meeting at the cited second, the transcript follows
playback, and chapters seek.

**The clock is now correct too.** The spliced-audio drift (up to 68s) was fixed
in `7a7eba5` and the one affected real meeting was re-transcribed and verified
against the mp4's own audio, so a cited second is the second you land on.

**Ask now streams.** `POST /ask/stream` emits `tool_call` → `tool_result` via SSE; the panel shows live steps instead of a fake spinner. Tool-step streaming only — token streaming + inline markers still open.

**A captured meeting is no longer invisible while it processes** (PR #5). The bot
path created no `meetings` row until `ingestMeeting` succeeded, so a capture was
missing from every surface for the whole encode-plus-diarize window and missing
*forever* if any stage failed — the row that would have carried the error did not
exist yet. Both media workers now open with an idempotent `beginProcessing` upsert.
The same change moved each worker's first `store.resolve` inside the try, which had
been letting a missing artifact throw past `markFailed` and park the row at
`transcoding` with a null `status_error`.

**A misconfigured deploy now fails at boot** (PR #6). Every config key defaulted to
`""` or a working localhost value, so a missing secret surfaced later as an error
naming Google or R2 rather than the config. `assertConfig()` runs on the API and all
three workers and reports every problem at once: production secrets unset or still
the committed dev value, half-configured R2/Google/Linear groups, a
`CALENDAR_TOKEN_KEY` that is not 32 bytes, and numeric settings that would silently
coerce to a default.

**Bot image rebuilt.** `meet-bot:latest` rebuilt `2026-08-15` (`20c8d65b`, `--no-cache`) and verified `encoding`/`sample_rate` are omitted so Deepgram auto-detects `audio/webm;codecs=opus`. Owner can now stop their bot via `POST /bots/:jobId/stop` (queued `bot-control` → `docker stop` → graceful finalize).

**Calendar position:** OAuth is real and working as of 2026-08-21. A live sync
against Google succeeded end to end — decrypt the stored refresh token → mint an
access token → list events → reconcile — and the token is on disk as AES-256-GCM
ciphertext. Cancellation is proven too: rows the reconciler does not find in Google
inside its 48-hour window get cancelled within one cycle. **The remaining gate is
narrower than it was: a real scheduled Meet producing exactly one delayed BullMQ job,
then unattended admission, title propagation, empty-room suppression, and live
Deepgram segments.** Still no event overrides, no incremental sync tokens, no more
integration UI before that proof.

**Next session starts here:** both of these need a real meeting, which is the only
reason they are still open. Everything reachable without one has been done.

1. **The scheduled-Meet proof.** Credentials, migration and OAuth are all done —
   start Postgres/Redis/API/web/orchestrator plus the calendar worker, put a real
   Meet on the calendar ~15 minutes out with mode `all`, and watch the chain:
   schedule row → exactly one delayed job across repeated syncs → unattended
   admission → title propagation → empty-room suppression → **live Deepgram
   segments**. That last one also closes `40dc3c0`, the oldest unproven fix in the
   project. Record the exact failure if lobby admission or transcription breaks.
2. **See the new UI against real data.** The `/design` half of this is done — the
   menu, confirm and toast primitives were exercised in the gallery on 2026-08-27
   and all three behave. What is left needs the meeting from step 1: the
   live-session block only appears with a bot actually in flight, and the proposal
   section only appears with `agent_actions` rows.

**Note for whoever restarts the stack:** the datastores live in OrbStack and go
down with it. `docker compose up -d postgres redis` before the dev processes, or
everything fails to connect. Postgres is on **5434** and Redis on **6380** via
`docker-compose.override.yml`, and the API listens on **3001**, not the 3000 that
`.env.example` still implies for `GOOGLE_REDIRECT_URI`.

**The one-line summary:** Phase 0 and Phase 1 are done. Phase 2's live capture
re-verification remains the oldest open risk. Phase 3 Calendar now has a proven
OAuth and sync path; only the scheduled-Meet leg is unproven. A surface audit
(§6b) closed four capabilities that had shipped with no way to reach them. What
is left in every open phase either needs a live meeting or is Phase 4 and beyond.

---

## 2. Done

Condensed. Detail lives in the linked commits and `docs/decisions.md`.

### Capture — v1 / v1.x
- [x] Three-service architecture: `api-server` (Express) / `orchestrator`
      (Dockerode + BullMQ) / `bot` (Playwright + Chromium). Container-per-meeting.
- [x] Signed-in Google join via Playwright storage state (`pnpm auth`) —
      anonymous joins are blocked/rate-limited by Meet.
- [x] Recording via `getDisplayMedia` + AudioContext composite mix.
- [x] R2 multipart streaming upload.
- [x] Live Deepgram transcription — `40dc3c0` fixed the WebM/Opus container
      declaration that produced 0 segments and crashed the bot. ⚠️ **never
      re-verified on a fresh meeting** (Phase 2).
- [x] Speaker-attribution timeline — CSRC sampling + self-calibrating DOM
      speaking indicator → `{id}.speakers.jsonl`. `bind` confirmed on a real
      meeting 2026-06-26.
- [x] Retry/DLQ, cost tracking, crash-safe shutdown.

**Settled the hard way:** per-participant audio capture is *impossible* — Meet's
SFU pre-allocates 3 audio streams and remaps speakers at the RTP layer, invisibly
to the DOM. The speaker timeline is the replacement, not a compromise.

### Memory — v2
- [x] Postgres + pgvector + tsvector; Drizzle schema, migrations 0000–0006.
- [x] Extraction spine: `meeting_type` (free text, **not** an enum) + decisions +
      action_items + chapters + summary, every record carrying an
      `evidence_quote` that must be a literal transcript substring (quote guard).
- [x] Hybrid search — vector HNSW + FTS fused by RRF in **one** SQL query.
- [x] Agentic `/ask` — OpenAI function-calling loop, 4 tools, spine-first routing,
      cite-or-refuse with `[[meeting@start_s]]` markers → `#t=` links.
- [x] Eval harness: 9 meetings / 27 adversarial questions, chunk-level labels,
      self-built LLM judge validated against real Ragas.
- [x] Real-data run: the Hire100x mock interview ingested and queried end to end.

**Baseline, measured 2026-08-31 on gpt-5-mini extraction:** answer fact 0.771 ·
faithfulness 0.977 · relevancy 0.958 · cite-or-refuse 0.852 · grounded 0.926 ·
refusal 0.667. Retrieval is unchanged at chunk recall@8 0.854 · MRR 0.618 ·
nDCG@8 0.656 · meeting recall@8 0.938, and it stays unchanged by anything
extraction does: `hybridSearch` reads only `chunks`, and `chunkTranscript` takes
the transcript alone.

**The previous baseline of fact ~0.69 · faithfulness ~0.87 was blamed on a
gpt-4o-mini ceiling in the ask loop. Half of it was extraction.** That corpus was
built by an extractor that found 5 decisions in the arch review where there are
11, credited every one of them to Sarah, and missed Alex's benchmark commitment
outright. Fact rose 8 points and faithfulness 11 without touching the ask model,
which still runs gpt-4o-mini. Unsupported claims fell to 4 across 27 questions.

Three failures survive and are not extraction problems: `q25-vague-sales-tiers`
answers a question it should refuse, and `q11-acme-current-tool` and
`q21-acme-current-status` both score 0.00, the second also failing relevancy and
cite-or-refuse. q21 is `structured_recency`, which is the temporal-resolution gap
Phase 8 already names.

### Post-processing — v4
- [x] Diarize worker (`56b1902`): R2 fetch → ffmpeg audio extract → Deepgram batch
      nova-3 with participant-derived keyterms → interval-vote name merge →
      `{id}.named-transcript.jsonl` → enqueues ingest.
- [x] Keyterms derived from tile names measurably fix name spelling; absent facts
      stay absent rather than being fabricated.

### Actions — v3
- [x] `412f987` — propose → human-approve → execute. **One structured-outputs
      call, not a tool loop**: every `linear_issue` traces to a quote-guarded
      action_item, and the Slack recap is templated deterministically so the LLM
      never votes on whether the team gets notified.
- [x] Idempotency hashes the **evidence quote**, not the LLM prose (the model
      re-words payloads every run; the quote is the stable identity).
- [x] Fail-safe on unconfigured adapter, dry-run mode, `execute()` reachable only
      from the approve endpoint.
- [ ] ⚠️ Adapters never exercised against real Linear/Slack — needs credentials.

### Auth + tenancy
- [x] `e7d7bf4` — scrypt + jose JWT, `users` table, `meetings.owner_id` as the
      **single** tenancy boundary (children inherit via cascade).
- [x] Owner threaded through the whole pipeline: join-meet → bot job →
      orchestrator → diarize → ingest.
- [x] Senior review caught a real **cross-tenant IDOR** on `/bots` — fixed and
      re-verified with a 12-point isolation proof.
- [x] **Google sign-in** (2026-09-03). Server-side authorization code with
      `openid email profile` only; the id token is verified against Google's keys
      with jose, `users.google_sub` links the account, and a verified email that
      matches an existing password account links rather than duplicating. Calendar
      stays a separate incremental consent and passes the signed-in email as a
      login hint. `password_hash` is nullable; password login on a Google-only
      account fails with the same generic message as any bad login.
- [x] **Free allowance** (2026-09-03). `users.plan` is `free` or `unlimited`;
      `FREE_MEETING_LIMIT` (default 2) counts non-failed meeting rows plus bot
      jobs still queued or running, so two parallel requests cannot both slip
      through and a failed capture hands the slot back. Enforced at join-meet,
      upload presign (single and bulk) and in the calendar reconciler, which
      silently stops scheduling instead of failing. `UNLIMITED_EMAILS` grants
      the plan at signup; `pnpm plan <email> <plan>` flips it later. `/auth/me`
      carries `usage`, the free plan sees "1 of 2 free meetings used" on Home and
      Meetings, and the Join and Upload dialogs render an explanation at the
      limit. Unlimited accounts see nothing. Verified over HTTP and in the
      browser against a fixture account; Google sign-in verified up to the
      redirect, since the console needs the new callback URI added.

### Dashboard
- [x] Next.js 16.2 / React 19 in `web/`. Design tokens with Tailwind's palette
      deleted, so an off-system colour is a build error.
- [x] `/design` — auth-free component gallery every screen composes from.
- [x] Auth screens, app shell, meetings list, ask panel, follow-ups rail, ⌘K palette.
- [x] Read endpoints: `/meetings`, `/meetings/:id`, `/meetings/:id/transcript`,
      `/action-items`, `PATCH /action-items/:id`, `/meetings/:id/actions`.
- [x] Migration 0006 `action_items.completed_at` — carried across the
      delete-then-insert re-ingest keyed on the **evidence quote**, not `seq`
      (seq is positional and shifts when extraction finds one more item).

---

# Part A — Ship what exists

## 3. Phase 0 — URGENT · unblock

*Nothing else matters until a user can open a meeting. All of this is connecting
merged-but-dead code.*

### 0.1 Land the transcode slice — **uncommitted on `main` right now**
- [x] mp4 probes 766.9s with `moov` at byte 36 against an unseekable `N/A` webm.
- [x] Worker end to end: enqueue → mp4 + poster written → `meetings.mp4_key` set.
- [x] **Race verified both ways** — row present logged "meeting row updated";
      row absent logged "no meeting row yet — ingest will pick it up".
- [x] Migration `0007` applied (8 total). `7417818`
- [ ] R2 mode is still unexercised — R2 creds are blank, so all of the above ran
      against `LocalArtifactStore`.

### 0.2 `GET /meetings/:id/recording` — **done** (`3cdaf7f`)
- [x] Presigned where the store can sign; same-origin stream where it cannot.
- [x] mp4 first, webm fallback, `seekable` reported, typed 409 when neither.
- [x] Owner-scoped, 404 not 403 — verified with a second user across all routes.
- [x] Range verified: 200, 206, suffix ranges, 416.
- [x] Poster route.

### 0.3 `/m/[id]` — the meeting detail page — **done** (`d0387d9`)
- [x] Route, tabs ("What happened" / "Everything said"), pinned rail player.
- [x] Custom chrome, chapter marks on the scrubber, full keyboard set,
      WebVTT captions generated from the transcript.
- [x] `?t=` seeks on load — verified landing at exactly 300s, paused.
- [x] Chapters and transcript turns both seek; active row and chapter track
      playback; auto-follow yields on manual scroll.
- [x] Virtuoso + in-transcript find (⌘F intercepted); `aria-setsize` on a
      `listitem`, since it is ignored on `role="button"`.
- [x] Ask in the rail **scoped to the meeting** (`1dfcd01`).
- [x] Theater mode (`ed40ea0`, `b36bb7a`) — video across the column, title and
      detail beneath, **now the default**; companion one click away and
      remembered. Height capped against the viewport so a short screen still
      has room to read.
- [x] Player: speed, ±10s skips, buffered range, auto-hiding chrome.
- [ ] Proposals ("Raven would like to") — Phase 5, not built here.

### 0.4 Local-disk transcript — **done** (`3cdaf7f`)
- [x] Gate removed; returns 114 turns in local-disk mode.

### 0.5 Close the loop — **done** (`d0387d9`)
- [x] `EvidenceFootnote` was rendered with no `onPlay`, so every citation in the
      product was inert. Wired to navigate to `/m/<id>?t=<s>`.
- [x] The deep-link guard is keyed on the value, not latched once, so a citation
      pointing at the meeting already open still seeks.
- [x] **Verified against ground truth**: the Hire100x meeting was re-transcribed
      on the fixed clock, and a slice pulled from the mp4 at 564.2s — where the
      old drift was ~62s — transcribes word-for-word to what the transcript
      claims is there.

---

## 4. Phase 1 — complete the loop

*Phase 0 makes it work once. This makes it work every time, for a stranger.*

### Pipeline made visible
- [x] Real `meetings.status` written by each worker (`transcoding` → `diarizing` → `ingesting` → `ready` | `failed`), `status_error` column, `d8196ca` `0008_moist_bride`. Verified via DB + `GET /meetings` + injected `failed` row.
- [x] Per-stage failure surfaced with a reason, not a silent null column. `d8196ca`.
- [x] **Retry a failed stage from the UI.** `POST /meetings/:id/retry` re-enqueues the failed queue by `status_error` prefix; button on row/card/detail. `d8196ca`.

### Data the user owns
- [x] **Delete a meeting** — `DELETE /meetings/:id` deletes row (cascade) + R2 keys (`webm/mp4/poster/speakers/named-transcript`) via `artifactStore.delete()`. `d8196ca`.
- [x] **Export a meeting** — `GET /meetings/:id/export?format=json|md` returns chapters/decisions/action_items/transcript; `md` builds markdown. `d8196ca`.
- [x] Rename a meeting (`PATCH /meetings/:id` `{title}`). `d8196ca`.

### Finding things
- [x] Meetings list: search + filter (`q` ILIKE title/summary, `type`, `participant` @>, `from`/`to` date). `d8196ca`.
- [x] **Plain search endpoint** — `GET /search?q=&k=&speaker=&meeting_id=&type=&participant=` hybrid search without LLM loop. `d8196ca` `search.controller.ts`.
- [x] **Speaker-filtered retrieval** — `hybridSearch` `speaker` ILIKE `c.speaker`; exposed via `GET /search?speaker=Ankur`. `d8196ca`.

### Quality bar
- [x] Empty / loading / failure states — `failed` flag + `status_error` detail on row/card/detail; processing banners for `transcoding/diarizing/ingesting`; existing `EmptyState`/`Skeleton` reused. `d8196ca`.
- [x] **Onboarding** (2026-09-03). Home for an account with no meetings no longer
      says "Welcome back" and offers the same button twice. It reads: a one-line
      serif lede on what Raven keeps, the calendar banner as the only solid
      control (auto-join is the path that keeps working after today), a single
      quiet row for joining a call now, and the allowance as a footnote. Upload
      is not offered on Home; it stays on Meetings. The banner rewrites itself
      as the calendar state changes and has no control once Raven is already
      watching. The rail keeps the Home silhouette with a muted ask panel
      instead of vanishing; a painted plate was tried and cut. Chosen from a
      three-direction design board, then a combined fourth; in `/design` under
      "First run".
- [ ] Accessibility pass (ink scale is AA; the rest is unaudited).
- [ ] Responsive — the 232/fluid/420 shell assumes a desktop.
- [ ] Keyboard-first navigation beyond ⌘K.
- [x] Typed search params module — `web/lib/searchParams.ts` (`parseT`/`parseQ`/`buildT`). `d8196ca`.
- [ ] Decide `/answers` persistence — needs a table that doesn't exist.

---

## 5. Phase 2 — capture: reliability + consent

*The least-verified layer in the system, and everything downstream is worthless
without it.*

- [x] **Rebuilt `meet-bot:latest`** — `2026-08-15` `20c8d65b` (`--no-cache`); verified `dist/services/transcriber.js` omits `encoding`/`sample_rate` so Deepgram auto-detects `audio/webm;codecs=opus`. Image is fresh.
- [x] **Live transcription verified on a real meeting, 2026-09-02.** 209 segments with real text and 0.87-0.99 confidence, from a 10-minute call. `40dc3c0` had sat built-but-unproven since 2026-06-27; it was the oldest outstanding risk in the project and it works.
- [ ] ⚠️ Still unverified against a live container after the 2026-09-02 run: the
      bot was in flight for ten minutes and nobody opened the UI, so neither Stop
      nor the "Right now" block was exercised. Both need one more short call.
- [ ] ⚠️ **Owner-controlled exit — `POST /bots/:jobId/stop`** — owner-scoped (404 if not owned; 400 if `completed`/`failed`; 200 `cancelled` for `waiting`/`delayed` via `job.remove()`; 202 `stopping` for `active` via `bot-control` queue). Orchestrator `bot-control` worker → `dockerManager.stopByJobId` (label `com.meetbot.jobId`, `stop({t:10})` → bot `SIGTERM` → graceful `cleanup()` + `finalizing_upload`). `dockerManager` now tracks `jobId→containerId`, labels containers, and falls back to `listContainers` by label. Committed and given a surface in `ab5a909` (the "Right now" block on Home, behind a confirm). Still not verified against a live container.
- [ ] **Recording consent** — **decided: not building auto-announce.** Per session decision 2026-08-15: keep it user-based — if the owner wants the bot to exit they can call `POST /bots/:jobId/stop`; no automatic chat announcement. Two-party risk is acknowledged but deferred in favour of explicit owner control.
- [x] **End-detection rebuilt.** Root cause: there was no end-of-call detector.
      Of the three exits, `page.url().includes("/bye")` matches a path Meet no
      longer uses and `isKicked` matched post-call copy against
      `textContent("body")`, so `alone_too_long` was the only path that could
      fire — and it was gated behind a participant counter that broke exactly
      when a call ends. `getParticipantCount` skipped its
      `[data-participant-id]` read whenever the tiles were gone, then fell
      through to "any button whose text is digits" and "any aria-label
      containing a number". Verified in real Chromium: an ended call with a
      stale people badge returned 3, and a bare post-call screen returned
      `null` — which the monitor loop handled by taking neither branch, freezing
      the alone timer indefinitely. Now the exit is driven by the call view
      (leave button / in-meeting controls / URL), the counter reads tiles only
      and says `null` rather than guessing, and every path is bounded: call view
      gone → 15s, alone → 60s, unreadable → 180s. Poll dropped 20s → 5s.
      Empty-room suppression in the orchestrator now keys on
      `hadOtherParticipants`, not on one specific reason.
- [x] **The counter is proven on a real Meet DOM, 2026-09-02.** It read real
      tile counts throughout a live call (1 → 4 → 3 → 1) and never once returned
      `null`, so the 180s unreadable fuse never armed. That was the risk in
      rewriting it: a counter that reads `null` against the real page would cut
      every meeting short at three minutes.
- [x] The room emptying exits in 60.3s, measured from `alone_detected` to
      `ended`. Exactly the 20s grace plus 40s delay. `hadOtherParticipants` came
      through `true`, so the orchestrator ran the pipeline instead of suppressing
      it, which is the rewiring that replaced the reason-string check.
- [ ] ⚠️ The `call_ended` / `call_view_gone` branch is still unproven on a real
      meeting. The 2026-09-02 run left the bot alone rather than tearing the call
      down, so the call view stayed up and `isInCall` stayed true. Needs a call
      that is ended for everyone, or the bot removed from it.
- [ ] Filter the bot's own tile from name events (the "shadow note" tile).
- [ ] Sturdier login-wall / anti-bot detection; auth-session refresh path.
- [ ] Concurrent meetings — orchestrator container-per-meeting under real load.
- [ ] Time-based flush for long meetings.
- [x] **Clock skew — root-caused and fixed** (`7a7eba5`), though not where
      `docs/decisions.md` records. It was never the live-stream-vs-recorder offset: raw
      PCM extraction was splicing out the WebM's stall gaps, so transcript time
      ran ahead of media time and the error accumulated. `recording_offset_s`
      stays 0 and correct.
- [x] Re-transcribed the one affected real meeting (Hire100x). Side effect
      worth knowing: speaker-attribution confidence rose 86%→94% and 61%→86%,
      because the interval-vote join finally compares the transcript against a
      timeline on the same clock. The name merge was quietly degraded too.
- [ ] Any future recording made before `7a7eba5` needs the same treatment — the
      fix is forward-only, since gap positions are not recoverable from a
      transcript already on the spliced clock.
- [ ] Add a cheap guard: compare extracted-audio duration against the mp4 after
      transcode and warn when they disagree by more than a second. This class of
      bug is silent by construction and cost a full session to find.

---

# Part B — Make it adoptable

## 6. Phase 3 — get data in

*Today there is exactly one way to create a meeting: a manual `POST` with a URL,
while the meeting is happening. That is the adoption ceiling.*

- [ ] **Calendar integration → auto-join.** Phase A is deliberately a scheduler,
      not a calendar mirror: one per-user OAuth account, one schedule table, and a
      five-minute rolling reconciliation of the next 48 hours. Modes are `all` and
      `manual`; event overrides and incremental sync tokens stay out until scale
      proves they are needed.
  - [x] Backend foundation written and locally verified 2026-08-18: encrypted refresh tokens,
        one-time OAuth state, strict Meet-link parsing, owner-scoped BullMQ IDs,
        rolling sync, cancellation, late-join guard, scheduled-start propagation,
        meeting-title propagation, and empty-room suppression. Migration `0009`
        passed against temporary Postgres; 22 API tests, the Redis idempotency test,
        and API/orchestrator/bot/media typechecks passed. Uncommitted.
  - [x] `/settings/integrations`: Calendar-only settings surface with connect,
        reconnect/disconnect, `all`/`manual`, last checked, loading, denied, and one
        actionable sync-error state. Empty, connected, denied, and mode-change paths
        were browser-verified at desktop and 640px. Web lint/typecheck/build passed;
        React Doctor is 100/100. Uncommitted.
  - [x] Real-account path — verified 2026-08-21. Migration `0009` applied to the dev
        database (`0008` had been applied out-of-band and needed reconciling into
        `drizzle.__drizzle_migrations` first). Google OAuth completed against
        `sukshamever@gmail.com`; the stored refresh token is AES-256-GCM ciphertext
        (`iv.tag.ct`), not a plaintext `1//` token. `manual` ↔ `all` both exercised.
        A live sync against Google succeeded — decrypt → refresh → list events →
        reconcile — with `last_error` null.
  - [x] Cancellation proven incidentally: three hand-seeded schedule rows with
        event IDs Google had never heard of were cancelled by the reconciler within
        one 5-minute cycle. Rows the reconciler does **not** recognise inside its
        48-hour window are exactly what it cancels.
  - [x] **Real scheduled-Meet path proven end to end, 2026-09-02.** A calendar
        event 2 minutes out produced one schedule row and exactly one delayed job
        in `gmeet-bot`; the orchestrator dispatched it, the container joined
        signed-in on an 82-day-old auth state, and lobby admission took 2 seconds
        unattended. Title propagated from the event onto the meetings row. The
        scheduled-start guard held: the bot read 1 participant twice before
        anyone joined and did not arm the alone timer. The schedule row ended
        `completed`.
  - [x] Whole pipeline behind it: transcode wrote a 616s mp4 and a poster,
        diarize bound a CSRC to a real name from 877 samples and wrote 154 named
        utterances, ingest finished `ready` with 0 quote-guard drops about 75
        seconds after the bot left. First real meeting through gpt-5-mini and the
        two-call summary; the 595-word recap tracked the argument, kept the
        numbers, named what was left unresolved, and flagged a garbled passage as
        garbled rather than guessing.
  - [ ] Keep the calendar unit and Redis tests until the live feature path passes;
        remove them afterward to match the repository convention.
  - [ ] **Google OAuth production verification. Confirmed as a hard gate, not a
        worry.** The refresh token stored on 2026-08-20 stopped working exactly
        seven days later: the last successful sync was 2026-08-27 and the next
        attempt returned `Google authorization ended`, flipping the account to
        `disconnected`. Reconnecting on 2026-09-02 restored it immediately. Until
        the app is verified, every user is silently cut off weekly. The failure
        path itself is good: status flips, the error is actionable, and
        `/settings/integrations` renders "Raven has stopped joining your
        meetings" with a reconnect button.
- [x] **Upload an existing recording.** `POST /meetings/upload/presign` → presigned `PUT` (R2 presigned `PutObject`, local `PUT /meetings/:id/upload` streaming via `writeStream`) → `POST /meetings/:id/complete` enqueues `transcode` + `diarize` with `speakersKey=null` fallback to `diarizeWithoutTimeline` (Speaker N) → `cb632a7`. Demoable without a bot.
- [x] **Bulk backfill import** — `POST /meetings/bulk-upload/presign` reuses the same presigned path per file; `web` drag-drop calls single vs bulk automatically → `cb632a7`.
- [x] Manual join UX in the dashboard — **done** `6c2330f` (`Join a meeting` + `Upload recording` buttons on `/`, `JoinDialog` → `POST /join-meet` → polls `GET /bots/:jobId/status` timeline, `UploadDialog` with drag-drop/title).
- [ ] **Zoom / Teams capture.** Container-per-meeting already generalizes; the
      capture layer is the only rewrite. Scope after Meet is genuinely solid.

---

## 6b. Surface audit — capability that had no UI

*Run 2026-08-21 by mapping every route in `api-server/src/api/routes/index.ts`
against whether any screen reaches it. Recorded because the same drift will
recur: the backend has consistently run ahead of the surfaces.*

- [x] `POST /bots/:jobId/stop` — had **no web client method at all**. Now reachable
      from a "Right now" block on Home, behind a confirm, with a toast on both the
      `cancelled` and `stopping` responses.
- [x] `GET /bots` — no client method. Now polled every 5s to drive that block.
- [x] `GET /meetings/:id/actions`, `POST /actions/:id/approve|reject` — no client
      methods. The agent-proposal loop, which `DESIGN.md` §2 lists as departure #1,
      was unreachable while a finished `ProposalCard` sat gallery-only. Now wired
      into `/m/[id]` as **"Raven would like to"**, between Decided and Someone needs to.
- [x] `GET /meetings/:id/export` — client method existed, no screen called it.
      Now in the meeting overflow menu.
- [x] Missing primitives, all three now built: **Sonner toasts** (a locked
      `DESIGN.md` §11 pick that was in `package.json` and wired nowhere, so every
      mutation failed silently), **`Confirm`** on base-ui `alert-dialog`, and
      **`Menu`** on base-ui `menu`. Rename/export/delete had been three raw buttons
      using `window.confirm()` and `window.location.href`.
- [x] The three primitives are verified at runtime, in `/design` on 2026-08-27.
      Menu opens with Rename / Export as Markdown / Delete meeting; Confirm opens
      with the "cannot be undone" copy, Cancel as the resting choice, and closes on
      Escape; all three toast variants render. Every section of the gallery renders,
      including `Up next` and `Proposals`, and the scroll-spy nav tracks.
- [x] The **wired** versions are verified too, on 2026-08-30, against the local
      fixture account and the seeded corpus. The proposal section on
      `/m/arch-review_2026-06-17_10-00-00` renders all four `agent_actions` rows
      between Decided and Someone needs to, and rejecting one moves the card to its
      dismissed treatment, fires the Sonner toast, and writes `rejected` to the
      table. The live block was exercised by enqueueing a bot job with the
      orchestrator down, so it parks at `waiting`: "Right now" appeared with the
      meet code and a running clock, Stop opened the confirm, and confirming removed
      the job and cleared the block.
- [x] Stop's copy assumed a bot that had already joined. A queued bot was offered
      "Stop recording?" / "Raven leaves the call and finishes uploading what it has",
      and cancelling it produced a toast whose headline said it never joined while
      the line under it promised the recording would be processed. The toast branched
      on the API's `cancelled` vs `stopping`; the description did not. Both now
      branch, and the confirm asks "Cancel this bot?" for anything that has not
      reached the call.
- [x] A meeting with no media claimed to be preparing a recording forever. Both
      `GET /meetings/:id/recording` and `/transcript` now answer 409 with a `reason`
      of `preparing` or `no_media`/`no_transcript`, decided by the meeting's own
      status, and the page renders nothing for the player (§7, exception-only) and an
      honest "No transcript" for the tab. `useRecording` also polled that dead 409
      every 20s forever; it now polls only while `reason` is `preparing`. Verified
      both branches by flipping the row's status and reading the endpoint.
- [x] **Approve recorded a failure for an integration that was never connected.**
      `execute()` threw `AdapterConfigError` for a missing `LINEAR_API_KEY`, the
      catch wrote `status: failed` with the error onto a row nothing had been
      attempted for, and returned 409. The client then made it worse: `errorMessage`
      reads `.message`, the action endpoints answer with `.error`, so the reason was
      dropped and the user saw "Couldn't run that action. / Conflict". Approve now
      checks `adapter.configured()` before executing and returns
      `reason: "not_connected"` without touching the row; `ApiError` carries `reason`
      through; the toast reads "Linear is not connected yet. / Connect it in
      Settings, then approve this again." Verified: the row stays `proposed`.
- [x] **"Edit first" never edited anything.** It was wired to `onEvidence`, so it
      seeked the player to the evidence timestamp, and on the Slack recap — which has
      no timestamp — it rendered with no handler at all. Renamed to "Play the moment"
      and no longer rendered when there is no moment to play. A real payload editor
      is still unbuilt; it belongs in Phase 5 with the rest of the actions surface.
- [x] **Names reworked across both screens.** The tab "What happened" sat directly
      above a section heading "WHAT HAPPENED"; the meeting page called action items
      "Someone needs to" while Home called the same data "Follow-ups"; and the three
      peer sections were in three different grammatical persons, one of which had
      Raven referring to itself. Now: tabs are Summary · Transcript with the
      duplicate heading deleted, sections are Decisions / Needs your approval /
      Follow-ups, Home is Live / Recent / Next up / Follow-ups, and the proposal card
      leads with the act ("File a Linear issue") instead of "Raven wants to file a
      Linear issue". Buttons are Approve / Play the moment / Dismiss. `/design` moved
      with them so the gallery cannot drift.
- [ ] `/design` overflows horizontally by 68px at a 678px viewport, with no overflow
      at 1024 or 1440. That is the already-known desktop-only shell showing up on the
      gallery page; recorded so the responsive item in Phase 1 has one concrete
      measurement attached to it rather than a general worry.
- [ ] The **present tense** was the missing surface, and is worth holding onto as a
      principle: Home covered the past (Recent) and the future (Up next) while a bot
      mid-call had nowhere to live. Stop was homeless because "in flight" was.

---

## 7. Phase 4 — get value out

*Everything the system knows is currently trapped behind someone remembering to
open a dashboard. Distribution is where a meeting tool actually lives.*

- [ ] **Post-meeting digest email** — summary, decisions, action items, cited
      links. Highest-leverage retention surface in the product and it needs no UI.
- [ ] **Share link** — a public, expiring link to a clip, a summary, or a whole
      meeting. The only viral loop this product could have. Signed, revocable,
      scoped to one artifact.
- [ ] **Clip export** — cut a citation span to a shareable mp4. The `[start,end]`
      already exists on every citation.
- [ ] **Slack/Discord delivery of the digest** — reuse the v3 adapter, no LLM in
      the path (already templated deterministically).
- [ ] **Webhooks** — deferred since 2026-06-12 for having no consumer. The digest
      and share features *are* the consumer now. Model as a BullMQ consumer inside
      api-server, not a fourth service.
- [ ] Notification when proposals await approval.

---

## 8. Phase 5 — actions surface

- [ ] Approve/reject UI on `/m/[id]` — `proposal.tsx` exists, the screen doesn't.
- [ ] Cross-meeting proposals inbox (`agent_actions_status` index already exists
      for exactly this query).
- [ ] ⚠️ Exercise Linear + Slack adapters against real credentials.
- [ ] Owner → Linear assignee mapping.
- [ ] Slack bot-token DMs with @-mentions (a webhook cannot mention).
- [ ] Integration settings — connect/disconnect, show configured state.
- [ ] A third integration (Notion page or Calendar follow-up) to prove the adapter
      contract generalizes.

---

# Part C — The bet

## 9. Phase 6 — compounding memory

*This is the thesis, and it is the only part of the product that Granola, Otter
and Fireflies do not already do. Everything above this line is a well-built
commodity meeting tool. Everything below is why someone would switch.*

**The gap in what's built:** the system treats every meeting as an island. It can
answer questions *about* meetings, but it holds no state *across* them — no memory
of what was promised, what changed, or what was never resolved. Retrieval is not
memory. This phase is where that gap closes.

### 6.1 Open questions — the missing third spine element
Extraction captures **decisions** (settled) and **action items** (assigned). It
does not capture **unresolved questions** — the thing raised, argued, and left
hanging. That is precisely the category humans forget between meetings, and it is
one field in the existing structured-output call.
- [ ] Add `open_questions` to the extraction schema, same quote-guard contract.
- [ ] Resolve them across meetings: a later meeting that answers one closes it.
- [ ] Surface per-meeting and globally ("12 things nobody has answered").

### 6.2 Commitment ledger
- [ ] Cross-meeting state per action item: promised → mentioned again → done →
      or **silently dropped**. The `completed_at` column is the first stone.
- [ ] Staleness: "Ankur committed to the SSO doc three weeks ago; it hasn't come
      up since." No competitor does this well, because it needs durable
      cross-meeting state rather than per-meeting summarization.
- [ ] Per-person commitment view.

### 6.3 Decision timelines + supersession
- [ ] Link decisions on the same topic into a chain — made, revised, reversed,
      with who and when. The eval corpus already contains a "scratch that" revised
      decision as an adversarial case, so the hard part is half-understood already.
- [ ] `/ask` answers "what did we decide about X" with the **current** decision and
      its history, not the highest-scoring chunk.
- [ ] **Contradiction detection** — flag proactively when a new meeting contradicts
      a standing decision. Proactive, not query-time. This is the single most
      demo-able feature in the doc.

### 6.4 Pre-meeting brief
- [x] Before a recurring meeting: what you decided last time, what's still open,
      what was promised and by whom. Lives in the `Up next` block on Home rather
      than waiting on a delivery channel. `GET /calendar/upcoming` returns a
      `last_time` per row: the decisions and the still-open action items of the
      most recent `ready` meeting sharing the event's title. Every decision links
      into that recording at its own second. Folded to one line by default,
      because a brief is document-density inside a list-density row (§5, and the
      same tension TODOS item 5 raised for the calendar block).
- [x] "Last time" is a title match, not recurrence handling. The calendar already
      propagates the event title onto the meeting it produces, so occurrences of
      a recurring event share one and a one-off simply has no previous instance.
- [ ] Delivered by email/Slack on the calendar trigger (needs Phase 4). The
      content is built; only the channel is missing.
- [ ] ⚠️ Verified against a hand-seeded `calendar_schedules` row, not a real
      recurring event. Rides with the scheduled-Meet proof.

**Why this matters strategically:** every competitor competes on the *post*-meeting
summary. Nobody occupies the five minutes *before* a meeting, and that is where a
memory product's value is most obvious — the summary is a record, the brief is
leverage. Cheapest differentiated feature per line of code in this document.

### 6.5 People and accounts
- [ ] **Person view** — everything X said across all meetings, what they own, what
      they've committed to, where they appear.
- [ ] **Entity resolution** — "Ankur", "Acme", "the SSO blocker" unified across
      meetings. A small entities table, *not* GraphRAG (explicitly rejected at
      this scale, and that decision stands).
- [ ] **Account timeline** for sales — how a deal evolved across calls. The eval
      corpus already demonstrates it: Acme goes 10→25 seats and $30k→$45k between
      two same-title calls, with SSO/SAML as the standing blocker.

### 6.6 The correction flywheel
- [ ] Let a user fix a wrong speaker name or a bad extraction inline.
- [ ] **Corrections survive re-ingest** — same evidence-quote-keyed pattern that
      `completed_at` already proves works against delete-then-insert.
- [ ] Corrections feed the golden set. User fixes become eval data, and the eval
      measures whether the system got better.

**Why this is worth building even though it's unglamorous:** it converts usage into
measurable quality improvement, which is the strongest possible answer to "how do
you know your AI system is getting better?" It is also, bluntly, the best interview
story in this document.

### 6.7 Honest confidence
- [ ] Surface diarization confidence instead of asserting a wrong name. The merge
      already computes per-utterance confidence and then discards it.
- [ ] Low-confidence attribution renders as unattributed, not as a guess.

---

# Part D — Make it real

## 10. Phase 7 — production readiness

### Steps remaining before the first deploy (one VM, docker compose)

The compose file already is the single-VM architecture. Nothing structural
changes; the Docker socket on one host is accepted for now and is what a Fly
Machines or Kubernetes backend replaces later, behind the same orchestrator
contract. In order:

1. [ ] **Run the pipeline in R2 mode once.** Every real run so far used the
       local store. Set the R2 keys, capture one meeting, watch transcode,
       diarize and ingest read and write the bucket.
2. [ ] **Publish the Google OAuth app.** Testing status expires refresh tokens
       after seven days; the calendar and sign-in both die weekly until this is
       done. Flip to Production first (removes the expiry, shows an unverified
       warning), then request verification for the calendar scope.
3. [ ] **Managed Postgres with pgvector, managed Redis, R2 with a CDN.** Point
       `DATABASE_URL`, `REDIS_URL` and the R2 keys at them. Run migrations as
       an explicit step before the first boot and on every deploy.
4. [ ] **Bot image.** Build it on the VM or push to a registry and set
       `BOT_IMAGE`. Produce the Google auth state on a machine with a screen and
       copy `bot/.auth/state.json` to the VM; it mounts read-only as today.
5. [ ] **Fix the compose file for a real host.** Replace `${PWD}` binds for
       auth, recordings and screenshots with absolute paths. Stop publishing
       Postgres on the public interface. Lower `MAX_CONCURRENT_BOTS` to what the
       box can hold (each bot is Chromium under Xvfb with 2 GB shm; 4 vCPU /
       8 GB covers two or three).
6. [ ] **Reverse proxy with TLS in front of the API.** Caddy is one file.
7. [ ] **Deploy the web app.** Vercel with `API_ORIGIN` set is least work;
       otherwise add a Dockerfile and serve it through the same proxy. Set
       credentialed CORS and the cookie domain, and close the deferred CSRF
       item at the same time, since credentialed CORS is what makes it real.
8. [ ] **Production secrets.** `JWT_SECRET`, `CALENDAR_TOKEN_KEY`,
       `UNLIMITED_EMAILS`, `WEB_APP_URL`, both Google redirect URIs on the
       OAuth client. `assertConfig()` refuses to boot on the committed dev
       values, so this surfaces on the first start.
9. [ ] **Rate limit and a per-user spend cap on `/ask`.** The one open door:
       an authenticated user can spend unbounded OpenAI budget.
10. [ ] **Delete the raw webm once the mp4 exists.** The only unbounded
        resource; it filled the dev disk once already.
11. [ ] **CI: typecheck and tests on push.**
12. [ ] **Error tracking and structured logs.** Sentry, plus per-call-type
        cost logging.
13. [ ] **Auth hardening leftovers.** Register race → 409, `lower(email)`
        unique index, async scrypt.

Soon after, not before: retention policy, an onboarding path that survives an
empty account (done on the web side 2026-09-03), the concurrency test under
real load, Stop verified against a live container, the audio-duration guard
after transcode, and a pool of bot accounts before opening to strangers, since
one shared Google identity joining many unrelated calls is a lockout waiting to
happen.


- [ ] **Deploy.** The hard part is the orchestrator needing `docker.sock` to spawn
      bots. Either bot-as-a-cloud-machine per meeting, or document the self-host
      constraint honestly. Managed Postgres + Redis, R2 + CDN, staging + prod.
- [ ] CI: typecheck + tests on every push; eval on retrieval/prompt changes.
- [ ] Observability: structured logging, LLM/agent tracing (tool calls, tokens,
      latency), **per-call-type cost tracking** — tool use bills, judge/extract
      doesn't, and that asymmetry has already burned real money.
- [ ] **Rate limiting + per-user cost ceiling on `/ask`.** An authed user can
      currently spend unbounded OpenAI budget. This is the one open door in an
      otherwise well-defended system.
- [ ] Error tracking (Sentry) + alerting.
- [ ] **Storage lifecycle.** Raw webm is ~120MB/meeting and is dead weight once
      the mp4 exists. Tier or expire it; keep the mp4. Not hypothetical: on
      2026-08-14 the dev machine hit 100% disk with `recordings/` at 165MB for
      *two* real meetings, and a write failed mid-session. Costs and bytes both
      compound silently, and this is the only unbounded resource in the system.
- [ ] **Retention policy** — configurable auto-delete after N days. Pairs with
      delete (Phase 1) and is what a self-hosting org will ask for first.
- [ ] **Access audit log** — who read which meeting. Table stakes for any buyer
      storing recordings of third parties.
- [ ] **PII / secret redaction.** Meetings contain credentials, salaries, personal
      details. At minimum detect and mark sensitive segments; ideally redact at
      ingest. A memory product that permanently indexes an accidentally-spoken API
      key is a liability.
- [ ] Security pass: signed media URLs, OAuth token storage, dependency audit,
      prompt-injection re-review of the action path.
- [ ] Deferred auth hardening from the `e7d7bf4` review: register-race → 409,
      `lower(email)` unique index, async scrypt, CSRF when CORS is credentialed,
      cascade-on-user-delete.

---

## 11. Phase 8 — depth

### Retrieval, eval-gated only
- [ ] **Temporal resolution tool** — "latest", "most recent", "before the SSO
      decision". The agent has timestamps but no explicit temporal operator, and
      date-scoped questions are already the highest-variance failures in the eval.
      Targeted fix with measured evidence behind it.
- [ ] **Revisit query decomposition.** D3 rejected a decompose tool. Aggregation is
      now a known, measured failure mode — so revisit *with the eval as the gate*,
      not on vibes. Reverse the decision only if the metric moves.
- [ ] Reranker + contextual retrieval — still **deferred**: measured gaps are
      routing and aggregation, not chunk ranking.
- [ ] Streaming `/ask` (SSE) with inline citation markers. — tool-step SSE shipped on `POST /ask/stream` (live checklist in `AskPanel`), token stream + inline markers still TODO.
- [ ] The gpt-4o / gpt-5-mini experiment at suite scale (needs a higher OpenAI
      tier; 30k TPM cascades into 429s).
- [ ] Golden set toward ~100 Q, eval in CI.
- [ ] Fix the q17 contamination false positive (keyword overlap with `must_not_say`).

### Media
- [ ] HLS ladder, waveform scrubber, sprite thumbnails — only worth it with real
      multi-viewer traffic. A single mp4 covers the dashboard.

### Tests + story
- [ ] Coverage: chunker, RRF fusion, quote guard, citation builder + clock-skew
      math, tolerant resolvers, ingest idempotency, one real E2E path.
- [ ] Docs, demo video, and the design-reasoning writeup (*why extraction-first,
      why not pure-vector / long-context / GraphRAG*). First-class deliverable,
      not a wrap-up task.

---

## 12. Bets — need a spike before they're planned

*Not scheduled. Each needs a half-day proof before it earns a phase.*

- **In-meeting Q&A.** The bot is already in the room with DOM access, and `/ask`
  already works. Someone types "@raven what did we decide about auth last time?"
  in Meet chat and the answer appears mid-meeting. The infrastructure is *already
  built* — this is plumbing, not research. Highest demo-impact-per-effort item
  anywhere in this document. Spike: can the bot reliably read and post chat?
- **Voice fingerprinting across meetings.** A speaker embedding reused so a person
  is recognized in meeting #40 without a fresh CSRC bind. Natural extension of the
  diarization work and genuinely differentiated. Spike: does an off-the-shelf
  embedding separate speakers on the mono composite mix, given the SFU constraint?
- **Live nudges** — "five minutes left, three agenda items untouched." Capability
  exists; the risk is being annoying. Spike is a design question, not a technical one.
- **Meeting-quality signal** — talk-time distribution, who never spoke, whether
  decisions were actually reached. Derivable from `speakers.jsonl` today. Unclear
  whether it's insight or a gimmick.
- **Agenda ↔ outcome matching** — take the calendar invite's agenda, report which
  items were actually covered. Needs Phase 3 first.

---

## 13. Non-goals — decided, not deferred

GraphRAG / knowledge graph · full multi-tenant SaaS (orgs, RBAC, billing) · a SaaS
integration platform as the engine · per-participant audio capture (proven
impossible) · real-time streaming transcription as a product surface (batch is
cheaper and nothing consumes it live — revisit only if in-meeting Q&A ships).

---

## 14. Landmines

*Every one of these has cost real debugging time. Read before touching the stack.*

| Trap | Reality |
|---|---|
| **Postgres port roulette** | Two *other* projects hold `:5432` (crashpad) and `:5433` (xeliport), and they change. Raven's own compose postgres is now on **`:5434`** with its data in the `meet-bot-ai_pgdata` volume; `docker-compose.override.yml` and `api-server/.env` must agree, and both are gitignored. If the corpus looks empty or a column is "missing", you are talking to someone else's database. |
| **`web/node_modules`** | Can be empty even though the repo looks complete — `tsc` then resolves React from a parent directory and emits hundreds of phantom errors. `pnpm install` in `web/`. |
| **Port 3000** | Taken by your other Next.js app. Run api-server on `PORT=3100`. |
| **Node version** | Shell default is v16 — no global `fetch`, so the OpenAI SDK crashes. The pnpm in `PNPM_HOME` is 11.x and needs Node 22: `export PATH="$HOME/Library/pnpm:$HOME/.nvm/versions/node/v22.23.2/bin:$PATH"`. The corepack shim under Node 20 is broken. |
| **Package manager** | `AGENTS.md` makes pnpm mandatory across the repository. Never use npm or npx. The web, bot, and media-worker workspace files require `packages: ['.']`; without it pnpm fails before running a command. |
| **pnpm in api-server** | `pnpm add`/`update` can prune rolldown's native binding and break vitest → `pnpm install --force`. If pnpm itself is unavailable, restore it with the machine's package/version manager, not npm or npx. |
| **pnpm arg parsing** | Bareword script args can mis-parse; use `pnpm exec tsx <file> <args>` when a package script cannot forward them cleanly. |
| **OrbStack** | Drops mid-session. `open -a OrbStack`. |
| **Stray orchestrator** | A `tsx` orchestrator from an earlier session can still be running against the compose Redis. Any `join-meet` job you enqueue to test the API, fake URL included, gets a real bot container spawned for it. Check `ps` for `tsx` node processes before enqueuing. |
| **OpenAI billing** | Complimentary shared-data tokens **exclude tool use and embeddings**. The `/ask` loop *is* tool use, so it bills at full rate. Iterate with `eval:answer --fast` and low `--runs`. |
| **Drizzle + pgvector** | drizzle-kit does not emit `CREATE EXTENSION vector`. Prepended manually in `0000`. |
| **Next.js 16** | Not the Next in training data. Read `node_modules/next/dist/docs/` before writing route code (`web/AGENTS.md`). |

---

## 15. Session log

One line per session. Newest first.

| Date | What moved | Commits |
|---|---|---|
| 2026-09-03 | **Meetings search: one box, no flicker.** The Type and Participant fields were exact-match filters on values a user cannot guess (extracted free-text type, JSON containment on a name), so they are gone; the one search box now also matches type and participant names server-side. The list flickered because a new search term is a new query key, so it went pending and showed skeletons on every keystroke; `keepPreviousData` plus a 60s stale time keeps the last results on screen at 60% opacity until the next page lands, and a search you have already typed comes back from cache. | uncommitted |
| 2026-09-03 | **First-run Home.** Design shotgun with three hand-built HTML directions (document, three doors, worked example) on the real tokens; the pick was a combination: document voice, calendar banner as the one solid control, join-now a tier below, no upload, allowance as a footnote. Built as `FirstRun` and added to the gallery. | uncommitted |
| 2026-09-03 | **Google sign-in and a free allowance.** Sign-in reuses the calendar's OAuth client with a second redirect URI and identity scopes only; the state table gained a `purpose` column and a nullable owner so both flows share it. The generic OAuth pieces moved out of the calendar module into `platform/google/oauth.ts` so auth does not depend on calendar. Allowance is a `plan` column plus config, counted from meeting rows and reserved bot jobs rather than a stored counter. Two test join jobs were picked up by a stray orchestrator and spawned real bots against a fake URL, which is now a landmine row. | uncommitted |
| 2026-09-02 | **First full live run. Most of what was unproven is now proven.** A real calendar event produced one schedule row and exactly one delayed job, the orchestrator dispatched it, and the bot joined signed-in and was admitted unattended in 2 seconds on an auth state 82 days old. Live Deepgram returned 209 segments, which closes `40dc3c0` — built 2026-06-27 and unverified until today, the oldest risk in the project. The rewritten participant counter read real tile counts on the real Meet DOM and never returned `null`, which was the failure mode that would have cut every meeting short at 180s. The room emptying exited in 60.3s. Title propagated, the speaker timeline bound a CSRC to a real name from 877 samples, transcode wrote a 616s mp4 and poster, diarize wrote 154 named utterances, and ingest reached `ready` with zero quote-guard drops about 75 seconds after the bot left. The 595-word summary on a real rambling conversation kept the numbers, named the unresolved decision, and flagged a garbled passage instead of guessing. Also confirmed the Google testing-mode expiry as a hard gate: the token died exactly 7 days after it was stored. Not covered: the `call_ended` branch, because the bot was left alone rather than the call being torn down, and the live-session UI, because nobody opened Home while a bot was in flight. | uncommitted |
| 2026-09-02 | **Tasks you can ask for, and a brief before the meeting.** Re-ingest deleted every action item on a meeting and re-inserted what extraction found, carrying only `completed_at` forward by evidence quote. Anything not extracted had no quote to be carried by, so it was not just reset, it was gone — and re-ingest fires on retry, on re-extraction, and fired across the whole corpus yesterday. `action_items.source` now separates the two and the delete only touches extracted rows. Survivors are pushed past the extracted `seq` range, which is unique per meeting and is what `propose.ts` keys its maps on. `create_action_item` gives the ask agent its first write tool, owner-scoped, refusing when there is no authenticated user so the CLI and eval paths cannot write into the corpus they read across. Tasks without a quote cannot become proposals, which the typechecker caught on its own. Auto-anchoring a task to a transcript moment was built and then removed: against chunks it put a task about the clock offset on the database discussion two minutes away, and against extracted records it fired hardest when the task duplicated one that already existed. A task you asked for does not need a moment to be trusted. The pre-meeting brief renders in `Up next` from `last_time` on the upcoming payload. | uncommitted |
| 2026-08-31 | **Extraction moved to gpt-5-mini and split into two calls.** The summary was a 3-5 sentence restatement of the decision list rendered directly beneath it, so it carried nothing the reader could not already see. It now writes the reasoning instead: what was weighed, what was rejected, the numbers said out loud, who held which position, what was left open. Prompt tuning alone could not get there. Every model tested rendered the decisions into the summary as well when it held their schemas in the same call, so records and summary are now separate calls and the summary call is told what has already been shown. gpt-5-mini found 11 decisions in the arch review against gpt-4o-mini's 5, split them correctly across Sarah, Alex and Jordan instead of crediting all five to Sarah, and caught Alex's benchmark commitment, which had never entered the system. Quote guard dropped nothing on either model. On sales calls it extracts fewer decisions, which is correct: Northwind is a discovery call whose only forward-looking lines are next steps, so zero decisions is the right answer and the old count was over-extraction. Eval: fact 0.69 to 0.771, faithfulness 0.87 to 0.977. Deleted 145MB of raw webm that already had an mp4. | uncommitted |
| 2026-08-30 | **Approve, "Edit first" and the naming, after the surfaces went in.** Approve on an unconnected integration wrote `failed` to a row nothing had been tried for and surfaced as the bare word "Conflict", because the API answers with `.error` and the client only read `.message`. Both halves fixed; the row now stays `proposed` and the toast names Linear. "Edit first" was seeking the player, not editing, and was inert on any proposal without a timestamp — renamed to what it does. Media-less meetings stopped claiming to be preparing a recording, and stopped polling a 409 that can never clear. Names reworked to one set across both screens: Summary · Transcript, Decisions / Needs your approval / Follow-ups, Live / Recent / Next up. Landed as the surfaces commit this row was written in, one after `626a111`. | — |
| 2026-08-29 | **End detection rebuilt; the wired surfaces verified.** Root-caused the bot overstaying: there was no end-of-call detector at all — the `/bye` URL check matches a path Meet retired, `isKicked` matched post-call copy against `textContent("body")`, and the surviving `alone_too_long` path was gated behind a participant counter that fell back to scraping any digits on the page whenever the tiles were gone. Proved it in Chromium (ended call with a stale badge read 3; a bare post-call screen read null and froze the timer). Exit is now driven by the call view, the counter reads tiles only, and every path is bounded (15s/60s/180s). Then brought the stack up against the local fixture account and closed §6b: proposals render and reject end to end with the toast and the DB write, and the "Right now" block plus its confirm were exercised with a parked bot job. Fixed Stop's copy, which promised a queued bot's recording would be processed. Found: media-less meetings claim to be preparing a recording forever. | `626a111` |
| 2026-08-21 | **Calendar proven end to end on a real account; Home restructured; capability audit closed four orphans.** Applied `0009` (reconciling an out-of-band `0008` into the migrations journal first), completed real Google OAuth, and confirmed the refresh token is stored as ciphertext. Split `/` into Home (greeting · Recent · Up next) and `/meetings` (archive · search · Join · Upload); added `GET /calendar/upcoming` + `UpNext` with four calendar-aware empty states; cut plain search. Built the missing primitives — Sonner toasts, `Confirm`, `Menu`, `Dialog`, `Sheet` — and used them to give `POST /bots/:jobId/stop` a home ("Right now" on Home) and to wire the agent-proposal loop into `/m/[id]`. Web typecheck/lint/build green (2 pre-existing lint errors untouched), 22 API tests pass. ⚠️ No new UI verified in a browser. | uncommitted |
| 2026-08-18 | **Calendar Phase A foundation + UI.** Added migration `0009`, encrypted per-owner OAuth account/state, rolling 48h reconciler, deterministic delayed jobs, cancellation/late guards, scheduled metadata through bot→ingest, empty-room suppression, Calendar worker/routes, and `/settings/integrations` using existing Raven components. Verified temp Postgres migration, Redis idempotency, 22 API tests, all service typechecks, web production build, browser states at 640px, and React Doctor 100/100. Added repository pnpm-only rule and repaired pnpm workspace declarations. ⚠️ Real Google OAuth and scheduled Meet remain unverified. | uncommitted |
| 2026-08-15 | **Phase 2 started — rebuild + owner stop.** Rebuilt `meet-bot:latest` (`20c8d65b`, `--no-cache`) and verified transcriber fix in image; owner can now `POST /bots/:jobId/stop` (api `controlQueue` + orchestrator `bot-control` worker + `dockerManager.stopByJobId` with `com.meetbot.jobId` label). Recording consent decided: user-based exit, no auto chat announcement. ⚠️ not yet verified on a live meeting/container. | `f690e5f` |
| 2026-08-16 | **Phase 3 — ingest + dashboard.** Upload (`POST /meetings/upload`, bulk `bulk-upload`) reusing transcode+diarize with timeline-free fallback (`diarizeWithoutTimeline`), plus dashboard `Join a meeting` (polls `GET /bots/:jobId/status`) and `Upload recording` dialogs. `6c2330f` typecheck + 19 tests pass. Calendar deferred for dedicated planning. | `6c2330f` |
| 2026-08-16 | **Stop landed.** Committed `POST /bots/:jobId/stop` (`f690e5f`) — typecheck + 19 tests pass. Next: Phase 3 (upload). | `f690e5f` |
| 2026-08-15 | **Phase 1 done.** Pipeline status (`transcoding/diarizing/ingesting/ready/failed` + `status_error` + retry) · delete/export/rename · list filters (`q/type/participant/from/to`) · plain `GET /search` + speaker filter. Verified: `GET /meetings?q=sales`, `GET /search?q=SSO`, speaker `Ankur`, `PATCH` rename, `DELETE` + `GET /export`. | `d8196ca` |
| 2026-08-15 | Ask streams live — `askStream` generator + `POST /ask/stream` SSE + `LiveSteps` checklist replaces fake `Thinking`. `POST /ask` kept for eval. ⚠️ built + typechecked, not yet verified against a live OpenAI call. | `9d26057` |
| 2026-08-14 | **Phase 0 closed.** Transcode slice verified + landed; playback endpoints with Range; `/m/[id]` with player, chapters, virtualized transcript, captions; citation loop wired (every citation in the product was inert); ask scoped to one meeting. Root-caused the audio/video clock splice, re-transcribed the real meeting and verified it against the mp4's own audio. Also fixed `"null"` owners and a dead `onPlay`. | `7417818` `3cdaf7f` `7a7eba5` `7a70036` `1dfcd01` `d0387d9` `ed40ea0` `b36bb7a` |
| 2026-08-11 | Scrollbars brought onto the palette. Wrote this plan and dropped the stale `TODO.md`. | `7e48aa7` `2a693ca` |
| 2026-08-10 | Web dashboard: follow-up completion, global palette, answer states. PR #3 merged. | `81b9a99` |
| 2026-08-09 | Cut to two player modes and let the tab pick between them; title and detail first, with room. | `05d6517` |
| 2026-07-21 | Auth + per-user isolation; cross-tenant IDOR found and fixed in review. | `e7d7bf4` |
| 2026-07-18 | v3 action proposer with human-gated Linear/Slack execution. | `412f987` |
| 2026-07-08 | v4 diarize worker wired to bot completion over R2. | `56b1902` |
