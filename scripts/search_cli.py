"""Step 4: ブラウザを使わずに、保存済みのベクトルに対して類似度検索する。

実行: python -m scripts.search_cli "数学が得意な人が出てくるミステリー"
"""

import sys

from backend.db import all_books, connect
from backend.embedder import embed_query
from backend.search import rank_books

query = sys.argv[1] if len(sys.argv) > 1 else "数学が得意な人が出てくるミステリー"
rows = all_books(connect())
results = rank_books(embed_query(query), rows)
print(f"検索文: {query}\n")
for i, r in enumerate(results, 1):
    print(f"{i}. {r['title']}  類似度: {r['similarity']:.4f}\n   {r['description']}")
