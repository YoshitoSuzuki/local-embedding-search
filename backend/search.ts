// ベクトルどうしの類似度を計算して、近い順に並べる部分。
//
// コサイン類似度:  cos(a, b) = (a · b) / (|a| × |b|)
// embedder でベクトルを長さ1に正規化しているので |a| = |b| = 1 となり、
// 内積 a · b がそのままコサイン類似度になる。

import { blobToVector, type BookRow } from "./db.ts";

export type SearchResult = {
  id: number;
  title: string;
  description: string;
  similarity: number;
};

export function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

// 保存済みの全行と検索ベクトルを比べ、類似度の高い順に返す
export function rankBooks(queryVector: Float32Array, rows: BookRow[]): SearchResult[] {
  return rows
    .map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description,
      similarity: Math.round(dot(queryVector, blobToVector(row.embedding)) * 10000) / 10000,
    }))
    .sort((a, b) => b.similarity - a.similarity);
}
