# local-embedding-search

外部の AI API を一切使わず、**自分の PC の中だけで動く「意味で探す」検索サービス**のプロトタイプです。
Embedding の仕組みを手を動かして理解するために作りました（画面上の名前は「Local Semantic Search」）。

本の説明文をあらかじめ Embedding（文章 → 数値ベクトル）しておき、ブラウザで入力した検索文も同じモデルで
ベクトルにして、ベクトルどうしの近さ（コサイン類似度）で本を並べます。
「魔法学校が舞台のファンタジー」と入れると、文字が一致していなくても『ハリー・ポッター』のシリーズが上位に並びます。
サンプルとして、小説・漫画・ノンフィクション・科学・プログラミングなど 352 冊を入れてあります。

- 言語: TypeScript（サーバーも画面も）
- Embedding モデル: `multilingual-e5-base`（ONNX 版）を **Node.js の中で直接実行**
- データベース: SQLite（Node.js 標準の `node:sqlite`）
- API キー不要。モデルをダウンロードしたあとはオフラインで動きます

仕様書・設計判断・動作確認の手順・開発の経緯は [docs/](docs/) にあります（仕様書は [docs/spec.md](docs/spec.md)）。

## システム構成

```text
Browser（frontend/）
  │  POST /api/search {"query": "..."}
  ▼
Web Server（backend/server.ts, Hono）
  │  "query: ..." を渡す
  ▼
Local Embedding Model（backend/embedder.ts, transformers.js + ONNX Runtime）
  │  768 次元のベクトルが返る
  ▼
Vector Database（data/books.db, SQLite）
  │  保存済みの全冊のベクトルを読み、内積で類似度を計算（backend/search.ts）
  ▼
Browser に類似度の高い順の上位 10 件を JSON で返す
```

外部 API 方式との違いは、矢印の途中に **インターネットが一度も出てこない**ことです。

```text
外部API方式:   Browser → 自分のServer → (インターネット) → Embedding API → ベクトル
ローカル方式:  Browser → 自分のServer → Local Embedding Model（同じPCのメモリ上） → ベクトル
```

## 画面

| 画面 | できること |
|---|---|
| 検索 | 検索文で意味検索。右側の「処理の記録」に、リクエスト・Embedding の入出力・DB から読んだ行数・類似度の式を表示 |
| 登録 | 本を1冊登録。モデルに渡す文字列（`passage: ...`）と、生成されたベクトル・実行した SQL を表示 |
| データベース | `books` テーブルの中身を表示。文字の一致検索（`LIKE`）で絞り込み、各行のベクトル 768 個をすべて見られる。削除も可 |

データベース画面の検索は Embedding を使わない普通の文字検索です。検索画面の意味検索と比べると違いが分かります
（例: 「数学」で探すと、データベース画面では「数学」を含む本だけ、検索画面では意味が近い順に上位 10 件が並ぶ）。

## セットアップ（新しい Mac で）

必要なもの: **Node.js 24 以上**（TypeScript をビルドせずにそのまま実行する機能と `node:sqlite` を使うため）

```bash
# Node.js が無ければ（Homebrew の場合）
brew install node
node --version   # v24 以上であること

# 取得してパッケージを入れる
git clone <このリポジトリのURL> local-embedding-search
cd local-embedding-search
npm install

# 1. モデルをダウンロード（約 290MB。インターネットを使うのはここだけ）
npm run download-model

# 2. サンプルの本 352 冊を Embedding して data/books.db に保存（数秒で終わる）
npm run build-index
```

## 起動

```bash
npm start
```

ブラウザで <http://localhost:8000> を開きます。終了はターミナルで `Ctrl + C`。

サーバーは `127.0.0.1` でだけ待ち受けるので、同じネットワークの他の機器からは開けません。

### そのほかのコマンド

