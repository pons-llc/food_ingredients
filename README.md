# 食品成分表示API

文部科学省「日本食品標準成分表（八訂）増補2023年」の公開Excelデータ（`data/`）を、
Cloudflare Pagesで配信する静的JSON API（`public/`）にビルドするプロジェクト。

詳細な設計背景は [idea.md](idea.md) と `.claude/plans/` を参照。

## 構成

```
data/                元データ（文科省配布のExcel、11ファイル）
scripts/build_dataset.py   data/ を public/ にビルドするスクリプト
public/               Cloudflare Pagesで配信する静的ファイル一式（ビルド生成物）
  index.json          全食品の {code, index_no, group, group_name, name} 一覧
  data/{食品番号}.json  1食品ごとの成分データ
  metadata.json        識別子辞書・食品群コード表・値注記の凡例
  llms.txt             LLM/エージェント向けの使い方ガイド
  _headers             Cloudflare Pages用のCORS/Content-Type設定
```

## ビルド

```sh
python3 scripts/build_dataset.py
```

`openpyxl` が必要（`pip install openpyxl`）。実行するたびに `public/index.json` /
`public/data/*.json` / `public/metadata.json` / `public/llms.txt` を作り直す（冪等）。

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
