"""v2 eval runner.

Loads the golden set, queries POST /api/v1/ask per question, and scores:
  - retrieval : meeting-level recall@k / MRR (from retrieved_meetings vs
                relevant_meetings; switch to chunk-level once relevant_ids land)
  - behavior  : refusal correctness, cite-or-refuse compliance, grounding
  - answer    : Ragas faithfulness / answer_relevancy (OPTIONAL — only if ragas
                is installed; skipped with a note otherwise)

Run (server must be up: cd api-server && pnpm dev):
    python run_eval.py
    ASK_URL=http://localhost:3000/api/v1/ask K=5 python run_eval.py
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from metrics import mrr, recall_at_k

GOLDEN = Path(__file__).parent / "golden-set.json"
ASK_URL = os.environ.get("ASK_URL", "http://localhost:3000/api/v1/ask")
K = int(os.environ.get("K", "8"))


def call_ask(question: str) -> dict:
    """POST {q} to ASK_URL; return the /ask JSON.

    Shape: { answer, citations[], grounded, refused, retrieved_meetings[],
             contexts[], iterations }.
    """
    body = json.dumps({"q": question}).encode("utf-8")
    req = urllib.request.Request(
        ASK_URL, data=body, headers={"Content-Type": "application/json"}, method="POST"
    )
    with urllib.request.urlopen(req, timeout=120) as resp:
        return json.loads(resp.read().decode("utf-8"))


def try_ragas(rows: list[dict]) -> None:
    """Score faithfulness + answer_relevancy with Ragas if it's installed."""
    try:
        from datasets import Dataset
        from ragas import evaluate
        from ragas.metrics import answer_relevancy, faithfulness
    except ImportError:
        print("\n(Ragas not installed — skipping semantic answer metrics.")
        print(" pip install ragas datasets  then re-run for faithfulness/answer_relevancy.)")
        return

    graded = [r for r in rows if not r["expect_refusal"]]
    ds = Dataset.from_dict(
        {
            "question": [r["question"] for r in graded],
            "answer": [r["answer"] for r in graded],
            "contexts": [r["contexts"] or [""] for r in graded],
        }
    )
    result = evaluate(ds, metrics=[faithfulness, answer_relevancy])
    print(f"\nRagas: {result}")


def main() -> None:
    data = json.loads(GOLDEN.read_text())
    questions = data["questions"]
    print(f"Loaded {len(questions)} golden questions; querying {ASK_URL} (k={K})\n")

    recalls, rrs = [], []
    refusal_ok = refusal_n = 0
    cite_or_refuse_ok = grounded_ok = 0
    rows = []

    print(f"{'id':<24} {'recall':>6} {'mrr':>5}  flags")
    print("-" * 72)
    for q in questions:
        try:
            resp = call_ask(q["question"])
        except urllib.error.URLError as e:
            print(f"{q['id']:<24}  ERROR: {e} (is the api-server running?)")
            return

        retrieved = resp.get("retrieved_meetings", [])
        relevant = q.get("relevant_meetings", [])
        refused = resp.get("refused", False)
        grounded = resp.get("grounded", False)
        cites = resp.get("citations", [])

        flags = []
        if q.get("expect_refusal"):
            refusal_n += 1
            ok = refused
            refusal_ok += int(ok)
            if not ok:
                flags.append("DID-NOT-REFUSE")
            cite_or_refuse_ok += int(refused)
            grounded_ok += int(grounded)
            print(f"{q['id']:<24} {'—':>6} {'—':>5}  {'refuse✓' if ok else ''} {' '.join(flags)}")
        else:
            r = recall_at_k(retrieved, relevant, K) if relevant else 1.0
            rk = mrr(retrieved, relevant) if relevant else 1.0
            recalls.append(r)
            rrs.append(rk)
            cite_or_refuse_ok += int(len(cites) > 0)
            grounded_ok += int(grounded)
            if not cites:
                flags.append("NO-CITES")
            print(f"{q['id']:<24} {r:>6.2f} {rk:>5.2f}  {' '.join(flags)}")

        rows.append(
            {
                "question": q["question"],
                "answer": resp.get("answer", ""),
                "contexts": resp.get("contexts", []),
                "expect_refusal": bool(q.get("expect_refusal")),
            }
        )

    n = len(questions)
    print("-" * 72)
    print(
        f"MEAN  recall@{K}={sum(recalls)/len(recalls):.3f}  MRR={sum(rrs)/len(rrs):.3f}  "
        f"cite-or-refuse={cite_or_refuse_ok/n:.3f}  grounded={grounded_ok/n:.3f}  "
        f"refusal={refusal_ok/refusal_n:.3f}" if refusal_n else ""
    )

    try_ragas(rows)


if __name__ == "__main__":
    main()
