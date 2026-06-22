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
- **D5 — Multi-type + minimal spine (2026-06-16):** the product serves many meeting types (sales, intro/networking, standups, interviews, ...), not just engineering. **Extraction stays a minimal universal spine** — `meeting_type` (soft label), `decisions`, `action_items`, `chapters`, `summary` — and **type-specific intelligence (sales budget/objections, intro asks) is answered at query time by the agent + retrieval, never baked into per-type tables/enums.** Rejected a `key_points`/`kind`-enum approach as brittle complexity that grows per meeting type.

## Build status (2026-06-20)

| Step | State |
|---|---|
| pgvector + Drizzle foundation; `meetings`/`chunks`/`chapters` + migrations 0000–0002 (`meetings.type` = 0002) | ✅ committed |
| `decisions` / `action_items` tables | ✅ committed |
| Eval harness foundation — seeds + golden set + retrieval metrics (tested) + runner skeleton | ✅ committed |
| Ingest primitives — speaker-turn chunker + quote-guard (vitest) | ✅ committed |
| Grounded extraction — OpenAI Structured Outputs, minimal universal spine, multi-type | ✅ verified on messy sales/intro/eng seeds |
| **Migrations applied to a live DB** (0000–0003; `recording_offset_s` = 0003) | ✅ applied — pgvector 0.8.2, 5 tables |
| Chunk → embed → **store** + the BullMQ ingest worker | ✅ built + run on all 7 seeds → real rows (19 chunks / 14 decisions / 13 actions / 30 chapters); worker drains the `memory` queue (D1), idempotent re-ingest verified |
| Longer seed corpus (2 generated ~15-min meetings) + golden set grown to 15 Q | ✅ corpus now 19 chunks / 7 meetings; arch-review (eng) + sales-acme (sales) give real distractors |
| **Hybrid search** (pgvector cosine + tsvector RRF, one SQL query, filters) | ✅ built + retrieval baseline: **recall@8 = 0.929, MRR = 0.798, hit-rate = 1.000** (14 Q) |
| **Agentic `/ask`** (4 tools, cite-or-refuse) + `run_eval.py` wired to live endpoint | ✅ built — meeting-level: recall@8 = 1.000, cite-or-refuse = grounded = 1.000 |
| **Eval hardened (de-saturated)** — chunk-level `relevant_ids` + LLM-judge (faithfulness/relevancy) + 4 adversarial Q | ✅ **chunk recall@8 = 0.853, MRR = 0.630, nDCG = 0.662; faithfulness = 0.824, relevancy = 0.912** — real headroom + diagnostic |
| Dashboard | deferred slice |

**OpenAI key** lives in `api-server/.env` (gitignored). **Next action (candidates):** eval-gated improvements — now buildable (reranker / contextual prefix / better tool-routing) against the de-saturated metric ‖ dashboard (demo) ‖ v3 agentic action-taking ‖ real-bot ingest path (R2 + clock-skew verify).

**Storage slice notes (2026-06-20):**
- DB client `src/db/client.ts` (shared pg pool + Drizzle), reused by worker + api-server (D1).
- Ingest core `src/ingest/ingestMeeting.ts` — extract → chunk → embed → one idempotent txn (meeting upsert + delete-then-insert children). Called by both the worker (`src/worker/memory.worker.ts`, `memory` queue) and the direct seed CLI (`src/ingest/runIngest.ts`), so there is one ingest path.
- `meetingId` = seed filename stem (matches golden-set `relevant_meetings`); transcript source is the seed loader in dev, **R2 fetch is the documented swap point** in the worker.
- **Citation clock skew (CRITICAL gap):** storage half done — `recording_offset_s` column on `meetings` (0 for synthetic seeds). The **verify-origin half is still TODO** at real-bot ingest (compare Deepgram transcript t=0 vs recording t=0 from R2, set the offset). Citation builder in `/ask` must read it.

