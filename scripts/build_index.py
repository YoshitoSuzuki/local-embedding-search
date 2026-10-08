"""Step 3: data/books.json の本を Embedding して SQLite（data/books.db）に保存する。

すでに同じ内容で保存されている本は Embedding し直さない（変わった本だけ作り直す）。
実行: python -m scripts.build_index
"""

import json

from backend.config import BOOKS_JSON
from backend.db import connect, find_by_title, insert_book, passage_text, update_book
from backend.embedder import embed_passage


def main():
    books = json.loads(BOOKS_JSON.read_text(encoding="utf-8"))
    conn = connect()
    added = updated = skipped = 0
    for book in books:
        title, description = book["title"], book["description"]
        existing = find_by_title(conn, title)
        if existing and existing["description"] == description:
            print(f"[skip] {title}（保存済みのベクトルを再利用）")
            skipped += 1
            continue
        vector = embed_passage(passage_text(title, description))
        if existing:
            update_book(conn, existing["id"], description, vector)
            print(f"[update] {title}")
            updated += 1
        else:
            insert_book(conn, title, description, vector)
            print(f"[insert] {title}")
            added += 1
    print(f"\n追加 {added} / 更新 {updated} / 再利用 {skipped} → data/books.db")


if __name__ == "__main__":
    main()
