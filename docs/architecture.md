# 仕組みと構成

最終更新: 2026-10-08

## 使っている技術

| 役割 | 技術 | バージョン（2026-10-08 時点） | 一言 |
|---|---|---|---|
| 実行環境 | Node.js | 26.5（24 以上が必要） | `.ts` をビルドせずに実行できる。SQLite も標準で入っている |
| 言語 | TypeScript | 7.0 | サーバーも画面もすべて TypeScript |
| Web サーバー | Hono + @hono/node-server | 4.13 / 2.1 | 小さな Web フレームワーク。API と画面のファイルを返す |
| Embedding の実行 | @huggingface/transformers（transformers.js） | 4.3 | Hugging Face のモデルを JavaScript から動かすライブラリ。内部で ONNX Runtime（モデル実行エンジン）を CPU で使う |
| Embedding モデル | `Xenova/multilingual-e5-base`（8bit 量子化版） | — | 日本語対応、768 次元。元は `intfloat/multilingual-e5-base`（MIT） |
| データベース | SQLite（`node:sqlite`） | Node 同梱 | 1ファイル `data/books.db` に保存 |
| 画面 | 素の HTML + CSS + TypeScript | — | React などは使っていない |

外部の AI API・API キー・`.env` は一切ない。秘密情報も無い。

## 全体の流れ

```text
ブラウザ（frontend/）
  │ ① fetch("/api/search", {query})
  ▼
Web サーバー（backend/server.ts）
  │ ② embedQuery(query)
  ▼
Embedding モデル（backend/embedder.ts → transformers.js → models/ の ONNX ファイル）
  │ ③ Float32Array(768)
  ▼
Web サーバー
  │ ④ allBooks() で全冊のベクトルを読む
  ▼
SQLite（backend/db.ts → data/books.db）
  │ ⑤ 各行の embedding（BLOB）
  ▼
類似度計算（backend/search.ts の dot()）→ 降順に並べ替え
  │ ⑥ JSON {results, trace}
  ▼
ブラウザが結果と「処理の記録」を描く
```

- **データ登録**（`npm run build-index` または登録画面）: 本の文章 → Embedding → DB に保存。本1冊につき1回だけ
- **検索**（検索画面）: 検索文 → Embedding → 保存済みベクトルと比べる。Embedding するのは検索文1件だけ
- 検索文のベクトルは DB に保存しない（その場で使って捨てる）

## 主要ファイルの役割

| ファイル | 役割 | 入力 → 出力 |
|---|---|---|
| `backend/config.ts` | モデル名・精度（q8）・パス・ポート番号（8000） | — |
| `backend/embedder.ts` | モデルを読み込み、文章をベクトルにする。`embedQuery`（`query: ` を付ける）と `embedPassage`（`passage: ` を付ける）。ターミナルに `[Embedding]` ログを出す | 文字列 → `Float32Array`（768） |
| `backend/db.ts` | テーブル作成、保存・取得・削除、`LIKE` による文字検索。ベクトルと BLOB の相互変換 | — |
| `backend/search.ts` | 内積（= コサイン類似度）を for ループで計算し、類似度順に並べる | 検索ベクトル + 全行 → 結果一覧 |
| `backend/server.ts` | API の定義、`frontend/` の配信、起動時のモデル読み込み | HTTP → JSON |
| `frontend/index.html` / `style.css` | 3画面の骨組みと見た目（Apple 風） | — |
| `frontend/src/app.ts` | API を呼んで画面を描く。`npm run build` で `frontend/dist/app.js` になる | — |
| `scripts/download-model.ts` | モデルを `models/` にダウンロード。**ネットを使うのはこれだけ** | — |
| `scripts/build-index.ts` | `data/books.json` を DB に反映。内容もモデルも同じ本は飛ばす | — |
| `scripts/try-embedding.ts` / `search-cli.ts` | ブラウザなしでの動作確認用 | — |

## データベース

```sql
CREATE TABLE books (
  id          INTEGER PRIMARY KEY,
  title       TEXT NOT NULL UNIQUE,   -- 同じタイトルは登録できない（登録画面で 409 になる）
  description TEXT NOT NULL,
  model       TEXT NOT NULL,          -- 例: Xenova/multilingual-e5-base:q8
  embedding   BLOB NOT NULL           -- Float32 × 768 = 3,072 バイト
);
```

- `embedding` は Float32Array のバイト列をそのまま入れている（JSON 文字列にはしていない）
- `model` 列は、どのモデルで作ったベクトルかの記録。モデルが違うとベクトルの意味が変わり比べられないので、
  `build-index` はモデルが変わった本を作り直す

## API

| メソッド | パス | 内容 |
|---|---|---|
| `GET` | `/api/status` | モデル名・精度・実行場所（cpu）・オフラインかどうか |
| `POST` | `/api/search` | `{"query"}` → `{"results", "trace"}`。空文字は 422 |
| `GET` | `/api/books?q=` | 一覧。`q` があれば `LIKE` で絞り込み。表示用の SQL 文と総数も返す |
| `GET` | `/api/books/:id` | 1冊の詳細とベクトル全体 |
| `POST` | `/api/books` | `{"title", "description"}` を Embedding して登録。重複タイトルは 409 |
| `DELETE` | `/api/books/:id` | 削除。無い id は 404 |

## 設計判断（あとで不思議に思いそうなこと）

- **類似度を DB の中ではなく TypeScript の for ループで計算している**: 学習用なので、計算式がコードで見えることを優先した。
  pgvector や sqlite-vec を使うと計算が DB の中に隠れる。本が数冊〜数千冊なら全件比較でも一瞬で終わる
- **8bit 量子化版（q8）を使っている**: fp32 版（約 1.1GB）の 1/4（約 280MB）。Python の fp32 版と比べて、検索の順位は同じだった
- **e5 の接頭辞 `query: ` / `passage: `**: このモデルはそう学習されているので付けないと精度が落ちる
- **類似度のバーを結果の最小〜最大に引き伸ばしている**: e5 は関係の薄い文どうしでも 0.7〜0.8 になるので、
  0〜1 の目盛りだと全部同じ長さに見える。表示する数値は加工していない
- **データベース画面の検索は Embedding を使わない `LIKE` 検索**: 意味検索との違いを比べられるように、あえて分けている
- **画面に表示する SQL と実際に実行する SQL は別物**: 実行はプレースホルダ（`?`）で値を渡す。表示用だけ値を埋め込んでいる
- **サーバーは 127.0.0.1 でだけ待ち受ける**: 同じ Wi-Fi の他の機器からは開けない
- **画面の文字は `textContent` で入れている**: 登録した本の説明に HTML を書かれても実行されない