**Hybrid search slice notes (2026-06-20):**
- Seed generator `src/ingest/genTranscript.ts` (gpt-4o-mini, `pnpm gen:seed <spec>`): I plant the ground-truth facts per agenda section (`eval/specs/*.json`), the model adds realistic messy volume, timestamps assigned deterministically from word counts. 2 new ~15-min meetings (arch-review eng, sales-acme sales), all planted facts verified present.
- `src/search/hybridSearch.ts` — vector (HNSW cosine) + FTS (GIN tsvector) legs fused via **RRF (k=60) in ONE SQL query**; metadata filters (meetingId/type/participant/date) pushed into both legs; every hit carries timestamps + meeting date + `recording_offset_s` (D3). **FTS gotcha fixed:** `websearch_to_tsquery` ANDs all lexemes → never matches an NL question against a short chunk; OR the lexemes (`replace('&','|')`) so any term matches and `ts_rank_cd` ranks by overlap.
- `pnpm search "<q>"` (probe) + `pnpm eval:retrieval` (golden-set retrieval baseline, meeting-level recall@k/MRR until chunk-level `relevant_ids` are labeled).
- **Findings that motivate the next step:** the 2 retrieval misses are both multi-meeting aggregative/synthesis Q (q2, q5) — the case the agentic loop must cover. Refusal probe q7 scored 0.0320, *indistinguishable from real Q by score* → cite-or-refuse must be an LLM relevance judgment at answer time, NOT a retrieval-score threshold.
- ⚠️ Open polish: chunk-level `relevant_ids` still unlabeled (recall is meeting-level); q1/q6 labels could add arch-review (newer meeting now covers the same topic, dips their MRR). Generated meetings are ~15 min, not a full 30.

**Agentic `/ask` slice notes (2026-06-20):**
- `POST /api/v1/ask { q }` → `src/agent/ask.ts`: OpenAI function-calling loop (model `OPENAI_ASK_MODEL`, default gpt-4o-mini, swappable), bounded to 8 iterations. Tools in `src/agent/tools.ts` (D3): `search_transcript` (hybrid), `search_structured` (decisions/action_items, good for aggregation), `fetch_meeting` (light=summary+chapters / full=+transcript), `list_meetings` (browse). Chat tool-calling is behind the swappable `ChatProvider` interface (`src/llm/provider.ts` + openai.ts) so the loop never imports the OpenAI SDK.
- **Cite-or-refuse:** the model cites `[[meeting_id@start_s]]` markers; the loop resolves them against a registry harvested from tool results (accepts a bare `[[meeting_id]]` fallback → top-relevance clip), builds citations with `start_s + recording_offset_s` → `#t=` deep links, and flags `grounded=false` if an answer has neither a citation nor the explicit refusal. REFUSAL = "I couldn't find that in your meetings."
- **Two agent bugs found + fixed via eval:** (1) the loop spun calling `list_meetings` 6× and starved itself → added a progress guard that short-circuits duplicate tool calls + a prompt rule (one list is enough, then read content); fixed q5 cross-meeting synthesis. (2) refusal was unreliable (answered a not-in-corpus Q from a weak match) → prompt now requires verifying the match actually addresses the specific question. Run-to-run variance exists (temp-0 tool-calling still varies); refusal/grounding now stable across runs.
- Eval: TS `pnpm eval:answer` (fast behavioral proxy, no Python) + Python `eval/run_eval.py` (wired to the live endpoint via stdlib urllib; meeting-level recall/MRR + behavioral; optional Ragas block, skips if not installed). **The agent lifts recall@8 from 0.929 (pure retrieval) → 1.000 by gathering across meetings on q2/q5 — the concrete justification for the agentic design.** Probes: `pnpm ask "<q>"`, `pnpm search "<q>"`.

