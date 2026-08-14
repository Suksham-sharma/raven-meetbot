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

Part C is the differentiated work. It is sequenced *after* adoption plumbing but
*before* production polish on purpose: compounding memory is worthless without a
corpus to compound, and pointless to deploy if it isn't built.

### Where the other docs stand

| Doc | Status | Use for |
|---|---|---|
| **`FUTURE_PLAN.md`** (this) | **Live spine** | What's done, what's next |
| `DESIGN.md` | **Live, enforced** | Every visual/UI decision. Read before writing any component |
| `web/AGENTS.md` | **Live** | Next.js 16 rules — read `node_modules/next/dist/docs/` first |
| `FRONTEND-PLAN.md` | Live reference | Screen-level frontend detail, open UX questions |
| `API-SURFACE.md` | Live reference | Endpoint contracts |
| `PLAN.md` | Historical | v2 architecture decisions + rationale (still the "why") |
| `ROADMAP.md` | **Superseded by this doc** | Keep for the risk register and non-goals |

---

## 1. Position

**Branch:** `main` = `7e48aa7`, ahead of origin — **not pushed**.

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

**The one-line summary:** Phase 0 is done and honest. Phase 1 is next — real
pipeline status, delete/export, and plain search.

---

## 2. Done

Condensed. Detail lives in the linked commits and `PLAN.md`.

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

**Baseline to beat:** answer fact ~0.69 · faithfulness ~0.87 · grounded 0.96 ·
evidence recall ~0.72 with high per-question variance. That variance is a
**gpt-4o-mini capability ceiling**, diagnosed and confirmed — stop prompt-tuning it.

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
- [ ] Real `meetings.status` written by each worker (`recording` → `transcoding` →
      `diarizing` → `ingesting` → `ready` | `failed`), so state is read not inferred.
- [ ] Per-stage failure surfaced with a reason, not a silent null column.
- [ ] **Retry a failed stage from the UI.** A failed diarize currently needs a shell.

### Data the user owns
- [ ] **Delete a meeting** — row, children, and R2 objects. No delete path exists
      anywhere today. This is legal exposure (you store recordings of third
      parties), not a missing button.
- [ ] **Export a meeting** — transcript + summary + decisions as markdown/JSON.
      Corollary of delete: if they can't get data out, they can't leave.
- [ ] Rename a meeting (`PATCH /meetings/:id`). No mutation on domain data exists.

### Finding things
- [ ] Meetings list: search + filter (date, participant, type, title).
- [ ] **Plain search endpoint** — hybrid search without the LLM loop. Faster,
      ~free, and the right tool for "find where we said X". `/ask` is overkill
      for lookup and bills for it.
- [ ] **Speaker-filtered retrieval** — "what did Ankur say about X". Chunks
      already carry a speaker; hybrid search has no filter for it. Cheap.

### Quality bar
- [ ] Empty / loading / failure states as a dedicated pass, not sprinkled.
- [ ] Onboarding: an empty account dead-ends today. Sample meeting, or a first-run
      flow that dispatches a bot.
- [ ] Accessibility pass (ink scale is AA; the rest is unaudited).
- [ ] Responsive — the 232/fluid/420 shell assumes a desktop.
- [ ] Keyboard-first navigation beyond ⌘K.
- [ ] Typed search params module — `?t=` / `?cue=` / `?q=` is the whole citation
      system and `useSearchParams()` is untyped.
- [ ] Decide `/answers` persistence — needs a table that doesn't exist.

---

## 5. Phase 2 — capture: reliability + consent

*The least-verified layer in the system, and everything downstream is worthless
without it.*

- [ ] ⚠️ **Rebuild `meet-bot:latest`, re-verify the live-transcription fix
      (`40dc3c0`) on a fresh meeting.** Oldest outstanding risk in the project.
- [ ] **Recording consent** — the bot announces itself in chat on join, and the
      tile name says what it is. Two-party-consent jurisdictions are real, and
      "a silent bot recorded me" is the one failure that ends the product.
- [ ] **Host controls** — a participant can ask the bot to stop; it leaves and
      marks the recording partial.
- [ ] End-detection: the bot stayed ~12 min after a meeting ended — only
      `alone_too_long` fired.
