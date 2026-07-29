# Roadmap / TODO

_Living doc. Check off items as they ship. Each phase is independently demo-able — you can stop after any phase and still have a complete product._

## Where we are

**v1 + v1.x (shipped):** Bot joins Google Meet signed-in, records to R2 (or local disk) via multipart streaming upload, live-transcribes via Deepgram, captures a speaker-attribution timeline, real-time status API, Docker-per-meeting isolation. Three-service architecture (api-server / orchestrator / bot). Only v1.x item left open is webhooks (deferred). Next: confirm name-binding on a real meeting, then v2.

## Where we're going

**The thesis:** commodity meeting-bot space is crowded (Fireflies, Granola, Otter, Read.ai). The uncrowded angle is _compounding org memory_ + _agentic post-meeting action_ + _self-hosted_. Build that, own it.

**Audience for the demo:** HN / OSS crowd + hiring managers. Every phase below should produce either (a) a 30-second video moment worth posting or (b) a system a staff eng would nod at in an interview.

---

## Phase v1.x — Finish v1 properly before moving on

Small cleanup that makes v1 actually feel done. One weekend.

- [x] **Plumb R2 recording URL back into status API.** Shipped.
- [ ] **Webhooks on state change.** Deferred (2026-06-12): external consumers only, none exist yet. When built: model as a BullMQ queue consumer inside api-server — not a 4th service, not inline fire-and-forget from the orchestrator.
- [x] **Retry / poison-queue handling.** Shipped — 3 attempts exp backoff; only pre-join failures retry, post-join failures are unrecoverable by design.
- [x] **Cost tracking per meeting.** Shipped — `{deepgramSeconds, r2BytesStored, computeMs}` in status API.
- [x] **Speaker timeline capture** (2026-06-12 — replaces "per-participant capture", which is impossible; see superseded note below). Bot logs RTP contributor (CSRC) audio levels + a self-calibrating DOM speaking indicator, binds contributor ids to display names automatically, streams `{meetingId}.speakers.jsonl` to R2. `speakers` key surfaced in the status API. v4 consumes it for name attribution.

## Phase v2 — Raven Memory (Approach B)

**The "it KNEW something" build.** Every meeting becomes searchable across the whole history. Side-panel UI + `/ask` endpoint that returns cited 10-second clips.

~2 weekends.

### v2.0 — Memory pipeline

- [ ] Add Postgres + `pgvector` service to `docker-compose.yml`.
- [ ] New service: `memory-worker` (BullMQ consumer subscribing to `meeting.completed` events).
- [ ] Worker: fetch `transcript.jsonl` from R2 → chunk by ~30s utterance window → embed with `text-embedding-3-small` → insert rows `{meeting_id, start, end, speaker, text, embedding}`.
- [ ] `GET /api/v1/ask?q=...&k=5` — vector cosine-similarity search → return top-k clips with `{meetingId, start, end, speaker, text, webmUrl#t=start}`.
- [ ] `GET /api/v1/meetings/:id/transcript` — paginated JSON (segments + speaker + timestamps).
- [ ] `GET /api/v1/meetings` — list with summary + length + participants.

### v2.1 — Dashboard UI (the demo)

- [ ] New `dashboard/` service. Vite + React + Tailwind. Ship as 4th compose service on port 5173.
- [ ] Meetings list view. Click a meeting → transcript view with inline `<video>` player seeked by timestamp.
- [ ] Global search bar → calls `/api/v1/ask` → renders clips with inline playable `<video>` elements using `#t=start` fragment for precise seek.
- [ ] **Record the demo video.** Split-screen: live meeting on the left, dashboard on the right, you type "what did we decide about auth" and a 3-week-old clip appears. This is the Tweet.

### v2.2 — Chaptering (free win on top of v2)

- [ ] After transcription settles, LLM pass segments transcript into topic chapters (`{start, end, title, gist}`). Persist as `{meetingId}.chapters.json` in R2.
- [ ] Dashboard renders chapters as a clickable table-of-contents alongside the video.

## Phase v3 — Agentic Copilot (Approach A, layered on B)

**The "it DID something" build.** Meeting ends → 5 Jira tickets, 3 Slack DMs, 1 calendar follow-up, all created automatically. Watch it happen live in the dashboard.

~2 weekends.

