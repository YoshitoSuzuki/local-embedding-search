// ローカルの Embedding モデルを動かす部分。
//
// 入力: 文章（string）
// 出力: ベクトル（Float32Array, 768 次元）
//
// multilingual-e5 は「検索文」と「検索される文書」で先頭に付ける文字を変える決まりがある。
//   検索文 → "query: ..."
//   文書側 → "passage: ..."
// 同じモデルでも、こう区別して学習されているため、付けたほうが検索精度が上がる。

import { env, pipeline, type FeatureExtractionPipeline } from "@huggingface/transformers";

import { MODEL_DTYPE, MODEL_NAME, MODELS_DIR } from "./config.ts";

env.localModelPath = MODELS_DIR;
env.cacheDir = MODELS_DIR;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

// allowRemote = true にするのは scripts/download-model.ts だけ。
// それ以外では models/ にあるファイルしか読まず、Hugging Face へ通信しない
export function getModel(allowRemote = false): Promise<FeatureExtractionPipeline> {
  env.allowRemoteModels = allowRemote;
  extractor ??= pipeline("feature-extraction", MODEL_NAME, { dtype: MODEL_DTYPE }).catch((err) => {
    extractor = null;
    throw new Error(
      `モデルを読み込めません（${err.message}）。先に \`npm run download-model\` を実行してください。`,
    );
  });
  return extractor;
}

export function isOffline(): boolean {
  return !env.allowRemoteModels;
}

async function embed(text: string, prefix: string, log: boolean): Promise<Float32Array> {
  const model = await getModel();
  // pooling: "mean" … 単語ごとのベクトルを平均して文章1つ分のベクトルにする（e5 の決まり）
  // normalize: true … 長さ1にそろえる（類似度の計算が内積だけで済む）
  const output = await model(prefix + text, { pooling: "mean", normalize: true });
  const vector = Float32Array.from(output.data as Float32Array);
  if (log) {
    const head = Array.from(vector.slice(0, 4), (v) => v.toFixed(4)).join(", ");
    console.log(
      [
        "[Embedding]",
        `Input:\n${prefix}${text}\n`,
        `Model:\n${MODEL_NAME} (${MODEL_DTYPE}, local: models/${MODEL_NAME})\n`,
        `Vector dimension:\n${vector.length}\n`,
        `Vector head:\n[${head}, ...]\n`,
        "Embedding generated successfully.\n",
      ].join("\n"),
    );
  }
  return vector;
}

// ユーザーの検索文をベクトルにする（検索のたびに呼ばれる）
export function embedQuery(text: string, log = true): Promise<Float32Array> {
  return embed(text, "query: ", log);
}

// 登録データ（本の説明）をベクトルにする（データ登録時にだけ呼ばれる）
export function embedPassage(text: string, log = true): Promise<Float32Array> {
  return embed(text, "passage: ", log);
}
