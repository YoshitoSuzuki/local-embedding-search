// Step 2: モデル単体を動かし「文章 → ベクトル」になることを確かめる。
// 実行: npm run try-embedding -- "好きな文章"

import { embedQuery } from "../backend/embedder.ts";

const text = process.argv[2] ?? "数学が得意な人が出てくるミステリー";
const vector = await embedQuery(text);
const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
console.log(`型: ${vector.constructor.name}, 長さ: ${vector.length}`);
console.log(`ベクトルの長さ（ノルム）: ${norm.toFixed(4)}`);