**Eval-hardening slice notes (2026-06-20):**
- **Chunk-level `relevant_ids`** — golden set now labels the exact answer chunks, keyed `meetingId#seq` (stable across re-ingest, unlike bigserial ids). `retrievalEval.ts` scores chunk-level recall@k/MRR/**nDCG**; this de-saturated the metric (meeting-level was ~1.0 → chunk-level **0.853 / 0.630 / 0.662 @k=8**), so a reranker now has headroom to prove itself. Diagnostic: q14 (Acme action items) chunk recall **0.00** — evidence sits in low-salience wrap chunks transcript search ranks low (the structured table or a reranker should fix it); q2/q5/q13 at 0.50.
- **LLM-as-judge** (`src/agent/judge.ts`, `OPENAI_JUDGE_MODEL`) instead of Ragas — **deliberate call:** Ragas on Python 3.13 is a heavy/fragile install for a dev-only metric and clashes with the repo's anti-dependency-bloat ethos; a self-built judge (claim-decomposition faithfulness + full/partial/none relevancy — Ragas's own technique) is no-dep, integrated into `pnpm eval:answer`, and demonstrates understanding vs importing a black box. `run_eval.py`'s Ragas hook kept as the optional "standard tool" path. Baseline: **faithfulness 0.824, relevancy 0.912**; surfaced real issues (q2 answer had 9 unsupported claims = padding beyond context).
- **4 adversarial Q (q16–q19):** entity confusion (Northwind vs Acme budget), revised decision (Friday deploys scratched → Tue/Wed), cross-meeting no-conflation (both prospects' budgets), tempting refusal (free tier never discussed). Golden set now 19 Q / 6 types.
- ⚠️ Known robustness gaps the harder eval exposed (next-slice fuel, NOT yet fixed): refusal flakes run-to-run (q7 sometimes answers from a weak match); q14-type answers occasionally refuse when the wrap-chunk evidence isn't retrieved; agent sometimes pads aggregation answers with unsupported claims. Temp-0 tool-calling still has variance.

---

## Architecture

```
bot finishes → enqueue { meetingId } to `memory` queue (BullMQ)
   → ingest worker (NEW process, reuses api-server code — NOT a new service):
        one job = full ingest of one meeting:
        1. fetch transcript.jsonl (+ speakers.jsonl) from R2
        2. EXTRACT (OpenAI Structured Outputs) → meeting_type + decisions / action_items / chapters / summary  (+ provenance)
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

- **`meetings.type`** — soft meeting-type label from extraction (sales | intro | standup | ...). _(migration 0002)_
- **`decisions`** — `id, meeting_id (fk), seq, text, evidence_quote, speaker, start_s, end_s, created_at`, `UNIQUE(meeting_id, seq)`
- **`action_items`** — `id, meeting_id (fk), seq, text, owner, due (nullable text), evidence_quote, speaker, start_s, end_s, created_at`, `UNIQUE(meeting_id, seq)`

Every extracted row carries **provenance** (`evidence_quote` + `start_s`/`end_s` + `speaker`). **No per-type extraction tables** (D5) — type-specific detail lives in the `summary` + transcript, surfaced by the agent at query time.

## 2. Grounded extraction (the spine) — ✅ built + verified

- **OpenAI Structured Outputs** (strict JSON schema, `gpt-4o-mini`) — guaranteed-valid output, no free-text parsing. Behind the swappable `LLMProvider` interface (`src/llm/`).
- One LLM pass over the full transcript emits a **minimal universal spine** that works for any meeting type: `meeting_type` (soft label), `decisions[]`, `action_items[]` (owner/due), `chapters[]`, `summary`. Each decision/action carries a **verbatim `evidence_quote`** + timestamp span. Type-specific detail (sales budget/objections, intro asks) lives in the `summary` + searchable transcript, not pre-structured (D5).
- Prompt rules: a decision (a choice made) and an action_item (a future task) are **mutually exclusive**; capture every distinct decision incl. restated ones; merge duplicates; messy-ASR-aware (filler / false starts / crosstalk).
- **Hallucination guard (`quoteGuard`):** drop any decision/action whose `evidence_quote` is not a normalized substring of the transcript. Verified on messy sales / intro / eng seeds (0 hallucinated). Known fuzzy edge: a single decision occasionally splits into 2 complementary records — tune via eval, not manual prompting.

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
- **Per-type extraction tables / `kind` enums** (D5) — brittle complexity that grows per meeting type; type-specific intelligence is a query-time agent concern, not an ingest schema.
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
