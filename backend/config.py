"""プロジェクト全体で使う設定値。

パスはすべてこのファイルの位置から組み立てるので、どこに clone しても動く。
"""

from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parent.parent

# Hugging Face 上のモデル名（ダウンロード元）
MODEL_NAME = "intfloat/multilingual-e5-base"

# ダウンロードしたモデルを置く場所。検索時はここから読むだけで、ネットには繋がない
MODEL_DIR = PROJECT_ROOT / "models" / "multilingual-e5-base"

# 登録するサンプルデータと、Embedding済みデータを保存する SQLite ファイル
BOOKS_JSON = PROJECT_ROOT / "data" / "books.json"
DB_PATH = PROJECT_ROOT / "data" / "books.db"
