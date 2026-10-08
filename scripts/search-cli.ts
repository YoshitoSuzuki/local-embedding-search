// Step 4: ブラウザを使わずに、保存済みのベクトルに対して類似度検索する。
// 実行: npm run search -- "数学が得意な人が出てくるミステリー"

import { allBooks, connect } from "../backend/db.ts";
import { embedQuery } from "../backend/embedder.ts";
import { rankBooks } from "../backend/search.ts";

const query = process.argv[2] ?? "数学が得意な人が出てくるミステリー";
const results = rankBooks(await embedQuery(query), allBooks(connect()));
console.log(`検索文: ${query}\n`);
results.forEach((r, i) => {
  console.log(`${i + 1}. ${r.title}  類似度: ${r.similarity.toFixed(4)}\n   ${r.description}`);
});