- [ ] New service: `agent-worker`. Subscribes to `meeting.completed` events (after `memory-worker` finishes indexing).
- [ ] Agent loop: load transcript + summary → Claude with tool_use → iterate until no more actions.
- [ ] Tool adapters (start with two, add more):
  - [ ] `linear.ts` — `createIssue`, `commentOnIssue`
  - [ ] `slack.ts` — `sendDM`, `postToChannel`
  - [ ] `gcal.ts` (v3.1) — `scheduleEvent`
  - [ ] `notion.ts` (v3.1) — `appendToPage`
- [ ] **Idempotency.** Dedupe on `{meetingId, actionHash}` in Redis. Re-running a meeting's agent loop must not duplicate tickets.
- [ ] **Agent-reasoning-visible.** Every tool call emitted via SSE to the dashboard. UI shows agent's live activity feed: `✓ Created LIN-847`, etc. **This IS the demo.**
- [ ] **"Cite the moment."** Every action stores the transcript segment(s) that justified it. Dashboard shows each ticket with a "why" link → the 8-second clip it came from. (This is where A × B becomes more than sum of parts.)
- [ ] **Safety:** dry-run mode on by default. User approves from dashboard before actions actually fire. ~2-click approval flow. "Bot created 15 garbage tickets" kills the demo otherwise.

## Phase v1.1 (now v3.5) — Calendar auto-join + auth

Daily-driver unlock. Also forces us to introduce a real user model — needed for multi-tenant.

~2 weekends.

- [ ] New `Users` table (email, avatar, google_refresh_token). Minimal.
- [ ] Google OAuth. User connects calendar.
- [ ] New service or api-server extension: `scheduler`. Polls (or webhooks from Google) upcoming events with Meet URLs, enqueues bot jobs 60s before start.
- [ ] Dashboard: `/meetings/upcoming` view. Toggle per-meeting "record this one."
- [ ] Per-user R2 prefix + pgvector row-level scoping. Single tenant today, ready for multi.

## Phase v1.5 (now v4) — Transcoding + diarization + shareable clips

All post-processing lives together. One worker, multiple outputs.

- [ ] New `post-processing-worker` BullMQ consumer (rename from `transcoding-worker`). Pulls `{meetingId}.webm` from R2, runs multiple pipelines in parallel.
- [ ] **Transcoding.** FFmpeg: `{meetingId}.webm` → `{meetingId}.mp4` (H.264, AAC) → R2.
- [ ] **Named-speaker attribution** (rewritten 2026-06-12 — per-participant audio files are impossible, see superseded note). Worker runs Deepgram batch `/v1/listen` with `diarize=true` on the mixed `{meetingId}.webm` → statistical Speaker 0/1/2 segments. Then joins against `{meetingId}.speakers.jsonl` (captured in v1.x): each Deepgram speaker label maps to the participant whose CSRC/ring activity overlaps it most, voted across the whole meeting. Writes `{meetingId}.transcript.attributed.jsonl` with real display names.
  - Prerequisite (shipped in v1.x): bot-side speaker timeline capture.
  - Expect ~5-10% attribution error on heavy crosstalk — same as commercial products; interval voting over whole utterances absorbs most of it.
- [ ] **Clip export.** `POST /api/v1/meetings/:id/clips { start, end, caption? }` → FFmpeg cuts a segment → uploads to R2 → returns shareable signed URL with 24h TTL. Loom-style micro-feature, trivial to build once transcoding exists, strong viral mechanic (people share clips, backlinks to your tool).

---

## Technical deep dives that belong somewhere in the above

### Speaker diarization — SUPERSEDED 2026-06-12 (empirically tested)

The per-participant capture plan below was killed by a live probe of Meet's internals (two runs, real meeting): **Meet's SFU pre-allocates exactly 3 audio elements/streams regardless of participant count** (verified at 2 and 6 participants), and remaps speakers inside the RTP stream with zero DOM-visible changes (`srcObject` never swaps). One-file-per-participant is impossible from the receiving side. Headless Chromium additionally gets served a "You can't join this call" block page — the bot must run headed (Docker/Xvfb already is).

**What replaced it: speaker timeline attribution** (shipped in v1.x, consumed in v4):

- `getContributingSources()` on tapped RTCPeerConnections exposes per-participant contributor ids with audio levels — matched real speech second-for-second in testing. UI-independent.
- Meet's per-tile speaking indicator (obfuscated class cluster) toggles with 1.00 precision vs audio — but class names rotate with Meet builds, so the bot **learns them at runtime**: moments with exactly one loud contributor + exactly one animating tile vote in the indicator classes AND bind contributor id → tile → display name.
- Output: `{meetingId}.speakers.jsonl` — who was audibly speaking, every 250ms, with name bindings. v4 joins this against Deepgram's statistical diarization to put real names on the transcript at 1× Deepgram cost.

