// Embedding モデルを Hugging Face から1回だけダウンロードし、models/ に保存する。
// インターネットを使うのはこのスクリプトだけ。
// 実行: npm run download-model

import { MODEL_NAME } from "../backend/config.ts";
import { getModel } from "../backend/embedder.ts";

console.log(`ダウンロード中: ${MODEL_NAME}`);
await getModel(true);
console.log(`保存しました: models/${MODEL_NAME}`);
