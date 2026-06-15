# v2 — Raven Memory: Implementation Plan

> Goal: ask a natural-language question and get a **correct, cited, time-linked** answer across your entire meeting history — built to production-grade *quality* (not company-grade ops), as an applied/agentic-AI portfolio piece. v3 (agentic action-taking) is the next step and reads the same structured layer this plan produces.
>
> Architecture locked via `/plan-eng-review` on 2026-06-15 (decisions D1–D4 below).

## North star

The hard part is not scale (hundreds of meetings ≈ 45–90k chunks is trivial for pgvector). It's that "ask across my meetings" is **four query types**, and one technique can't serve all four:

| Query type | Example | Machinery |
|---|---|---|
| Local lookup | "what did Sarah say about rate limits?" | hybrid vector search |
| Structured / aggregative | "all my open action items", "every pricing decision" | typed SQL records (the spine) |
| Synthesis / deep | "how did our auth approach evolve?" | scoped long-context over identified meetings |
| Global / thematic | "themes across all-hands?" | graph aggregation — **deferred** |

**Design: structured extraction is the spine, hybrid vector search is the safety net, scoped long-context is the synthesizer — orchestrated by a small agentic loop.**

## Locked decisions (from the review)

- **D1 — Scope:** ingest runs as a **BullMQ worker process that reuses the api-server codebase** (shares the Drizzle schema + DB client), *not* a 4th standalone service. The **dashboard is deferred** to the slice after the eval-proven core.
- **D2 — LLM provider:** **OpenAI** for both jobs (extraction + agentic loop), behind a **swappable `LLMProvider` interface** (Claude kept as the eval comparison). For consistency this also makes **embeddings = OpenAI `text-embedding-3-small`** (single AI provider: OpenAI for generation+embeddings, Deepgram for transcription). bge-m3 dropped as default (would re-introduce a second AI stack); embedding stays behind a swappable interface so the eval can still compare.
- **D3 — Agent tools:** **four** — `search_structured`, `search_transcript`, `fetch_meeting` (light/full mode), and **`list_meetings`** (date/participant/title browse). Every search result carries **timestamps + meeting date** so the agent can reason about recency / superseded decisions. No `decompose` tool — the loop handles multi-step itself.
- **D4 — Eval:** **Ragas** (Python, dev/CI only) for generation-side metrics (faithfulness, context precision/recall, answer relevancy); retrieval metrics (recall@k / MRR / nDCG) computed from labeled ids; unit tests for the deterministic pieces.

---

## Architecture

```
bot finishes → enqueue { meetingId } to `memory` queue (BullMQ)
   → ingest worker (NEW process, reuses api-server code — NOT a new service):
        one job = full ingest of one meeting:
        1. fetch transcript.jsonl (+ speakers.jsonl) from R2
        2. EXTRACT (OpenAI Structured Outputs) → decisions / action_items / chapters / summary  (+ provenance)
        3. CHUNK (speaker-turn-aware) → contextual prefix → EMBED (OpenAI) → chunks
        4. UPSERT all of the above (idempotent on meeting_id)
   → api-server:
        POST /api/v1/ask  — agentic loop (4 tools), returns answer + citations
        GET  /api/v1/meetings, /meetings/:id/transcript, /meetings/:id  (read APIs)
   → dashboard (DEFERRED slice) — meetings list, transcript+video, ask box with cited clips
```

One worker, one job per meeting, no state machine. If a job fails, BullMQ retries the whole thing; upserts make retry safe.

---

## 1. Schema additions (Drizzle)

Existing `meetings` / `chunks` / `chapters` stay. Add:

- **`decisions`** — `id, meeting_id (fk), seq, text, evidence_quote, speaker, start_s, end_s, created_at`, `UNIQUE(meeting_id, seq)`
- **`action_items`** — `id, meeting_id (fk), seq, text, owner, due (nullable text), evidence_quote, speaker, start_s, end_s, created_at`, `UNIQUE(meeting_id, seq)`

