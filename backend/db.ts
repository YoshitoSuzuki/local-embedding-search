// SQLite に本とその Embedding を保存・取得する部分（Node.js 標準の node:sqlite を使う）。
//
// ベクトル（Float32Array, 768 次元）はバイト列にして BLOB 列にそのまま入れる。
// 768 × 4 バイト = 3,072 バイト / 冊。
// model 列には、どのモデルで作ったベクトルかを残す（モデルを替えたら作り直しが必要なため）。

import { DatabaseSync } from "node:sqlite";

import { DB_PATH } from "./config.ts";

export const SCHEMA = `CREATE TABLE IF NOT EXISTS books (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  model       TEXT NOT NULL,
  embedding   BLOB NOT NULL
);`;

export type BookRow = {
  id: number;
  title: string;
  description: string;
  model: string;
  embedding: Uint8Array;
};

export function connect(): DatabaseSync {
  const db = new DatabaseSync(DB_PATH);
  db.exec(SCHEMA);
  return db;
}

export function vectorToBlob(vector: Float32Array): Uint8Array {
  return new Uint8Array(vector.buffer, vector.byteOffset, vector.byteLength);
}

export function blobToVector(blob: Uint8Array): Float32Array {
  // SQLite から返るバイト列は位置がそろっていないことがあるので、コピーしてから Float32 として読む
  const copy = new Uint8Array(blob);
  return new Float32Array(copy.buffer);
}

// 本1冊を Embedding するときにモデルへ渡す文章（prefix は embedder 側で付く）
export function passageText(title: string, description: string): string {
  return `${title}\n${description}`;
}

export function insertBook(db: DatabaseSync, title: string, description: string, model: string, vector: Float32Array): number {
  const result = db
    .prepare("INSERT INTO books (title, description, model, embedding) VALUES (?, ?, ?, ?)")
    .run(title, description, model, vectorToBlob(vector));
  return Number(result.lastInsertRowid);
}

export function updateBook(db: DatabaseSync, id: number, description: string, model: string, vector: Float32Array): void {
  db.prepare("UPDATE books SET description = ?, model = ?, embedding = ? WHERE id = ?").run(
    description, model, vectorToBlob(vector), id,
  );
}

export function findByTitle(db: DatabaseSync, title: string): BookRow | undefined {
  return db.prepare("SELECT * FROM books WHERE title = ?").get(title) as BookRow | undefined;
}

export function getBook(db: DatabaseSync, id: number): BookRow | undefined {
  return db.prepare("SELECT * FROM books WHERE id = ?").get(id) as BookRow | undefined;
}

export function deleteBook(db: DatabaseSync, id: number): boolean {
  return Number(db.prepare("DELETE FROM books WHERE id = ?").run(id).changes) > 0;
}

// 検索時に使う。保存済みのベクトルを読むだけで、Embedding は作り直さない
export function allBooks(db: DatabaseSync): BookRow[] {
  return db.prepare("SELECT * FROM books ORDER BY id").all() as BookRow[];
}

export function countBooks(db: DatabaseSync): number {
  return Number((db.prepare("SELECT COUNT(*) AS n FROM books").get() as { n: number }).n);
}

// データベース画面の検索。Embedding を使わない、ただの文字の一致検索（LIKE）。
// 戻り値の sql は画面に見せるための文で、実際の問い合わせは ? に値を渡して実行する
export function keywordSearch(db: DatabaseSync, keyword: string): { rows: BookRow[]; sql: string } {
  const k = keyword.trim();
  if (!k) return { rows: allBooks(db), sql: "SELECT * FROM books;" };
  // % と _ は LIKE の記号なので、文字として探せるようにエスケープする
  const pattern = `%${k.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  const rows = db
    .prepare("SELECT * FROM books WHERE title LIKE ? ESCAPE '\\' OR description LIKE ? ESCAPE '\\' ORDER BY id")
    .all(pattern, pattern) as BookRow[];
  const shown = k.replaceAll("'", "''");
  return { rows, sql: `SELECT * FROM books WHERE title LIKE '%${shown}%' OR description LIKE '%${shown}%';` };
}
