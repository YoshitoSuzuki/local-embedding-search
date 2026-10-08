"""Embedding モデルを Hugging Face から1回だけダウンロードし、models/ に保存する。

インターネットを使うのはこのスクリプトだけ。
実行: python -m scripts.download_model
"""

from sentence_transformers import SentenceTransformer

from backend.config import MODEL_DIR, MODEL_NAME


def main():
    print(f"ダウンロード中: {MODEL_NAME}")
    model = SentenceTransformer(MODEL_NAME)
    model.save(str(MODEL_DIR))
    print(f"保存しました: models/{MODEL_DIR.name}")


if __name__ == "__main__":
    main()
