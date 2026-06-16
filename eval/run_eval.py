"""v2 eval runner (skeleton).

Loads the golden set, queries /api/v1/ask per question, scores retrieval metrics
(recall@k / MRR / nDCG) against labeled relevant_ids, and — once wired — Ragas
answer metrics on (answer, retrieved contexts). Prints a scorecard.

Wire call_ask() + Ragas after the /ask endpoint and ingest exist (see README).
"""
import json
import os
from pathlib import Path

from metrics import mrr, ndcg_at_k, recall_at_k

GOLDEN = Path(__file__).parent / "golden-set.json"
ASK_URL = os.environ.get("ASK_URL", "http://localhost:3000/api/v1/ask")
K = 5


def call_ask(question: str) -> dict:
    """POST {q: question} to ASK_URL. Returns {answer, citations, retrieved_ids}.

    TODO: implement with `requests` once /api/v1/ask lands.
    """
    raise NotImplementedError("Wire to /api/v1/ask after the endpoint exists")


def main() -> None:
    data = json.loads(GOLDEN.read_text())
    questions = data["questions"]
    print(f"Loaded {len(questions)} golden questions across {len(data['meetings'])} seed meetings.")
    by_type: dict[str, int] = {}
    for q in questions:
        by_type[q["type"]] = by_type.get(q["type"], 0) + 1
    for qtype, n in sorted(by_type.items()):
        print(f"  {qtype:24} {n}")
    # TODO per question: resp = call_ask(q["question"])
    #   retrieval: recall_at_k / mrr / ndcg_at_k (resp["retrieved_ids"], q["relevant_ids"], K)
    #   answer:    Ragas faithfulness / answer_relevancy / context_precision
    #   behavior:  q["expect_refusal"] -> assert the answer declined
    print("\nRunner skeleton ready. Wire call_ask() + Ragas once /ask + ingest exist.")


if __name__ == "__main__":
    main()
