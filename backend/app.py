"""Web サーバー（FastAPI）。ブラウザからのリクエストを受けて、Embedding・DB・類似度計算を呼ぶ。

起動: uvicorn backend.app:app --host 127.0.0.1 --port 8000
"""

import os
import sqlite3
import time
from contextlib import asynccontextmanager, closing

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from backend import db
from backend.config import MODEL_DIR, MODEL_NAME, PROJECT_ROOT
from backend.embedder import embed_passage, embed_query, get_model
from backend.search import rank_books

FRONTEND_DIR = PROJECT_ROOT / "frontend"


@asynccontextmanager
async def lifespan(app):
    # 最初の検索で待たないよう、起動時にモデルをメモリへ読み込んでおく
    get_model()
    with closing(db.connect()) as conn:
        if db.count_books(conn) == 0:
            print("[DB] books が空です。`python -m scripts.build_index` で登録してください。")
    yield


app = FastAPI(title="Local Semantic Search", lifespan=lifespan)


def head(vector, n=4):
    return [round(float(v), 4) for v in vector[:n]]


def timed(fn, *args):
    start = time.perf_counter()
    result = fn(*args)
    return result, round((time.perf_counter() - start) * 1000, 1)


class SearchRequest(BaseModel):
    query: str = Field(min_length=1, max_length=500)


class BookRequest(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=2000)


@app.get("/api/status")
def status():
    model = get_model()
    return {
        "model": MODEL_NAME,
        "model_dir": f"models/{MODEL_DIR.name}",
        "device": str(model.device).split(":")[0],
        "offline": os.environ.get("HF_HUB_OFFLINE") == "1",
    }


@app.post("/api/search")
def search(req: SearchRequest):
    query = req.query.strip()
    # 1. 検索文だけを、このPCのモデルでベクトルにする
    vector, embed_ms = timed(embed_query, query)
    # 2. 保存済みのベクトルを DB から読む（本の側は Embedding し直さない）
    with closing(db.connect()) as conn:
        rows = db.all_books(conn)
    # 3. 類似度を計算して並べる
    results = rank_books(vector, rows)
    for i, r in enumerate(results, 1):
        print(f"[Search] {i}. {r['similarity']:.4f}  {r['title']}")
    return {
        "results": results,
        "trace": {
            "request": {"query": query},
            "embedding": {
                "input": f"query: {query}",
                "dimension": int(vector.shape[0]),
                "vector_head": head(vector),
                "ms": embed_ms,
            },
            "database": {
                "sql": "SELECT id, title, description, embedding FROM books;",
                "rows": len(rows),
                "reembedded": 0,
            },
        },
    }


def book_row(row):
    vector = db.blob_to_vector(row["embedding"])
    return {
        "id": row["id"],
        "title": row["title"],
        "description": row["description"],
        "dimension": int(vector.shape[0]),
        "vector_head": head(vector),
    }


@app.get("/api/books")
def list_books(q: str = ""):
    with closing(db.connect()) as conn:
        rows, sql = db.keyword_search(conn, q)
        total = db.count_books(conn)
    return {"books": [book_row(r) for r in rows], "sql": sql, "total": total}


@app.get("/api/books/{book_id}")
def get_book(book_id: int):
    with closing(db.connect()) as conn:
        row = db.get_book(conn, book_id)
    if row is None:
        raise HTTPException(404, "本が見つかりません")
    vector = db.blob_to_vector(row["embedding"])
    return {
        **book_row(row),
        "dtype": str(vector.dtype),
        "bytes": len(row["embedding"]),
        "norm": round(float((vector**2).sum() ** 0.5), 4),
        "vector": [round(float(v), 4) for v in vector],
    }


@app.post("/api/books", status_code=201)
def add_book(req: BookRequest):
    title, description = req.title.strip(), req.description.strip()
    text = db.passage_text(title, description)
    # データ登録のときだけ、本の説明を Embedding する
    vector, embed_ms = timed(embed_passage, text)
    try:
        with closing(db.connect()) as conn:
            book_id = db.insert_book(conn, title, description, vector)
    except sqlite3.IntegrityError:
        raise HTTPException(409, "同じタイトルの本がすでにあります")
    return {
        "id": book_id,
        "trace": {
            "embedding": {
                "input": f"passage: {text}",
                "dimension": int(vector.shape[0]),
                "vector_head": head(vector),
                "bytes": len(db.vector_to_blob(vector)),
                "ms": embed_ms,
            },
            "database": {"sql": "INSERT INTO books (title, description, embedding) VALUES (?, ?, ?);"},
        },
    }


@app.delete("/api/books/{book_id}", status_code=204)
def remove_book(book_id: int):
    with closing(db.connect()) as conn:
        if not db.delete_book(conn, book_id):
            raise HTTPException(404, "本が見つかりません")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")


app.mount("/", StaticFiles(directory=FRONTEND_DIR), name="frontend")
