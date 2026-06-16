# Eval harness (v2 Raven Memory)

The ruler that proves retrieval + answer quality and catches regressions. Built **before** the pipeline so every later choice (chunker, embedding model, contextual prefix, reranker) is measured, not guessed. Dev/CI only — never a runtime component.

## Contents

- `seeds/*.transcript.jsonl` — seed meetings in the bot's transcript format (`{speaker, text, start, end, confidence}` per line). Double as demo seed data, so first-time search works without recording 10 meetings.
- `golden-set.json` — questions with `expected_facts`, `relevant_meetings`, and (after ingest) `relevant_ids`. Each maps to a query type from `PLAN.md`: local lookup, structured/aggregative, recency, decision lookup, cross-meeting synthesis, and refusal.

## What gets measured

- **Retrieval** (computed from labeled `relevant_ids`): recall@k, MRR, nDCG.
- **Answer quality** (Ragas, Python): faithfulness, answer relevancy, context precision/recall.
- **Behavior cases**: `q3` checks recency/superseded handling; `q7` checks the agent refuses ("not in your meetings") instead of fabricating.

## Workflow

1. Ingest the seed meetings (memory-worker) → extraction + chunks land in Postgres.
2. Populate each question's `relevant_ids` with the decision/action/chunk ids that actually answer it.
3. Run the harness: it calls `POST /api/v1/ask` per question, scores retrieval + answer metrics, prints a scorecard.
4. Re-run on every chunker / prompt / embedding-model change; gate changes on the score.

## Notes

- `relevant_ids` are empty until the seeds are ingested — `expected_facts` + `relevant_meetings` define correctness until then.
- Grow the set toward ~100 questions as the corpus grows. Keep it covering all six query types.
