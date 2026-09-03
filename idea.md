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