Every extracted row carries **provenance** (`evidence_quote` + `start_s`/`end_s` + `speaker`). No separate entities/topics table (chapters cover the ToC).

## 2. Grounded extraction (the spine)

- **OpenAI Structured Outputs** (strict JSON schema) — guaranteed-valid output, no free-text parsing.
- One LLM pass over the full transcript emits `decisions[]`, `action_items[]`, `chapters[]`, `summary`. Each decision/action includes a **verbatim `evidence_quote`** and its timestamp span.
- **Hallucination guard:** verify each `evidence_quote` is a (normalized) substring of the transcript; drop/flag failures. This is the data-quality floor.

## 3. Chunk + embed (the safety net)

- **Speaker-turn-aware chunking**, ~500 tokens, ~15% overlap; carry `speaker`, `start_s`, `end_s`, `meeting_id`.
- **Contextual prefix** (one-line "in this meeting, discussing X…") before embedding. **Eval-gated** — keep only if it moves recall.
- **Embedding = OpenAI `text-embedding-3-small`** (single-provider consistency, D2), behind a swappable interface so the eval can still compare alternatives.
- **Hybrid retrieval:** pgvector cosine (HNSW) + `tsvector` full-text (GIN) fused via **Reciprocal Rank Fusion**, metadata filters pushed into SQL. One SQL query, not N.
- **Reranker** (`bge-reranker-v2-m3` or Cohere): **eval-gated, phase 2.**

## 4. The agentic `/ask` loop (the product + the "agentic" signal)

`POST /api/v1/ask { q }` → OpenAI function-calling, bounded to N iterations + a token budget. **Four tools:**

- `search_structured({ kind, query?, filters? })` → typed decisions/action_items
- `search_transcript({ query, k, filters? })` → hybrid vector+FTS+RRF over `chunks`
- `fetch_meeting({ meeting_id, mode: 'light' | 'full' })` → chapters+summary (light) or full transcript (full)
- `list_meetings({ from?, to?, participant?, title? })` → metadata/time/browse

All tool results carry timestamps + meeting date (recency reasoning). The loop plans → calls a tool → reads → maybe calls another → then answers. **Every answer cites source clips (`meetingId`, `start_s`) or explicitly says "I couldn't find that in your meetings."** Guard: reject/flag any answer with no citation and no explicit not-found.

Response: `{ answer, citations: [{ meetingId, start_s, end_s, speaker, text, recordingUrl }] }` (clips use `#t=start_s`).

## 5. Eval harness (build FIRST — the ruler)

- **Golden set:** 30–50 hand-curated `{ question, expected_facts, relevant_ids, meeting_id }`, grow toward ~100. Seed transcripts double as the set *and* demo seed data.
- **Tooling: Ragas** (Python, `eval/` dir) for faithfulness / context precision-recall / answer relevancy; retrieval metrics (recall@k / MRR / nDCG) from labeled ids. Runs offline + in CI on every chunker / prompt / embedding change. Not a runtime component.
- Eval decides: whether the contextual prefix earns its keep, whether the reranker earns its keep, and any embedding-model comparison.

## Failure modes (review output)

| Failure | Covered? |
|---|---|
| **Citation clock skew** — Deepgram transcript `t=0` ≠ recording `t=0`, so every `#t=` clip lands on the wrong moment | **CRITICAL GAP** — no test, would be a silent wrong-clip failure. **New requirement:** verify shared origin at ingest, store a per-meeting offset if not; add an eval/QA check that a clip lands on the right words. |
| Extraction hallucination (evidence_quote not in transcript) | Quote-guard drops it (+ unit test) |
| Empty retrieval / unknown answer | Cite-or-refuse guard + eval case for "not in my meetings" |
| Agentic loop non-termination | Bounded iterations + token budget |
| Ingest job crash | BullMQ retry + idempotent upsert (no resumability, by design) |
| Embedding model/dim drift | `reindex` from R2 + eval catches quality regression |

