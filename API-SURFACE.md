# API surface — what the frontend can actually get

Verified against `api-server/src`. Written for whoever builds the UI, so nothing
here is assumed.

**Headline:** the backend was a **pipeline plus an agent**, not a content API.
`GET /meetings`, `GET /meetings/:id` and `GET /meetings/:id/transcript` now close
the biggest part of that gap — the UI can discover, open and read a meeting over
HTTP. What is still missing is anything that *plays*: `recording_url` holds an R2
key, so no video resolves yet (gap 3).

---

## Every route (14 total)

Mounted at `/api/v1`. Middleware is only `express.json()` + `cors()` — no
cookie-parser, no rate limiter, no error middleware.

| Method | Path | Auth |
|---|---|---|
| POST | `/auth/register` | public |
| POST | `/auth/login` | public |
| POST | `/auth/logout` | public |
| GET | `/auth/me` | required |
| POST | `/join-meet` | required |
| GET | `/bots/:jobId/status` | required |
| GET | `/bots` | required |
| POST | `/ask` | required |
| GET | `/meetings` | required |
| GET | `/meetings/:id` | required |
| GET | `/meetings/:id/transcript` | required |
| GET | `/meetings/:id/actions` | required |
| POST | `/actions/:id/approve` | required |
| POST | `/actions/:id/reject` | required |

`requireAuth` is applied by ordering — anything registered after it is protected.

**No SSE. No WebSocket. No webhooks.** Grepped for `event-stream`, `EventSource`,
`socket.io`, `res.write(`, `res.flush` — zero hits in `api-server/src`.

**CORS blocks cookie auth.** `app.use(cors())` sends `Allow-Origin: *` with no
`Allow-Credentials`, and the cookie is `sameSite: lax`. A cross-origin SPA cannot
use the cookie and must send the Bearer token instead. Deploy same-origin to avoid
putting a 7-day JWT in JS-reachable storage.

---

## Data model (7 tables)

No `speakers`, `summaries`, `transcripts`, `sessions`, or `conversations` table.

**`meetings`** — `id` is **text**, not uuid: `<meetCode>_<YYYY-MM-DD>_<HH-MM-SS>`.
It appears verbatim in citations.

| Field | Note |
|---|---|
| `title` | **null for every real meeting.** Only seed data has titles. UI must fall back. |
| `type` | free-text LLM label, not an enum — no fixed filter dropdown |
| `participants` | `string[]` of display names. No ids, emails, or avatars. |
| `summary` | LLM-generated at ingest |
| `recording_url` | **stores an R2 key, not a URL** — e.g. `<id>.webm` |
| `status` | only ever `pending` or `ingested` (see below) |
| `owner_id` | the entire tenancy boundary; cascade delete |

**`chunks`** — **not usable as a transcript.** Windows of 500 tokens with 75-token
overlap, and `text` is a multi-speaker joined blob. Rendering sequentially
duplicates dialogue. `context` and `type` are dead columns, always null.
Per-utterance data exists only in the R2 `.named-transcript.jsonl`, which has no endpoint.

**`chapters`** — `title` notNull, `gist` nullable, `start_s`/`end_s`. A ready-made
table of contents. **No endpoint exposes it.**

**`decisions`** — `text`, `evidence_quote` (verbatim, quote-guard verified),
`speaker`, `start_s`/`end_s`. **No status field** — cannot be dismissed or superseded.

**`action_items`** — same plus `owner` and `due`. **`due` is `text`**, storing
whatever was said ("end of week"). Not a date. **No `completed` column** — a
checkbox has nowhere to persist.

**`agent_actions`** — see below.

**`users`** — `email`, `name` (nullable), `password_hash`, `created_at`.

---

## Status values

### Bot job — 13+ values, and `StatusEvent.state` is typed `string`

`queued` · `dispatched` · `joining_meeting` · `waiting_admission` · `admitted` ·
`recording` · `alone_detected` · `finalizing_upload` · `ended` · `kicked` ·
`timeout` · `error` · `complete`

Plus raw BullMQ passthroughs (`paused`, `waiting-children`). **There is no enum —
the UI must tolerate unknown values without crashing.**

Terminal: `ended`, `kicked`, `timeout`, `error`, `complete`.
Post-join failures are non-retryable (rejoining would duplicate the recording).

### `meetings.status` — carries no useful information

Declared with a default of `pending`, but the only value ever written is
`ingested`, and the row is *created* by ingest. So `pending` is effectively
unreachable. There is no `diarizing`, no `failed`. **The pipeline is invisible.**

### `agent_actions.status` — 4 values

`proposed` → `executed` | `failed` | `rejected`

`failed` is **retryable** (server permits re-approve). `executed` and `rejected`
are terminal, no undo.

---

## `/ask` response

```jsonc
{
  "answer": "string",          // markers STRIPPED
  "citations": [{ "meetingId", "start_s", "end_s", "speaker", "text", "recordingUrl" }],
  "grounded": true,
  "refused": false,
  "retrieved_meetings": ["id"],
  "contexts": ["..."],         // eval harness only
  "iterations": 3
}
```

- The model emits `[[meeting_id@start_s]]` markers, but the server **strips them
  before returning**, and citations carry no character offsets. **Inline numbered
  citation chips are impossible without a server change.**
- Citation resolution requires a match within **3 seconds**, else the citation is
  silently dropped.
- `refused: true` when the answer starts with "I couldn't find that in your
  meetings." — served as **HTTP 200**. Render as empty state, not an error.
