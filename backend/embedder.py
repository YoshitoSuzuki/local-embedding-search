"""ローカルの Embedding モデルを動かす部分。

入力: 文章（str）
出力: ベクトル（float32 の numpy 配列, 768 次元）

multilingual-e5 は「検索文」と「検索される文書」で先頭に付ける文字を変える決まりがある。
  検索文   → "query: ..."
  文書側   → "passage: ..."
同じモデルでも、こう区別して学習されているため、付けたほうが検索精度が上がる。
"""

import os
import threading

# モデルはローカルのフォルダから読むので、Hugging Face への通信を一切させない
os.environ.setdefault("HF_HUB_OFFLINE", "1")
os.environ.setdefault("TRANSFORMERS_OFFLINE", "1")

import numpy as np
import torch
from sentence_transformers import SentenceTransformer

from backend.config import MODEL_DIR, MODEL_NAME

_model = None
# Web サーバーは複数のリクエストを並行に処理するので、モデルの計算は1つずつ通す
_lock = threading.Lock()


def _device():
    # Apple Silicon の GPU（Metal）が使えればそれを、だめなら CPU で計算する
    return "mps" if torch.backends.mps.is_available() else "cpu"


def get_model():
    """モデルを1回だけメモリに読み込み、以後は使い回す。"""
    global _model
    if _model is None:
        if not MODEL_DIR.exists():
            raise SystemExit(
                f"モデルが見つかりません: {MODEL_DIR}\n"
                "先に `python -m scripts.download_model` を実行してください。"
            )
        _model = SentenceTransformer(str(MODEL_DIR), device=_device())
    return _model


def _embed(text, prefix, log=True):
    model = get_model()
    # normalize_embeddings=True で長さ1のベクトルにする（類似度計算が内積だけで済む）
    with _lock:
        vector = model.encode(prefix + text, normalize_embeddings=True).astype(np.float32)
    if log:
        head = ", ".join(f"{v:.4f}" for v in vector[:4])
        print(
            "[Embedding]\n"
            f"Input:\n{prefix}{text}\n\n"
            f"Model:\n{MODEL_NAME} (local: models/{MODEL_DIR.name}, device: {model.device})\n\n"
            f"Vector dimension:\n{vector.shape[0]}\n\n"
            f"Vector head:\n[{head}, ...]\n\n"
            "Embedding generated successfully.\n",
            flush=True,
        )
    return vector


def embed_query(text, log=True):
    """ユーザーの検索文をベクトルにする（検索のたびに呼ばれる）。"""
    return _embed(text, "query: ", log)


def embed_passage(text, log=True):
    """登録データ（本の説明）をベクトルにする（データ登録時にだけ呼ばれる）。"""
    return _embed(text, "passage: ", log)
