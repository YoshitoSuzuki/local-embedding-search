// Step 3: data/books.json の本を Embedding して SQLite（data/books.db）に保存する。
// すでに同じ内容・同じモデルで保存されている本は Embedding し直さない（変わった本だけ作り直す）。
// 実行: npm run build-index

import { readFileSync } from "node:fs";

import { BOOKS_JSON, MODEL_DTYPE, MODEL_NAME } from "../backend/config.ts";
import { connect, findByTitle, insertBook, passageText, updateBook } from "../backend/db.ts";
import { embedPassage } from "../backend/embedder.ts";

const books = JSON.parse(readFileSync(BOOKS_JSON, "utf-8")) as { title: string; description: string }[];
const model = `${MODEL_NAME}:${MODEL_DTYPE}`;
const db = connect();
let added = 0;
let updated = 0;
let skipped = 0;

for (const { title, description } of books) {
  const existing = findByTitle(db, title);
  if (existing && existing.description === description && existing.model === model) {
    console.log(`[skip] ${title}（保存済みのベクトルを再利用）`);
    skipped++;
    continue;
  }
  const vector = await embedPassage(passageText(title, description));
  if (existing) {
    updateBook(db, existing.id, description, model, vector);
    console.log(`[update] ${title}`);
    updated++;
  } else {
    insertBook(db, title, description, model, vector);
    console.log(`[insert] ${title}`);
    added++;
  }
}

console.log(`\n追加 ${added} / 更新 ${updated} / 再利用 ${skipped} → data/books.db`);