| コマンド | 内容 |
|---|---|
| `npm run try-embedding -- "好きな文章"` | モデル単体で文章をベクトルにして表示（Step 2） |
| `npm run search -- "検索文"` | ブラウザなしでターミナルから検索（Step 4） |
| `npm run build-index` | `data/books.json` を DB に反映。内容が変わった本だけ Embedding し直す |
| `npm run typecheck` | サーバーと画面の型チェック |
| `npm run build` | `frontend/src/app.ts` → `frontend/dist/app.js` に変換（`npm start` でも自動で行う） |

## ディレクトリ構成

```text
local-embedding-search/
├── backend/            サーバー側（Node.js がこの .ts をそのまま実行する）
│   ├── config.ts       モデル名・パスなどの設定
│   ├── embedder.ts     文章 → ベクトル（ローカルのモデルを実行）
│   ├── db.ts           SQLite への保存・読み出し・文字検索
│   ├── search.ts       コサイン類似度の計算と並べ替え
│   └── server.ts       Web サーバーと API（Hono）
├── frontend/           ブラウザ側
│   ├── index.html
│   ├── style.css
│   └── src/app.ts      API を呼んで画面を描く（ビルドして dist/app.js になる）
├── scripts/            ターミナルから動かす処理
│   ├── download-model.ts
│   ├── try-embedding.ts
│   ├── build-index.ts  データ登録（Embedding して DB に保存）
│   └── search-cli.ts   ブラウザなしの検索
├── data/
│   ├── books.json      サンプルの本 352 冊（登録元）
│   └── books.db        生成される SQLite（git には入れない）
└── models/             ダウンロードしたモデル（git には入れない）
```

spec の例との違い: TypeScript のサーバーは `.ts` をそのまま実行でき、画面側だけビルドが要るので、
`frontend/src`（書くもの）と `frontend/dist`（生成物）を分けています。

## 使用モデル

