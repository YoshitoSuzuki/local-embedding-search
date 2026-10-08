"""Step 2: モデル単体を動かし「文章 → ベクトル」になることを確かめる。

実行: python -m scripts.try_embedding "好きな文章"
"""

import sys

from backend.embedder import embed_query

text = sys.argv[1] if len(sys.argv) > 1 else "数学が得意な人が出てくるミステリー"
vector = embed_query(text)
print(f"型: {type(vector).__name__}, 形: {vector.shape}, 要素の型: {vector.dtype}")
print(f"ベクトルの長さ（ノルム）: {float((vector ** 2).sum() ** 0.5):.4f}")