- [ ] Filter the bot's own tile from name events (the "shadow note" tile).
- [ ] Sturdier login-wall / anti-bot detection; auth-session refresh path.
- [ ] Concurrent meetings — orchestrator container-per-meeting under real load.
- [ ] Time-based flush for long meetings.
- [x] **Clock skew — root-caused and fixed** (`7a7eba5`), though not where
      `PLAN.md` predicted. It was never the live-stream-vs-recorder offset: raw
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

- [ ] **Calendar integration → auto-join.** Connect Google Calendar, pick which
      meetings the bot joins (all / external only / manual). Every competitor has
      this; it is the difference between an impressive system and something used
      on Monday. Largest single adoption unlock in this doc.
- [ ] **Upload an existing recording.** The pipeline is already file-based, so an
      upload endpoint reuses transcode → diarize → ingest untouched. Cheap, and it
      makes the product demoable *without running a bot at all* — which also
      de-risks every demo against Meet's anti-bot behaviour.
- [ ] **Bulk backfill import** — point it at an archive of existing recordings or
      an Otter/Granola/Fireflies export. Migration path is how tools get adopted;
      a memory product with an empty corpus has nothing to compound.
- [ ] Manual join UX in the dashboard — paste a URL, watch the bot join. Today
      this is curl.
- [ ] **Zoom / Teams capture.** Container-per-meeting already generalizes; the
      capture layer is the only rewrite. Scope after Meet is genuinely solid.

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
- [ ] Before a recurring meeting: what you decided last time, what's still open,
      what was promised and by whom.
- [ ] Delivered by email/Slack on the calendar trigger (needs Phase 3 + 4).

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
- [ ] Streaming `/ask` (SSE) with inline citation markers.
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
| **Node version** | Shell default is v16 — no global `fetch`, so the OpenAI SDK crashes. `export PATH="$HOME/.nvm/versions/node/v20.17.0/bin:$PATH"`. |
| **pnpm in api-server** | `pnpm add`/`update` prunes rolldown's native binding and breaks vitest → `pnpm install --force`. Corepack shim broken on node 20 → `npx -y pnpm@10.17.0`. |
| **pnpm arg parsing** | Bareword script args (`all`) mis-parse → call `./node_modules/.bin/tsx` directly. |
| **`scripts/demo.sh`** | Orphaned workers retry-loop against a dead Redis forever and grow `.demo-logs/` past 100MB. Kill them when done. |
| **OrbStack** | Drops mid-session. `open -a OrbStack`. |
| **OpenAI billing** | Complimentary shared-data tokens **exclude tool use and embeddings**. The `/ask` loop *is* tool use, so it bills at full rate. Iterate with `eval:answer --fast` and low `--runs`. |
| **Drizzle + pgvector** | drizzle-kit does not emit `CREATE EXTENSION vector`. Prepended manually in `0000`. |
| **Next.js 16** | Not the Next in training data. Read `node_modules/next/dist/docs/` before writing route code (`web/AGENTS.md`). |

---

## 15. Session log

One line per session. Newest first.

| Date | What moved | Commits |
|---|---|---|
| 2026-08-14 | **Phase 0 closed.** Transcode slice verified + landed; playback endpoints with Range; `/m/[id]` with player, chapters, virtualized transcript, captions; citation loop wired (every citation in the product was inert); ask scoped to one meeting. Root-caused the audio/video clock splice, re-transcribed the real meeting and verified it against the mp4's own audio. Also fixed `"null"` owners and a dead `onPlay`. | `7417818` `3cdaf7f` `7a7eba5` `7a70036` `1dfcd01` `d0387d9` `ed40ea0` `b36bb7a` |
| 2026-08-11 | Scrollbars brought onto the palette. Wrote this plan and dropped the stale `TODO.md`. | `7e48aa7` `2a693ca` |
| 2026-08-10 | Web dashboard: follow-up completion, global palette, answer states. PR #3 merged. | `81b9a99` |
| 2026-08-09 | Cut to two player modes and let the tab pick between them; title and detail first, with room. | `05d6517` |
| 2026-07-21 | Auth + per-user isolation; cross-tenant IDOR found and fixed in review. | `e7d7bf4` |
| 2026-07-18 | v3 action proposer with human-gated Linear/Slack execution. | `412f987` |
| 2026-07-08 | v4 diarize worker wired to bot completion over R2. | `56b1902` |