| 項目 | 内容 |
|---|---|
| モデル | [`Xenova/multilingual-e5-base`](https://huggingface.co/Xenova/multilingual-e5-base)（[`intfloat/multilingual-e5-base`](https://huggingface.co/intfloat/multilingual-e5-base) を ONNX 形式に変換したもの） |
| 提供元 | Microsoft の研究者による E5 シリーズ（intfloat）。ONNX 変換は Hugging Face の Xenova |
| ライセンス | 変換元の `intfloat/multilingual-e5-base` は MIT。変換版の `Xenova/multilingual-e5-base` のページにはライセンスの記載がない（重みは変換元と同じもの） |
| 次元数 | 768 |
| 使っている重み | `onnx/model_quantized.onnx`（8bit 量子化、約 280MB） |
| 実行ライブラリ | [transformers.js](https://github.com/huggingface/transformers.js)（内部で ONNX Runtime を CPU で実行） |

選んだ理由:

- 日本語を含む約 100 言語に対応し、検索用途（文章どうしの近さを測る）に学習されている
- ONNX 版があり、Python なしで Node.js から直接動かせる
- 8bit 量子化版は fp32 版（約 1.1GB）の 1/4 の大きさで、検索順位は同じだった
- 元のモデルが MIT ライセンスで、利用条件を確認できる

## 検索の仕組み

### 1. Embedding とは

文章を、意味の特徴を表す数の並び（ベクトル）に変えることです。このモデルでは、どんな長さの文章も
**768 個の小数**になります。意味の近い文章ほど、ベクトルの向きが近くなるように学習されています。

```text
"query: 数学が得意な人が出てくるミステリー"
   ↓ multilingual-e5-base
[0.0161, 0.0360, -0.0321, 0.0037, ... 768個]
```

e5 は、**検索文には `query: `、検索される文書には `passage: `** を先頭に付ける決まりで学習されています
（`backend/embedder.ts` の `embedQuery` / `embedPassage`）。

### 2. データ登録（事前に1回だけ）

```text
本のタイトル + 説明
  ↓ "passage: 容疑者Xの献身\n天才数学者が…"
Embedding モデル
  ↓ Float32Array（768 個）
SQLite の BLOB 列に保存（768 × 4 バイト = 3,072 バイト）
```

`npm run build-index` を2回実行すると、2回目は全冊「再利用」になります。
本の説明もモデルも変わっていなければ、Embedding し直しません。どのモデルで作ったベクトルかは `model` 列に残しています
（モデルが違うとベクトルの意味が変わり、比べられなくなるため）。

### 3. 検索（ボタンを押すたびに）

```text
検索文 → Embedding（検索文の1件だけ） → DB の全冊のベクトルと比べる → 類似度順に上位 10 件を返す
```

本の側は保存済みのベクトルを読むだけで、**検索のたびに Embedding するのは検索文1件だけ**です。

### 4. コサイン類似度

2本のベクトルの向きがどれだけ近いかを −1〜1 で表す値です。

```text
cos(a, b) = (a · b) / (|a| × |b|)
```

Embedding のときに `normalize: true` で長さを 1 にそろえているので、`|a| = |b| = 1` となり、
**内積 `a · b`（768 個の掛け算の合計）がそのままコサイン類似度**になります（`backend/search.ts` の `dot`）。
ライブラリには頼らず、for ループで計算しています。

e5 系のモデルは、関係の薄い文章どうしでも 0.7〜0.8 くらいの値になる性質があります。
そのため、画面のバーは「今回の結果の最小〜最大」に引き伸ばして描いています（数値は計算結果そのまま）。

### 5. 検索ボタンを押してから結果が出るまで

| # | どこで | 何をする | 入力 → 出力 |
|---|---|---|---|
| 1 | ブラウザ（`frontend/src/app.ts`） | 検索文を JSON にして送る | 入力欄の文字 → `POST /api/search {"query": "..."}` |
| 2 | サーバー（`backend/server.ts`） | リクエストを受け、検索文を取り出す | HTTP リクエスト → 文字列 |
| 3 | Embedding モデル（`backend/embedder.ts`） | `query: ` を付けてモデルに通し、平均して長さ1にする | 文字列 → `Float32Array`（768 個）。この PC の CPU で十数ミリ秒 |
| 4 | データベース（`backend/db.ts`） | `SELECT … FROM books` で全冊を読む | → 各行のタイトル・説明・ベクトル（BLOB） |
| 5 | サーバー（`backend/search.ts`） | 各冊と内積を取り、大きい順に並べる | ベクトル × 冊数 → 類似度つきの一覧 |
| 6 | サーバー → ブラウザ | 結果と「処理の記録」を JSON で返す | → `{"results": [...], "trace": {...}}` |
| 7 | ブラウザ | 結果の一覧とバー、処理の記録を描く | JSON → 画面 |

新しく生成されるデータは、手順 3 の **検索文のベクトル**だけです（DB には保存しません）。
DB に保存されるのは、データ登録のときに作った本のベクトルです。

サーバーのターミナルには、Embedding のたびに次のようなログが出ます。

```text
[Embedding]
Input:
query: 数学が得意な人が出てくるミステリー

Model:
Xenova/multilingual-e5-base (q8, local: models/Xenova/multilingual-e5-base)

Vector dimension:
768

Vector head:
[0.0161, 0.0360, -0.0321, 0.0037, ...]

Embedding generated successfully.
```

## API

| メソッド | パス | 内容 |
|---|---|---|
| `POST` | `/api/search` | `{"query": "..."}` で意味検索。`results` と処理の記録 `trace` を返す |
| `GET` | `/api/books?q=...` | 本の一覧（`q` があれば `LIKE` で絞り込み） |
| `GET` | `/api/books/:id` | 1冊の詳細とベクトル 768 個 |
| `POST` | `/api/books` | `{"title": "...", "description": "..."}` を Embedding して登録 |
| `DELETE` | `/api/books/:id` | 1冊削除 |
| `GET` | `/api/status` | 使っているモデルとオフラインかどうか |

## オフラインで動くことの確かめ方

`backend/embedder.ts` は、モデル取得用のスクリプト以外では `env.allowRemoteModels = false` にしていて、
`models/` にあるファイルしか読みません。Wi-Fi を切ってから `npm start` し、検索・登録ができることを確かめられます。
