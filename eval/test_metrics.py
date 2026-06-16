"""Unit tests for the retrieval metrics.

Run via pytest, or directly without pytest: python3 eval/test_metrics.py
"""
import math

from metrics import mrr, ndcg_at_k, recall_at_k


def test_recall_at_k():
    assert recall_at_k(["a", "b", "c"], ["b"], 3) == 1.0
    assert recall_at_k(["a", "b", "c"], ["x"], 3) == 0.0
    assert recall_at_k(["a", "b", "c", "d"], ["b", "d"], 2) == 0.5  # only b in top-2
    assert recall_at_k(["a", "b"], [], 2) == 1.0  # nothing to find


def test_mrr():
    assert mrr(["a", "b", "c"], ["b"]) == 0.5
    assert mrr(["b", "a"], ["b"]) == 1.0
    assert mrr(["a", "b"], ["x"]) == 0.0


def test_ndcg_at_k():
    assert ndcg_at_k(["a", "b"], ["a"], 2) == 1.0  # hit at rank 1
    assert abs(ndcg_at_k(["x", "a"], ["a"], 2) - (1 / math.log2(3))) < 1e-9  # hit at rank 2
    assert ndcg_at_k(["x", "y"], ["a"], 2) == 0.0  # miss


if __name__ == "__main__":
    for _name, _fn in sorted(globals().items()):
        if _name.startswith("test_") and callable(_fn):
            _fn()
            print(f"ok  {_name}")
    print("All metric tests passed.")
