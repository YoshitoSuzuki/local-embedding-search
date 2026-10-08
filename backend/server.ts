// Web サーバー（Hono）。ブラウザからのリクエストを受けて、Embedding・DB・類似度計算を呼ぶ。
// 起動: npm start

import path from "node:path";

import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

import { FRONTEND_DIR, MODEL_DTYPE, MODEL_NAME, PORT } from "./config.ts";
import * as db from "./db.ts";
import { embedPassage, embedQuery, getModel, isOffline } from "./embedder.ts";
import { rankBooks } from "./search.ts";

const MODEL_ID = `${MODEL_NAME}:${MODEL_DTYPE}`;

// 検索結果として返す件数。比べるのは全冊、返すのは上位だけ
const SEARCH_LIMIT = 10;

const head = (vector: Float32Array, n = 4) => Array.from(vector.slice(0, n), (v) => Math.round(v * 10000) / 10000);

async function timed<T>(fn: () => Promise<T>): Promise<[T, number]> {
  const start = performance.now();
  const result = await fn();
  return [result, Math.round((performance.now() - start) * 10) / 10];
}

function withDb<T>(fn: (conn: ReturnType<typeof db.connect>) => T): T {
  const conn = db.connect();
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function bookSummary(row: db.BookRow) {
  const vector = db.blobToVector(row.embedding);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    dimension: vector.length,
    vector_head: head(vector),
  };
}

// リクエストの JSON から文字列を取り出す。空や長すぎるときは null
function text(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s.length > 0 && s.length <= max ? s : null;
}

const app = new Hono();

app.get("/api/status", (c) =>
  c.json({ model: MODEL_NAME, dtype: MODEL_DTYPE, device: "cpu", offline: isOffline() }),
);

app.post("/api/search", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const query = text(body.query, 500);
  if (query === null) return c.json({ detail: "検索文を入力してください" }, 422);

  // 1. 検索文だけを、このPCのモデルでベクトルにする
  const [vector, ms] = await timed(() => embedQuery(query));
  // 2. 保存済みのベクトルを DB から読む（本の側は Embedding し直さない）
  const rows = withDb(db.allBooks);
  // 3. 全冊と類似度を計算して並べ、上位だけを返す
  const results = rankBooks(vector, rows, SEARCH_LIMIT);
  results.forEach((r, i) => console.log(`[Search] ${i + 1}. ${r.similarity.toFixed(4)}  ${r.title}`));

  return c.json({
    results,
    trace: {
      request: { query },
      embedding: { input: `query: ${query}`, dimension: vector.length, vector_head: head(vector), ms },
      database: {
        sql: "SELECT id, title, description, embedding FROM books;",
        rows: rows.length,
        reembedded: 0,
      },
      ranking: { compared: rows.length, limit: SEARCH_LIMIT },
    },
  });
});

app.get("/api/books", (c) => {
  const { rows, sql, total } = withDb((conn) => ({ ...db.keywordSearch(conn, c.req.query("q") ?? ""), total: db.countBooks(conn) }));
  return c.json({ books: rows.map(bookSummary), sql, total });
});

app.get("/api/books/:id", (c) => {
  const row = withDb((conn) => db.getBook(conn, Number(c.req.param("id"))));
  if (!row) return c.json({ detail: "本が見つかりません" }, 404);
  const vector = db.blobToVector(row.embedding);
  return c.json({
    ...bookSummary(row),
    model: row.model,
    dtype: "float32",
    bytes: row.embedding.byteLength,
    norm: Math.round(Math.sqrt(vector.reduce((s, v) => s + v * v, 0)) * 10000) / 10000,
    vector: head(vector, vector.length),
  });
});

app.post("/api/books", async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const title = text(body.title, 200);
  const description = text(body.description, 2000);
  if (title === null || description === null) return c.json({ detail: "タイトルと説明を入力してください" }, 422);
  if (withDb((conn) => db.findByTitle(conn, title))) {
    return c.json({ detail: "同じタイトルの本がすでにあります" }, 409);
  }

  // データ登録のときだけ、本の説明を Embedding する
  const passage = db.passageText(title, description);
  const [vector, ms] = await timed(() => embedPassage(passage));
  const id = withDb((conn) => db.insertBook(conn, title, description, MODEL_ID, vector));

  return c.json(
    {
      id,
      trace: {
        embedding: {
          input: `passage: ${passage}`,
          dimension: vector.length,
          vector_head: head(vector),
          bytes: vector.byteLength,
          ms,
        },
        database: { sql: "INSERT INTO books (title, description, model, embedding) VALUES (?, ?, ?, ?);" },
      },
    },
    201,
  );
});

app.delete("/api/books/:id", (c) => {
  const deleted = withDb((conn) => db.deleteBook(conn, Number(c.req.param("id"))));
  if (!deleted) return c.json({ detail: "本が見つかりません" }, 404);
  return c.body(null, 204);
});

// 画面（frontend/）のファイルをそのまま返す
app.use("/*", serveStatic({ root: path.relative(process.cwd(), FRONTEND_DIR) }));

// 最初の検索で待たないよう、起動前にモデルをメモリへ読み込んでおく
await getModel();
if (withDb(db.countBooks) === 0) {
  console.log("[DB] books が空です。`npm run build-index` で登録してください。");
}

// 127.0.0.1 だけで待ち受ける（同じネットワークの他の機器からは開けない）
serve({ fetch: app.fetch, hostname: "127.0.0.1", port: PORT }, () => {
  console.log(`Local Semantic Search: http://localhost:${PORT}`);
});