- `grounded: false` means claims with no resolvable citation — also **200, answer
  intact**. The API delegates this call entirely to the frontend. Note it also
  fires when citations fell outside the 3s tolerance, so a resolution bug is
  indistinguishable from a hallucination.
- `recordingUrl` is `<r2-key>#t=<sec>` — **not a resolvable URL.**
- **Stateless.** No threads, no history, no persistence. Follow-ups cannot work.
- Blocking POST, **3–40s**, up to 8 sequential LLM round-trips.

---

## Agent actions

Two kinds: `linear_issue` (`issue_title`, `description`, `owner`, `due`) and
`slack_message` (`text`).

- The Slack recap is **templated in code**, appended once per meeting regardless
  of LLM output, and always has `evidence: null`.
- A `linear_issue` must trace to a decision or action item by `source_seq`;
  unsourced proposals are dropped.
- Approve returns **200** executed, **409** adapter not configured, or **502**
  upstream failed. `dry_run` returns a `would` string for preview.
- **Serialization inconsistency:** the list response includes `evidence.clip`;
  approve/reject responses call `serialize()` without recording args so `clip` is
  **always null** there. Treat mutation responses as authoritative for
  `status`/`result` only.
- Neither adapter `fetch` sets a timeout.
- Idempotency hashes the *evidence*, not the prose.
- **No cross-meeting inbox endpoint** — the `agent_actions_status` index exists
  for exactly that query, but nothing uses it.

---

## Timing

| Stage | Duration |
|---|---|
| `waiting_admission` | up to **5 min** |
| recording | meeting length |
| diarize | minutes; concurrency **1**, so jobs queue serially |
| memory ingest | 20–90s, worst case ~5 min |
| agent propose | 5–20s |
| `/ask` | 3–40s |

**End to end: a meeting is queryable 2–10 minutes after it ends, with no upper bound.**

Once the bot job hits `complete`, `/bots/:jobId/status` freezes and there is
nothing to poll for the remaining three stages. There is also no `meetingId` ↔
`jobId` mapping in any response — the only link is string-munging `recording`
(`<meetingId>.webm`). If the bot finishes without both `recording` and `speakers`
keys, the diarize handoff is **silently skipped**: job reports success, meeting
never appears.

---

## The read endpoints

All three scope by `owner_id`, and not-found and not-owned both return **404** so
meeting ids cannot be probed across tenants.

They deliberately do **not** wrap the `/ask` agent's `list_meetings` /
`fetch_meeting` tools. Those return prompt-shaped payloads tuned for token cost
and model behaviour; binding the UI to them means a prompt tweak silently
reshapes the meetings list. Same queries, same scoping, separate contract.

**`GET /meetings?limit=&before=`**
`{ meetings: [{ id, title, type, started_at, ended_at, duration_s, participants,
status, has_recording }], next_before }`

- Newest first. `limit` defaults to 50, caps at 200; a bad value is a **400**.
- `next_before` is passed back verbatim as `?before=` for the next page, and is
  `null` at the end. A meeting with a null `started_at` cannot anchor a cursor,
  so it also ends pagination rather than looping.
- `has_recording` replaces the raw `recording_url`, which is an R2 key and means
  nothing to a client.
- **`title` is still null for every real meeting.** The UI must fall back.

**`GET /meetings/:id`**
The list shape plus `summary`, `recording_offset_s`, `chapters[]`, `decisions[]`
and `action_items[]`. One request, because the detail screen needs all of it on
first paint and four round trips is a worse contract than one larger payload.
`recording_offset_s` is exposed rather than assumed to be 0 so the client never
replicates the clock-skew correction. `action_items[].due` is free text as
spoken — **not a date, never parse it.**

**`GET /meetings/:id/transcript`**
`{ meeting_id, recording_offset_s, turns: [{ speaker, start_s, end_s, text }] }`,
served from the R2 `.named-transcript.jsonl`.

- **409, not 404, when the transcript is not ready.** The meeting exists and is
  owned; only the artifact is missing. A 404 would be indistinguishable from
  "no such meeting", and the UI needs the tab to explain itself.
- **409** with neutral copy when R2 is unconfigured — checked before
  `getArtifactStore()`, whose message names the missing env vars, because
  `asyncHandler` forwards non-`AppError` messages to the client verbatim.
- Real shape check: the 10-minute meeting on disk is 114 turns / ~15KB, so a
  4-hour call lands near 400KB. Fine as one response; revisit if it isn't.

---

## Gaps still blocking a real UI

1. ~~`GET /meetings`~~ — **done.**
2. ~~`GET /meetings/:id`~~ — **done**, and it also covers gap 7.
3. `GET /meetings/:id/recording-url` — presign the R2 key. Without it **no video
   plays.** Not a wrapper like the others: needs a decision on TTL, on whether
   `recording_url` migrates to be consistently a key, and on fixing the `clip`
   string in `actions.controller.ts` (which concatenates the key with `#t=`) at
   the same time.
4. ~~`GET /meetings/:id/transcript`~~ — **done.**
5. Real `meetings.status` written by each worker — makes the pipeline observable.
6. `GET /actions?status=proposed` — cross-meeting inbox.
7. ~~decisions / action-items / chapters~~ — **served by `GET /meetings/:id`.**
8. Pagination — `/meetings` is paginated; nothing else is. `/bots` still caps at
   100 **before** owner filtering, so results can be silently wrong.
9. `PATCH /meetings/:id` — set a title. No mutation on domain data exists at all.
10. SSE on `/ask` + the raw answer with markers intact.

Also: `asyncHandler` leaks raw exception messages to the client on any
non-`AppError` throw. Never surface those verbatim.
