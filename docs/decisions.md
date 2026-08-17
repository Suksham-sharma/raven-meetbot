# Architecture decisions

Durable reasoning behind how Raven is built. Salvaged from the v2 implementation
plan (`PLAN.md`, retired 2026-08-17) plus decisions taken since. This records
*why*, not *what is done* — `FUTURE_PLAN.md` holds current state.

---

## The retrieval problem

Scale is not the hard part. Hundreds of meetings is roughly 45–90k chunks, which
is trivial for pgvector. The hard part is that "ask across my meetings" is four
different query types, and no single technique serves all four:

| Query type | Example | Machinery |
|---|---|---|
| Local lookup | "what did Sarah say about rate limits?" | hybrid vector search |
| Structured / aggregative | "all my open action items", "every pricing decision" | typed SQL records |
| Synthesis / deep | "how did our auth approach evolve?" | scoped long-context over identified meetings |
| Global / thematic | "themes across all-hands?" | graph aggregation — deferred |

**Structured extraction is the spine, hybrid vector search is the safety net,
scoped long-context is the synthesizer — orchestrated by a small agentic loop.**

---

## D1 — Ingest runs in the api-server codebase

Ingest is a BullMQ worker *process* that reuses the api-server codebase and
shares the Drizzle schema and DB client. It is not a standalone service.

A standalone memory-worker service was explicitly rejected: it would need the
full schema and domain layer, producing two services that both own ingest.

Still holds. See D6 for where the boundary actually falls.

## D2 — OpenAI for generation and embeddings, behind an interface

One AI provider for generation and embeddings (OpenAI, `text-embedding-3-small`),
plus Deepgram for transcription. Both sit behind a swappable `LLMProvider`
interface so the eval can still compare alternatives.

bge-m3 was dropped as the default because it reintroduces a second AI stack for
no measured gain.

## D3 — Four agent tools

`search_structured`, `search_transcript`, `fetch_meeting` (light/full), and
`list_meetings` (date/participant/title browse). Every result carries timestamps
and meeting date so the loop can reason about recency and superseded decisions.

No `decompose` tool — the loop handles multi-step itself.

## D4 — Eval is Ragas plus labelled retrieval metrics

Ragas (Python, dev/CI only) for generation-side metrics: faithfulness, context
precision/recall, answer relevancy. Retrieval metrics (recall@k, MRR, nDCG)
computed from labelled ids. Unit tests for the deterministic pieces.

## D5 — Minimal universal extraction spine

The product serves many meeting types (sales, intro, standup, interview), so
extraction stays a minimal universal spine: `meeting_type` as a soft label, plus
`decisions`, `action_items`, `chapters`, `summary`.

Type-specific intelligence (sales budget and objections, intro asks) is answered
at query time by the agent and retrieval — never baked into per-type tables or
enums. A `key_points`/`kind`-enum approach was rejected as brittle complexity
that grows with every new meeting type.

## D6 — Media processing is a separate service (2026-08-17)

Transcode and diarize are split out of api-server into `media-worker`.

This does not contradict D1. D1 rejected a standalone service for the *memory*
worker, which is deep in the schema — it writes five tables transactionally. The
media workers are the opposite: between them they touch the database with five
`UPDATE meetings` statements against one table, and their real dependency is
ffmpeg.

The forcing issue was concrete. Both workers shell out to ffmpeg, and no image in
the repo installed it, so they only ever ran on a developer laptop where ffmpeg
happened to be on PATH. They need a different base image than a slim API.

`media-worker` talks to Postgres with raw `pg` rather than importing Drizzle and
the schema. Five write statements is the entire contract, and holding it at raw
SQL means the service has no schema to reach for and cannot quietly accrue domain
logic. The cost — column names as string literals, so a rename fails at runtime
rather than compile time — is accepted at this size and covered by an integration
test.

`memory` and `agent` workers stay in api-server per D1.

---

## Failure modes

| Failure | Covered by |
|---|---|
| Citation clock skew — Deepgram transcript `t=0` ≠ recording `t=0` | Per-meeting `recording_offset_s`, verified and set at ingest |
| Extraction hallucination (evidence quote absent from transcript) | Quote-guard drops it, with a unit test |
| Empty retrieval / unknown answer | Cite-or-refuse guard, plus an eval case for "not in my meetings" |
| Agentic loop non-termination | Bounded iterations and token budget |
| Ingest job crash | BullMQ retry and idempotent upsert; no resumability, by design |
| Embedding model or dimension drift | `reindex` from R2; eval catches quality regression |

Clock skew was the critical gap in the original plan — a silent wrong-clip
failure with no test. It is now corrected per-meeting rather than assumed away.

---

## Deliberately not built

- **mem0 / supermemory as the engine** — fact-memory for chat agents; a poor fit
  for time-linked cited meeting decisions.
- **Custom-trained sequence models** — a category error. "Memory" here is
  storage and retrieval (DB + embeddings + LLM), not neural sequence memory.
- **Resumable ingest / state machine** — re-run on failure; no search impact at
  this scale.
- **Per-row version tracking with selective backfill** — replaced by an
  idempotent `reindex` from R2.
- **Full tracing infrastructure (Langfuse/OTel)** — lightweight logging of
  retrieved chunks and answers during the eval loop is enough for now.
- **GraphRAG / knowledge graph** — only wins on global-theme questions. Revisit
  LazyGraphRAG if that becomes core.
- **Per-type extraction tables and `kind` enums** — see D5.
- **Dedicated vector DB, sharding, streaming ingest, local Whisper** — pgvector
  and Deepgram are correct at this size.
