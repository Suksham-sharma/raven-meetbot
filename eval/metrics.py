"""Retrieval metrics for the v2 eval harness. Pure functions over ranked id lists.

Generation-side metrics (faithfulness, answer relevancy, context precision/recall)
come from Ragas; these cover the retrieval side, scored against labeled relevant_ids.
"""
from __future__ import annotations

import math
from typing import Hashable, Sequence


def recall_at_k(retrieved: Sequence[Hashable], relevant: Sequence[Hashable], k: int) -> float:
    """Fraction of relevant ids present in the top-k retrieved."""
    rel = set(relevant)
    if not rel:
        return 1.0  # nothing to find -> vacuously perfect (refusal cases score elsewhere)
    top = set(retrieved[:k])
    return sum(1 for r in rel if r in top) / len(rel)


def mrr(retrieved: Sequence[Hashable], relevant: Sequence[Hashable]) -> float:
    """Reciprocal rank of the first relevant id (0 if none retrieved)."""
    rel = set(relevant)
    for rank, rid in enumerate(retrieved, start=1):
        if rid in rel:
            return 1.0 / rank
    return 0.0


def ndcg_at_k(retrieved: Sequence[Hashable], relevant: Sequence[Hashable], k: int) -> float:
    """Binary-relevance nDCG@k."""
    rel = set(relevant)
    dcg = sum(
        1.0 / math.log2(rank + 1)
        for rank, rid in enumerate(retrieved[:k], start=1)
        if rid in rel
    )
    ideal_hits = min(len(rel), k)
    idcg = sum(1.0 / math.log2(rank + 1) for rank in range(1, ideal_hits + 1))
    return dcg / idcg if idcg > 0 else 0.0
