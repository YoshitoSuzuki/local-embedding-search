"""ベクトルどうしの類似度を計算して、近い順に並べる部分。

コサイン類似度:  cos(a, b) = (a · b) / (|a| × |b|)
embedder でベクトルを長さ1に正規化しているので |a| = |b| = 1 となり、
内積 a · b がそのままコサイン類似度になる。
"""

import numpy as np

from backend.db import blob_to_vector


def rank_books(query_vector, rows):
    """保存済みの全行と検索ベクトルを比べ、類似度の高い順に返す。"""
    if not rows:
        return []
    # 全冊のベクトルを (冊数, 768) の行列にまとめ、1回の行列積で全冊ぶんの内積を出す
    matrix = np.stack([blob_to_vector(r["embedding"]) for r in rows])
    scores = matrix @ query_vector
    results = [
        {
            "id": r["id"],
            "title": r["title"],
            "description": r["description"],
            "similarity": round(float(s), 4),
        }
        for r, s in zip(rows, scores)
    ]
    results.sort(key=lambda x: x["similarity"], reverse=True)
    return results
