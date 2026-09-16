# 食品成分表示API

文部科学省「日本食品標準成分表（八訂）増補2023年」の公開Excelデータ（`data/`）を、
Cloudflare Pagesで配信する静的JSON API（`public/`）にビルドするプロジェクト。

詳細な設計背景は [idea.md](idea.md) と `.claude/plans/` を参照。

## 構成

```
data/                元データ（文科省配布のExcel、11ファイル）
scripts/build_dataset.py       data/ を public/ にビルドするスクリプト
scripts/generate_embeddings.mjs  public/index.json から意味検索用の埋め込みベクトルを生成するスクリプト
public/               Cloudflare Pagesで配信する静的ファイル一式（ビルド生成物 + 検索UI）
  index.json          全食品の {code, index_no, group, group_name, name} 一覧
  data/{食品番号}.json  1食品ごとの成分データ
  metadata.json        識別子辞書・食品群コード表・値注記の凡例
  llms.txt             LLM/エージェント向けの使い方ガイド
  embeddings/          意味検索（ベクトル検索）用の事前計算済みベクトル（ビルド生成物）
  search.html           キーワード検索＋意味検索のUI（手書き、ビルド対象外）
  index.html            ドキュメントページ（手書き、ビルド対象外）
  _headers             Cloudflare Pages用のCORS/Content-Type設定
```

## ビルド

```sh
python3 scripts/build_dataset.py
```

`openpyxl` が必要（`pip install openpyxl`）。実行するたびに `public/index.json` /
`public/data/*.json` / `public/metadata.json` / `public/llms.txt` を作り直す（冪等）。

## 意味検索（ベクトル検索）用ベクトルの生成

`public/search.html` のキーワード検索は、完全一致・部分一致しない語（例:「パスタ」で「マカロニ・スパゲッティ」、
「ワイン」で「ぶどう酒」）も拾えるよう、埋め込みベクトルによる意味検索を併用している。

```sh
npm install
npm run generate-embeddings
```

- モデル: [cl-nagoya/ruri-v3-30m](https://huggingface.co/cl-nagoya/ruri-v3-30m)（Apache-2.0、日本語特化、37Mパラメータ、dim=256）。
  小型ながらJMTEB平均で `intfloat/multilingual-e5-small`（118Mパラメータ）を上回る、日本語の意味検索に強いオープンソースモデル。
- ブラウザ側では [sirasagi62/ruri-v3-30m-ONNX](https://huggingface.co/sirasagi62/ruri-v3-30m-ONNX)（tokenizer一式込みのONNXミラー、
  q8量子化で約37MB）を [@huggingface/transformers](https://www.npmjs.com/package/@huggingface/transformers)（transformers.js）経由でHugging Face Hub /
  jsDelivrから読み込み、同じ前処理でクエリを埋め込んで比較する。モデル本体はサイズがCloudflare Pagesの1ファイル25MiB上限を超えるため
  リポジトリには含めず、初回検索時にブラウザがCDNから取得・キャッシュする。
- `npm run generate-embeddings` が書き出すのは `public/embeddings/ruri-v3-30m.{f32,codes.json,meta.json}` の3ファイルのみ
  （2541件 × 256次元 × float32 ≈ 2.5MB）。`public/index.json` の `name` を更新したら再実行して埋め込みも更新すること。

## データモデル

- 主キーは `code`（食品番号、5桁）。`data/` 内の11ファイルすべての食品番号の和集合（2541件）をカバーする
  （本表だけでは3件欠落するため）。
- 値は `{"raw", "value", "estimated", "trace", "unmeasured"}` の形に正規化している。詳細は `llms.txt` を参照。
- 識別子（`WATER`, `ENERC` 等）は文科省の成分識別子をそのまま使用し、テーブルごとに
  `general` / `amino_acids.per_100g` / `fatty_acids.per_g_lipid` のようにネームスペースを分けて格納する
  （同名の識別子が複数テーブルに再掲されているため）。

## ローカル動作確認

```sh
cd public && python3 -m http.server 8787
curl -s http://localhost:8787/index.json | head -c 300
curl -s http://localhost:8787/data/01001.json | python3 -m json.tool | head -30
```

## Cloudflare Pagesへのデプロイ

このリポジトリは `public/` のみを配信対象にする想定（`data/` や `scripts/` は含めない）。

- ダッシュボードでGit連携する場合: ビルド出力ディレクトリを `public`、ビルドコマンドは未設定
  （事前生成済みの静的ファイルをそのままコミットする運用）にする。
- Wrangler CLIで直接デプロイする場合:

```sh
npx wrangler pages deploy public --project-name=<プロジェクト名>
```
