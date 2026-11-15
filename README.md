# クラウド相談室（仮）

AWS SAA-C03 の学習用シナリオゲーム（非公式）。新人SEとしてお客さんの相談に構成を提案し、Well-Architected の観点で評価されながら知識を身につける。スマホのブラウザで遊べる静的Webアプリ（PWA）。

## 開発

```bash
npm install
npm run dev        # 下書きの相談も含めて起動
npm test           # 評価・復習キュー・条件判定・コンテンツのテスト
npm run build      # 公開用ビルド（確認済みの相談だけを含める）
```

## 構成

```text
content/              問題データ（YAML）。相談1件＝1ファイル
  scenarios/
  concepts.yaml       学習項目（復習の単位）
  customers.yaml
  cards.yaml          サービス図鑑
scripts/
  validate-content.ts YAMLを検証して src/generated/content.json に書き出す
src/
  content/schema.ts   コンテンツの型（zod）
  engine/             評価・復習キュー・条件判定（UIに依存しない純粋関数）
  screens/            画面
  components/
```

## 相談を追加・公開するとき

1. `content/scenarios/<id>.yaml` を書く。最初は `review.status: draft`。
2. 解説の事実を公式ドキュメントと一文ずつ照合し、`sources` に出典URLと確認日を入れる。
3. 書いた日とは別の日に読み直してから、`review.status: verified` と `review.verifiedAt` を入れる。

`npm run build` は確認済みの相談だけを含め、学習項目ごとに復習用の相談が2件以上ないと失敗する。

問題や解説を実行時に AI で生成する処理は持たない。実際の試験問題や市販の問題集の文面は使わない。

## 公開

`main` への push で GitHub Actions が GitHub Pages にデプロイする。初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする。

第1段階（身近な人とのテストプレイ）の間は、デプロイは下書きの相談も含めて公開する（`.github/workflows/deploy.yml`）。
