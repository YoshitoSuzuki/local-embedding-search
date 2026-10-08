# 開発の経緯

## 2026-10-08 最初の版を作成（1日で）

1. **仕様書（[spec.md](spec.md)）を書いた**。目的は「Embedding の仕組みを理解すること」で、外部 AI API の禁止、
   ローカル実行、データ登録と検索の分離、処理が見えることを必須にした
2. **Python で Step 1〜2**: FastAPI + sentence-transformers + `intfloat/multilingual-e5-base`（fp32）を選び、
   Apple Silicon の GPU（mps）で 768 次元のベクトルが出ることを確認した
3. **公開できる形に整えた**: GitHub に public で上げる前提にしたので、モデル本体・DB・仮想環境を `.gitignore` に入れ、
   絶対パスや個人情報をコードに書かないようにした。ディレクトリ名を `local-embedding` → `local-semantic-search` に変えた
4. **画面のデザイン案を作った**（Claude の Design キャンバス）。検索・登録・データベースの3画面。
   要望で、データベース画面に文字検索を付け、見た目を Apple 風（淡いグレーの背景、白い角丸のカード、青いボタン）にした
5. **Python で Step 3〜7 まで実装**して API が動くところまで確認した（コミット `c5f6b0f` に残っている）
6. **TypeScript で作り直した**（要望による）。Python は一切使わない構成にした
   - Embedding: transformers.js で同じ e5 の ONNX 版を Node.js から実行
   - DB: Node 標準の `node:sqlite`
   - サーバー: Hono。Node 26 が `.ts` をそのまま実行できるので、ビルドは画面側だけ
   - モデルは 8bit 量子化版（約 280MB）。Python の fp32 版と検索順位が同じことを確かめて採用した
   - ベクトルを作ったモデルを記録する `model` 列を足した
7. **類似度のバーを結果の最小〜最大に引き伸ばす**ことにした。e5 は値が 0.7〜0.9 に集まり、
   0〜1 の目盛りだと全部同じ長さに見えるため（要望で決定）
8. **名前を `local-embedding-search` に決めた**。「Embedding についてのものだと分かる名前」という要望による。
   画面のタイトルは spec の画面案どおり「Local Semantic Search」のまま
9. Python 版の名残（`.venv/`、sentence-transformers 用のモデル）を削除し、docs/ を作って spec.md を移した
