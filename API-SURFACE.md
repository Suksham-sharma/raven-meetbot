# API surface — what the frontend can actually get

Verified against `api-server/src` at commit `a52f524`. Written for whoever builds
the UI, so nothing here is assumed.

**Headline:** the backend is a **pipeline plus an agent**, not a content API.
There is no way over HTTP to list meetings, fetch a meeting, or read a transcript.
Those capabilities exist only as LLM tools inside `/ask`.

---

## Every route (11 total)

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

## Gaps blocking a real UI

Ranked. The first four are small — three already exist as owner-scoped functions
trapped behind the LLM tool layer.

1. `GET /meetings` — wrap `listMeetings` (`agent/tools.ts:422`). **Unblocks everything.**
2. `GET /meetings/:id` — wrap `fetchMeeting` (`agent/tools.ts:347`).
3. `GET /meetings/:id/recording-url` — presign the R2 key. Without it **no video plays.**
4. `GET /meetings/:id/transcript` — serve the R2 jsonl. `chunks` will not do.
5. Real `meetings.status` written by each worker — makes the pipeline observable.
6. `GET /actions?status=proposed` — cross-meeting inbox.
7. `GET /meetings/:id/{decisions,action-items,chapters}` — populated, zero exposure.
8. Cursor pagination — nothing is paginated. `/bots` caps at 100 **before** owner
   filtering, so results can be silently wrong.
9. `PATCH /meetings/:id` — set a title. No mutation on domain data exists at all.
10. SSE on `/ask` + the raw answer with markers intact.

Also: `asyncHandler` leaks raw exception messages to the client on any
non-`AppError` throw. Never surface those verbatim.
