"""SQLite に本とその Embedding を保存・取得する部分。

ベクトル（float32 × 768）は numpy のバイト列にして BLOB 列にそのまま入れる。
768 × 4 バイト = 3,072 バイト / 冊。
"""

import sqlite3

import numpy as np

from backend.config import DB_PATH

SCHEMA = """CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  embedding   BLOB NOT NULL
);"""


def connect():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute(SCHEMA)
    return conn


def vector_to_blob(vector):
    return np.asarray(vector, dtype=np.float32).tobytes()


def blob_to_vector(blob):
    return np.frombuffer(blob, dtype=np.float32)


def passage_text(title, description):
    """本1冊を Embedding するときにモデルへ渡す文章（prefix は embedder 側で付く）。"""
    return f"{title}\n{description}"


def insert_book(conn, title, description, vector):
    cur = conn.execute(
        "INSERT INTO books (title, description, embedding) VALUES (?, ?, ?)",
        (title, description, vector_to_blob(vector)),
    )
    conn.commit()
    return cur.lastrowid


def update_book(conn, book_id, description, vector):
    conn.execute(
        "UPDATE books SET description = ?, embedding = ? WHERE id = ?",
        (description, vector_to_blob(vector), book_id),
    )
    conn.commit()


def find_by_title(conn, title):
    return conn.execute("SELECT * FROM books WHERE title = ?", (title,)).fetchone()


def get_book(conn, book_id):
    return conn.execute("SELECT * FROM books WHERE id = ?", (book_id,)).fetchone()


def delete_book(conn, book_id):
    cur = conn.execute("DELETE FROM books WHERE id = ?", (book_id,))
    conn.commit()
    return cur.rowcount > 0


def all_books(conn):
    """検索時に使う。保存済みのベクトルを読むだけで、Embedding は作り直さない。"""
    return conn.execute("SELECT id, title, description, embedding FROM books ORDER BY id").fetchall()


def count_books(conn):
    return conn.execute("SELECT COUNT(*) FROM books").fetchone()[0]


def keyword_search(conn, keyword):
    """データベース画面の検索。Embedding を使わない、ただの文字の一致検索（LIKE）。

    戻り値: (行のリスト, 画面に見せる SQL 文)
    """
    keyword = keyword.strip()
    if not keyword:
        return all_books(conn), "SELECT * FROM books;"
    # % と _ は LIKE の記号なので、文字として探せるようにエスケープする
    escaped = keyword.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    pattern = f"%{escaped}%"
    rows = conn.execute(
        "SELECT id, title, description, embedding FROM books"
        " WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY id",
        (pattern, pattern),
    ).fetchall()
    shown = keyword.replace("'", "''")
    sql = f"SELECT * FROM books WHERE title LIKE '%{shown}%' OR description LIKE '%{shown}%';"
    return rows, sql