## Test coverage map (review output)

```
COMPONENT                         TEST TYPE              STATUS
chunker (speaker-turn, overlap)   unit (fixtures)        [GAP] add
RRF fusion                        unit (known ranks)     [GAP] add
quote-guard (substring verify)    unit                   [GAP] add
citation builder (#t= links)      unit + [→ check clock] [GAP] add — CRITICAL (clock skew)
extraction schema conformance     integration (Struct.)  [GAP] add
hybrid search recall              [→EVAL] recall@k/nDCG   [GAP] golden set
agentic /ask answer quality       [→EVAL] faithfulness    [GAP] golden set
cite-or-refuse behavior           [→EVAL] not-found case  [GAP] golden set
```

## Build order (impactful-first)

1. **Eval harness skeleton + seed transcripts** — the ruler before the thing it measures.
2. **Schema additions + ingest worker:** grounded extraction (+ quote-guard) and chunk/embed. Get correct rows in.
3. **Hybrid retrieval + agentic `/ask`** (4 tools, cite-or-refuse). Run eval → **baseline number**.
4. **Eval-gated improvements:** contextual prefix, reranker. Keep only what moves the metric.
5. **Dashboard** — the demo (deferred slice).

## Worktree parallelization

Mostly sequential — steps 2–4 share the Drizzle schema + DB client. Step 1 (eval harness + seed data) is independent and can be built in parallel with step 2's schema work. Steps 3–4 depend on 2. Dashboard (5) is fully independent once the API contract from 3 is fixed. Lanes: `A: eval harness (independent)` ‖ `B: schema → worker → /ask → eval-gated (sequential)`; `C: dashboard` after B's API stabilizes.

## NOT building (deliberate — and an interview point)

- **mem0 / supermemory as the engine** — fact-memory for chat agents, poor fit for time-linked cited meeting decisions; and integrating it would outsource the exact retrieval/extraction skill this portfolio is meant to demonstrate. Studied as the reasoned build-vs-buy alternative.
- **LSTM / any custom-trained net** — category error: "memory" here is a storage+retrieval problem (DB + embeddings + LLM), not neural sequence memory. No task in v2 needs it.
- **Standalone memory-worker service** — runs as a worker process in the api-server codebase instead (D1).
- **Resumable ingest / state machine** — re-run on failure; zero search impact at this scale.
- **Per-row version tracking + selective backfill** — replaced by an idempotent `reindex` from R2.
- **Full tracing infra (Langfuse/OTel)** — lightweight logging of retrieved chunks + answer during the eval loop.
- **GraphRAG / knowledge graph** — only wins on global-theme questions; revisit LazyGraphRAG only if that becomes core.
- **Multi-tenant auth/billing, owner-scoping column** — single-tenant; YAGNI now.
- **Dedicated vector DB, sharding, streaming ingest, local Whisper** — pgvector + Deepgram are correct here.

## What already exists (reuse, don't rebuild)

- **BullMQ infra** — api-server `queueManager` singleton enqueues; add a `memory` queue + consumer.
- **Drizzle schema + DB foundation** — `meetings`/`chunks`/`chapters` + migration already built this session.
- **v1 summary spec** (old design doc) — design reference for the extraction shape (decisions/action_items/openQuestions); never implemented, so extraction is greenfield.

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | ISSUES_OPEN | 4 decisions locked (D1–D4); 1 critical gap (citation clock skew) |
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | optional |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | optional (dashboard deferred) |
| Outside Voice | `/codex` | Independent 2nd opinion | 0 | — | offered |

- **UNRESOLVED:** 0 decisions open.
- **CRITICAL GAP:** citation clock skew — now a plan requirement (verify origin + offset + eval check).
- **VERDICT:** ENG REVIEW COMPLETE — architecture locked. Address the citation-clock test during implementation. Ready to build (start: eval harness + seed data).
