#!/usr/bin/env node
// public/index.json の全食品名から埋め込みベクトルを事前計算し、
// public/embeddings/ に静的ファイルとして書き出す。
//
// モデル: cl-nagoya/ruri-v3-30m（Apache-2.0, 日本語特化, 37Mパラメータ, dim=256）
//   JMTEB平均で intfloat/multilingual-e5-small（118Mパラメータ）を上回る、
//   小型・日本語に強いオープンソース埋め込みモデル。
// ブラウザ側（public/search.html）でも同じモデル・同じ前処理（プレフィックス/プーリング/正規化）で
// クエリを埋め込み、ここで生成したベクトルとの内積（コサイン類似度）で意味検索を行う。
//
// 実行: npm run generate-embeddings

import { pipeline } from '@huggingface/transformers';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const INDEX_PATH = path.join(ROOT, 'public', 'index.json');
const OUT_DIR = path.join(ROOT, 'public', 'embeddings');
const OUT_BASENAME = 'ruri-v3-30m';

// sirasagi62/ruri-v3-30m-ONNX は cl-nagoya/ruri-v3-30m の完全なブラウザ向けミラー
// （tokenizer一式 + 量子化ONNXを同梱）。公式の onnx-community/ruri-v3-30m-ONNX は
// tokenizerファイルを含んでおらずブラウザ単体では動かないため、こちらを使用する。
const BASE_MODEL = 'cl-nagoya/ruri-v3-30m';
const ONNX_MODEL = 'sirasagi62/ruri-v3-30m-ONNX';
const DTYPE = 'q8'; // 量子化ONNX（約37MB）。ブラウザでのダウンロードサイズを抑える
const DIM = 256;
const BATCH_SIZE = 64;

// Ruri v3の「1+3プレフィックス方式」のうち検索（retrieval）用の2種類を使う。
const PASSAGE_PREFIX = '検索文書: '; // 索引対象（食品名）側
const QUERY_PREFIX = '検索クエリ: '; // 検索語（ユーザー入力)側 ※search.html側で使用する定数と一致させること

async function main() {
  const foods = JSON.parse(await readFile(INDEX_PATH, 'utf8'));
  console.log(`loaded ${foods.length} foods from index.json`);

  console.log(`loading embedding model ${ONNX_MODEL} (dtype=${DTYPE})...`);
  const extractor = await pipeline('feature-extraction', ONNX_MODEL, { dtype: DTYPE });

  const vectors = new Float32Array(foods.length * DIM);
  const codes = new Array(foods.length);

  for (let start = 0; start < foods.length; start += BATCH_SIZE) {
    const batch = foods.slice(start, start + BATCH_SIZE);
    const texts = batch.map((f) => PASSAGE_PREFIX + f.name);
    const output = await extractor(texts, { pooling: 'mean', normalize: true });
    const data = output.tolist();
    for (let i = 0; i < batch.length; i++) {
      codes[start + i] = batch[i].code;
      vectors.set(data[i], (start + i) * DIM);
    }
    const done = Math.min(start + BATCH_SIZE, foods.length);
    process.stdout.write(`\rembedded ${done}/${foods.length}`);
  }
  console.log();

  await mkdir(OUT_DIR, { recursive: true });

  const binPath = path.join(OUT_DIR, `${OUT_BASENAME}.f32`);
  await writeFile(binPath, Buffer.from(vectors.buffer, vectors.byteOffset, vectors.byteLength));

  const codesPath = path.join(OUT_DIR, `${OUT_BASENAME}.codes.json`);
  await writeFile(codesPath, JSON.stringify(codes));

  let transformersJsVersion = null;
  try {
    const pkg = JSON.parse(
      await readFile(path.join(ROOT, 'node_modules', '@huggingface', 'transformers', 'package.json'), 'utf8')
    );
    transformersJsVersion = pkg.version;
  } catch {
    // バージョン取得に失敗しても致命的ではないので無視する
  }

  const meta = {
    model: BASE_MODEL,
    onnxRepo: ONNX_MODEL,
    dtype: DTYPE,
    dim: DIM,
    count: foods.length,
    pooling: 'mean',
    normalized: true,
    similarity: 'dot', // ベクトルはL2正規化済みなので内積 = コサイン類似度
    prefixes: { passage: PASSAGE_PREFIX, query: QUERY_PREFIX },
    sourceField: 'name',
    format:
      'float32 little-endian, row-major, shape [count, dim]. 行の並びは同ディレクトリの {basename}.codes.json と対応する。',
    transformersJsVersion,
    generatedAt: new Date().toISOString(),
    generatorScript: 'scripts/generate_embeddings.mjs',
  };
  const metaPath = path.join(OUT_DIR, `${OUT_BASENAME}.meta.json`);
  await writeFile(metaPath, JSON.stringify(meta, null, 2));

  console.log(`wrote ${binPath} (${vectors.byteLength} bytes)`);
  console.log(`wrote ${codesPath}`);
  console.log(`wrote ${metaPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
