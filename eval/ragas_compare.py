"""Compare the self-built LLM judge (api-server/src/agent/judge.ts) against Ragas
on the SAME agent answers.

Reads _ask_runs.json (produced by `pnpm eval:answer --dump`), which holds each
question's answer + retrieved contexts + the self-judge's faithfulness/relevancy.
Scores those same rows with Ragas (configured to use the SAME judge model,
gpt-4o-mini, and embeddings, text-embedding-3-small, so the only variable is the
metric implementation), and prints them side by side.

Run (venv with ragas 0.2.15 + langchain<0.4):
    export OPENAI_API_KEY=...   # from api-server/.env
    .venv/bin/python ragas_compare.py
"""
import json
import math
from pathlib import Path

from langchain_openai import ChatOpenAI, OpenAIEmbeddings
from ragas import EvaluationDataset, evaluate
from ragas.embeddings import LangchainEmbeddingsWrapper
from ragas.llms import LangchainLLMWrapper
from ragas.metrics import answer_relevancy, faithfulness

RUNS = Path(__file__).parent / "_ask_runs.json"


def fmt(x) -> str:
    return "nan " if x is None or (isinstance(x, float) and math.isnan(x)) else f"{x:.2f}"


def main() -> None:
    rows = json.loads(RUNS.read_text())
    graded = [r for r in rows if not r["expect_refusal"]]
    print(f"Scoring {len(graded)} non-refusal answers with Ragas (judge=gpt-4o-mini)...\n")

    ds = EvaluationDataset.from_list(
        [
            {
                "user_input": r["question"],
                "response": r["answer"],
                "retrieved_contexts": r["contexts"] or ["(none)"],
            }
            for r in graded
        ]
    )

    judge_llm = LangchainLLMWrapper(ChatOpenAI(model="gpt-4o-mini", temperature=0))
    judge_emb = LangchainEmbeddingsWrapper(OpenAIEmbeddings(model="text-embedding-3-small"))
    result = evaluate(
        dataset=ds,
        metrics=[faithfulness, answer_relevancy],
        llm=judge_llm,
        embeddings=judge_emb,
    )
    df = result.to_pandas()

    print(f"{'id':<24} {'faith(mine)':>11} {'faith(ragas)':>12}   {'rel(mine)':>9} {'rel(ragas)':>10}")
    print("-" * 74)
    sums = {"mf": 0.0, "rf": 0.0, "mr": 0.0, "rr": 0.0, "fd": 0.0, "rd": 0.0, "n": 0}
    for i, r in enumerate(graded):
        rf = float(df.iloc[i]["faithfulness"])
        rr = float(df.iloc[i]["answer_relevancy"])
        mf = r["my_faithfulness"]
        mr = r["my_relevancy"]
        print(f"{r['id']:<24} {fmt(mf):>11} {fmt(rf):>12}   {fmt(mr):>9} {fmt(rr):>10}")
        if mf is not None and not math.isnan(rf):
            sums["mf"] += mf; sums["rf"] += rf; sums["fd"] += abs(mf - rf)
            sums["mr"] += mr; sums["rr"] += rr; sums["rd"] += abs(mr - rr)
            sums["n"] += 1

    n = sums["n"]
    print("-" * 74)
    print(
        f"{'MEAN':<24} {sums['mf']/n:>11.3f} {sums['rf']/n:>12.3f}   "
        f"{sums['mr']/n:>9.3f} {sums['rr']/n:>10.3f}"
    )
    print(
        f"\nMean |mine - ragas|:  faithfulness={sums['fd']/n:.3f}   relevancy={sums['rd']/n:.3f}"
    )


if __name__ == "__main__":
    main()
