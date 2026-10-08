// プロジェクト全体で使う設定値。
// パスはすべてこのファイルの位置から組み立てるので、どこに clone しても動く。

import { fileURLToPath } from "node:url";
import path from "node:path";

export const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Hugging Face 上のモデル名（ダウンロード元）。intfloat/multilingual-e5-base を ONNX 形式に変換したもの
export const MODEL_NAME = "Xenova/multilingual-e5-base";

// 重みの精度。q8 = 8bit に量子化した版（fp32 版の約 1/4 の大きさで、精度はほぼ同じ）
export const MODEL_DTYPE = "q8";

// ダウンロードしたモデルを置く場所。検索時はここから読むだけで、ネットには繋がない
export const MODELS_DIR = path.join(PROJECT_ROOT, "models");

export const BOOKS_JSON = path.join(PROJECT_ROOT, "data", "books.json");
export const DB_PATH = path.join(PROJECT_ROOT, "data", "books.db");
export const FRONTEND_DIR = path.join(PROJECT_ROOT, "frontend");

export const PORT = 8000;