**Engineering story (for interviews):** "I discovered Google's SFU only forwards the three loudest speakers and remaps them invisibly inside the RTP stream — so instead of fighting the signal path, I read the SFU's own contributor metadata and taught the bot to learn Google's obfuscated UI classes at runtime."

### Observability / ops dashboard

At some point (around v2.2) — add:
- [ ] Prometheus metrics from api-server + orchestrator + bot (upload bytes/sec, transcription lag, join success rate, per-tool cost per meeting).
- [ ] Grafana container in docker-compose with pre-baked dashboards committed to repo.
- [ ] "Status per bot container" live tile in the dashboard UI.

Small work, disproportionate recruiter-interview value. A Grafana screenshot in the README = immediate credibility.

---

## Other features considered — parking lot

Ranked honestly by "how much does this improve the product vs effort."

| Feature | Value | Effort | Verdict |
|---|---|---|---|
| **Per-participant audio diarization** | High (solves real problem + engineering story) | M | Do it. See above — inserted into v1.x/v2. |
| **Speaker name mapping (DOM scrape)** | High (demo quality) | S | Do it in v1.x. |
| **Chaptering / topic ToC** | Med (nice UI win) | S | Do it. v2.2. |
| **Clip export (Loom-style)** | High (viral mechanic) | S (once transcoding exists) | Do it. v4. |
| **Meeting cost calculator widget** | Low-Med (LinkedIn bait, easy win) | XS | Do it. v1.x with cost tracking. |
| **Webhooks on state change** | Med (unlocks integrations) | S | Do it. v1.x. |
| **Retry / DLQ for failed bot containers** | Med (ops hygiene) | S | Do it. v1.x. |
| **Grafana + Prometheus observability** | Med (recruiter flex) | S-M | Do it. v2.2-ish. |
| **Dry-run / approval gate for agent actions** | High (prevents demo-killing bugs) | S | Mandatory in v3. |
| **"Cite the moment" links on agent actions** | High (A × B > A + B) | S | Do it in v3. |
| **Engagement/sentiment heatmap** | Low (gimmicky) | M | Skip unless bored. |
| **Privacy / pause-recording voice command** | Low (niche) | M | Skip for now. |
| **Live subtitles overlay in meeting** | Low (accessibility, but Meet has its own) | M | Skip. |
| **Multi-platform (Zoom/Teams)** | High product value / Low demo value | XL | Parking lot. A different product. |
| **Local Whisper fallback** | Low (Deepgram is fine) | L | Skip. Adds a GPU dependency, loses self-host appeal. |
| **CLI (`raven join <url>`)** | Med (devex) | S | Do it anytime, cheap. Maybe v2.1. |
| **Multi-bot swarm (Approach C)** | Flashy / Low utility | XL | Revisit as v5 capstone if the rest lands. Needs B underneath anyway. |
| **Action-item resolution tracking** | Med (closes the agent loop: "LIN-847 closed") | M | Post v3. Requires pulling status from Linear/Jira back. |

---

## What NOT to do

- Don't build multi-tenant auth / billing before you have 10 people using it. Single-tenant is fine for v2 + v3.
- Don't build C (multi-agent swarm) before B (memory). The fact-checker agent has nothing to check against without the memory layer.
- Don't over-invest in the join flow. Current Playwright selectors break when Google changes the Meet DOM. Accept that, add integration tests against a headed Chrome in CI, move on.
- Don't add a local Whisper fallback for Deepgram. Adds a GPU dep, kills the "just docker compose up" hook.
- Don't polish v1 further beyond the v1.x list. Polish is infinite. Move forward.

---

## Distribution checklist (does not ship until done)

These are the things that determine whether the demo actually lands. Do them before posting anywhere.

- [ ] README rewrite: GIF of the search demo above the fold, `docker compose up` in <2 min, 3-step quickstart.
- [ ] Seed script: `pnpm seed:demo` injects canned transcripts so first-time users get working search immediately (no "record 10 meetings to try it" wall).
- [ ] Landing page / GitHub Pages with 30-sec demo video.
- [ ] Submit: Show HN, r/SelfHosted, Twitter/X, awesome-selfhosted PR, awesome-llm-apps PR.
- [ ] Write one blog post per major phase (v2 launch post, v3 launch post). The engineering deep dives are the post content.
