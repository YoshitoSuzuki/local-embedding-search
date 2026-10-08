# 環境構築と起動

最終更新: 2026-10-08

## 必要なもの

- macOS（Apple Silicon で確認。CPU で動くので Intel Mac でもおそらく動く）
- **Node.js 24 以上**（2026-10-08 時点では 26.5 で確認）
  - 24 未満だと `.ts` をそのまま実行できず、`node:sqlite` も無いので動かない
- ディスク: モデル約 290MB + `node_modules` 約 500MB

Python は不要（以前の Python 版の名残はない）。

## 新しい Mac でのセットアップ

1. Node.js を入れる（入っていれば飛ばす）

   ```bash
   brew install node
   node --version
   ```

   → `v24.x` 以上が出れば OK

2. リポジトリを取得してパッケージを入れる

   ```bash
   cd ~/root/personal/project
   git clone https://github.com/YoshitoSuzuki/local-embedding-search.git
   cd local-embedding-search
   npm install
   ```

   → `node_modules/` ができる

3. モデルをダウンロードする（**インターネットを使うのはここだけ**）

   ```bash
   npm run download-model
   ```

   → `保存しました: models/Xenova/multilingual-e5-base` と出て、
   `models/Xenova/multilingual-e5-base/onnx/model_quantized.onnx`（約 280MB）ができる

4. サンプルの本を DB に登録する

   ```bash
   npm run build-index
   ```

   → `[insert]` が5行出て、最後に `追加 5 / 更新 0 / 再利用 0 → data/books.db`。
   もう一度実行すると `追加 0 / 更新 0 / 再利用 5` になる（Embedding し直さない）

## 起動

```bash
cd ~/root/personal/project/local-embedding-search
npm start
```

→ 画面側の TypeScript がビルドされ（`frontend/dist/app.js`）、モデルを読み込んでから
`Local Semantic Search: http://localhost:8000` と出る。ブラウザで <http://localhost:8000> を開く。

止めるときはターミナルで `Ctrl + C`。

## コマンド一覧

| コマンド | 内容 |
|---|---|
| `npm start` | 画面をビルドしてサーバーを起動 |
| `npm run build` | `frontend/src/app.ts` → `frontend/dist/app.js` だけ実行 |
| `npm run typecheck` | サーバー側（`tsconfig.json`）と画面側（`frontend/tsconfig.json`）の型チェック |
| `npm run download-model` | モデルのダウンロード |
| `npm run build-index` | `data/books.json` を DB に反映 |
| `npm run try-embedding -- "文章"` | 1文をベクトルにしてターミナルに出す |
| `npm run search -- "検索文"` | ターミナルで検索する |

## TypeScript の設定が2つある理由

- `tsconfig.json`（ルート）: `backend/` と `scripts/` 用。Node が `.ts` を直接実行するので、型チェックだけ行い JS は出さない（`noEmit`）。
  Node は「型を消すだけ」で実行するため、`enum` など型を消すだけでは動かない書き方を禁止している（`erasableSyntaxOnly`）。
  import には `.ts` の拡張子を付ける
- `frontend/tsconfig.json`: ブラウザは `.ts` を読めないので、`frontend/src/` を `frontend/dist/` に JS として出力する

## よくあるエラー

| 症状 | 原因と対処 |
|---|---|
| `モデルを読み込めません（…）。先に npm run download-model を実行してください。` | `models/` にモデルが無い。`npm run download-model` を実行する |
| 起動時に `[DB] books が空です。` と出る | DB に本が無い。`npm run build-index` を実行する（登録画面から追加してもよい） |
| `EADDRINUSE: address already in use 127.0.0.1:8000` | 前に起動したサーバーが残っている。`pkill -f "node backend/server.ts"` で止めてから起動し直す |
| `ERR_UNKNOWN_FILE_EXTENSION ".ts"` / `No such built-in module: node:sqlite` | Node.js が古い。24 以上にする |
| 画面を直したのに変わらない | `frontend/src/app.ts` を直したら `npm run build`（`npm start` し直しでもよい）。ブラウザは再読み込み |

## リセットしたいとき

DB は生成物なので、消して作り直してよい（登録画面で足した本も消える）。

```bash
rm data/books.db
npm run build-index
```
