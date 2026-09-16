# 食品成分表示API

## 概要
dataフォルダにあるデータをつかってAPIを作る

## エンドポイント
- index.json
    食品番号と食品名だけのデータ
- data/{食品番号}.json
    食品番号に紐づく各成分データ
- metadata.json
    dataのメタ情報
- llms.txt
    使い方の解説

## データ探索方法
- index.jsonをダウンロードして食品番号を特定
- 食品番号.jsonとmetadata.jsonをつかってデータを取得

## 基盤
cloudflare pages
各ファイル容量やファイル数の上限にきをつけて実装して

## 注意事項
dataフォルダのエクセルは神エクセルとなっている。特に単位に注意が必要。metadataをうまく利用すること。

## MCPサーバー構想（ローカル運用）

### 目的
- AIエージェントから使う際、食品コードの検索や複数食材の合算計算をLLMに素手（生JSON取得＋暗算）でやらせるとハルシネーションのリスクがある
- 検索・計算をサーバー側の確定的なコードで行うツールとして切り出す

### 形態
- ローカルで動くnpmパッケージ（stdio transportのMCPサーバー）。Cloudflare Workers等のホスティングは不要
- すでに公開済みの静的API（`https://food-ingredients.pons-llc.com/`）を都度fetchする。データを同梱・複製しない
- 環境変数（例: `FOOD_INGREDIENTS_API_BASE_URL`）でAPIのベースURLを上書き可能にし、ローカル開発サーバーにも向けられるようにする
- 現時点ではnpm公開はしない。`.mcp.json` / `claude_desktop_config.json` からローカルパス（`node mcp-server/src/index.mjs`）で利用する想定

### 提供ツール（3つ）
- `search_food(query, limit?)`: index.jsonに対する食品名・食品群名の部分一致検索。候補`{code, name, group_name}`を返す。LLMが食品コードを記憶やあて推量で使わずに済むようにする
- `get_food(code, detail?: "summary"|"full")`: `/data/{code}.json`を取得し、metadata.jsonのラベル・単位を解決して返す。`summary`（既定）は下記8項目、`full`は全カテゴリ
- `calculate_nutrition(items: [{code, grams}])`: 複数食材×分量から、サーバー側で正確に合算・按分計算を行う。個別内訳・合計・出来上がり100gあたり換算・欠測データの注記（caveats）を返す

### 主な栄養サマリー項目（8項目）
public/search.htmlに実装済みのロジックをそのまま流用する。
- カロリー = `general.ENERC_KCAL`
- タンパク質 = `general.PROT-`
- 脂質 = `general.FAT-`
- 炭水化物 = `general.CHOCDF-`
- 食物繊維 = `general.FIB-`
- ナトリウム = `general.NA`
- 食塩相当量 = `general.NACL_EQ`
- 不飽和脂肪酸 = `fatty_acids.per_100g.FAMS + FAPU`（八訂に単一項目は無いためアプリ独自の合算値。両方揃わない場合は「片方のみ判明」等を明示し、欠測を0扱いしない）

### アーキテクチャ（実装時の想定ファイル構成）
```
mcp-server/
  package.json
  README.md
  src/
    index.mjs      # stdio起動のエントリポイント
    server.mjs     # McpServerへのツール登録・エラーハンドリング
    api.mjs        # index.json/metadata.json/data/{code}.jsonのfetch+キャッシュ層
    nutrition.mjs  # サマリー抽出・不飽和脂肪酸合算・calculate_nutritionの計算ロジック（search.htmlのロジックを移植）
  scripts/
    smoke-test.mjs # SDKのClient+StdioClientTransportで実際にツールを呼び、じゃがいものごま炒めレシピを健全性チェックのオラクルとして使う
```
- 依存: `@modelcontextprotocol/sdk`（`McpServer`/`StdioServerTransport`）, `zod`
- キャッシュはプロセス内メモリのみ（index.json/metadata.jsonは初回fetchでキャッシュ、data/{code}.jsonはコードごとに遅延キャッシュ）。ディスク永続化やTTLはv1では不要

### 未決事項（実装時に確定させる）
- パッケージ名: `@pons-llc/food-ingredients-mcp`（GitHub org / PONS LLCブランドに合わせたスコープ付き案）か、スコープなしの`food-ingredients-mcp`か。npm公開しない前提なので急ぎでは無い
- ライセンス: **MITに決定**。`mcp-server/`配下にLICENSEファイルを実装時に追加する（リポジトリ全体へ適用するかは別途検討）
- `calculate_nutrition`の`items`上限（暫定50件）、`get_food`の既定`detail`（暫定`summary`）などの細かいデフォルト値