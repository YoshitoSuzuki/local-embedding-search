# CLAUDE.md

Embedding の仕組みを学ぶためのローカル意味検索のプロトタイプ。仕様は `docs/spec.md`、使い方は `README.md`、仕組み・経緯・確認手順は `docs/`。

## 構成の要点

- すべて TypeScript。サーバー側（`backend/`, `scripts/`）は Node.js 24+ が `.ts` をそのまま実行する（ビルドなし）。
  型を消すだけで動く書き方（enum・namespace などを使わない、import に `.ts` を付ける）に限る
- 画面側だけ `frontend/src/app.ts` → `frontend/dist/app.js` に tsc で変換する（`npm run build`）
- Embedding は transformers.js でローカル実行。`allowRemoteModels` を true にするのは `scripts/download-model.ts` だけ
- 外部の AI API・API キーを使う変更はしない（spec の必須条件）
- 公開リポジトリにする前提。絶対パス・個人情報・モデル本体・DB ファイルをコミットしない

## ブランチ運用（Git-flow）

- `main` / `develop` を長期ブランチにし、作業は `develop` から `<type>/<short-kebab-case>` を切る
  （type: feature / fix / hotfix / chore / refactor / docs / test）
- 作業ブランチ → `develop` に squash merge。`develop` で動作確認してから、ユーザーに確認して `main` へ
- リリース時は `main` と同じ内容で `release/v.x.y.z` を作って残す
- コミットメッセージは英語小文字の短文
