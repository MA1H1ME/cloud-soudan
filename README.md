# クラウド相談室（仮）

AWS SAA-C03 の学習用シナリオゲーム（非公式）。新人SEとしてお客さんの相談に構成を提案し、Well-Architected の観点で評価されながら知識を身につける。スマホのブラウザで遊べる静的Webアプリ（PWA）。

## 開発

```bash
npm install
npm run dev        # 下書きの相談も含めて起動
npm test           # 評価・復習キュー・条件判定・コンテンツのテスト
npm run build      # 公開用ビルド（確認済みの相談だけを含める）
```

## 遊び方（運用シム）

お客さんのシステムを預かり、1か月ずつ運用する。

1. オフィスで、今月の話とチケット（先月からの課題）を見る
2. 設計図（ブループリント）で部品を置く・外す
3. 「今月を回す」で30日を早送りする
4. 月次レポートで、目標の達成度と「起きたことと、その理由」を読む

課題は出題されるのではなく、構成と出来事の組み合わせから発生する。乱数は使わないので、同じ構成で同じ月を回せば必ず同じ結果になる。金額・訪問数・処理能力はゲーム内の値で、実際の料金や性能ではない。

## 構成

```text
content/
  rules.yaml          ルール＝知識の単位（構成のパターン × 出来事 → 何が起きるか）。照合の対象
  sim/<customer>.yaml お客さんごとの月次計画（訪問数、予算、稼働率の目標、出来事）
  concepts.yaml       学習項目（復習の単位）
  customers.yaml
  cards.yaml          サービス図鑑
  scenarios/          カード式の相談（研修編で使う予定。現在の画面からは使っていない）
scripts/
  validate-content.ts YAMLを検証して src/generated/content.json に書き出す
src/
  sim/                運用シムの計算（engine.ts）、部品表、チケット。UIに依存しない純粋関数
  engine/             カード式の評価・復習キュー・条件判定
  screens/            オフィス、設計図、早送り、月次レポート
  components/
```

## ルールを追加・公開するとき

1. `content/rules.yaml` に書く。最初は `review.status: draft`。
2. `src/sim/engine.ts` の `RULE_IDS` に足し、発動する条件を書く。テストも足す。
3. 説明文を公式ドキュメントと一文ずつ照合し、`sources` に出典URLと確認日を入れてから `verified` にする。

`npm run build`（公開用）は、下書きのルールが1件でも残っていると運用シムを含めない。

## 相談を追加・公開するとき

1. `content/scenarios/<id>.yaml` を書く。最初は `review.status: draft`。
2. 解説の事実を公式ドキュメントと一文ずつ照合し、`sources` に出典URLと確認日を入れる。
3. 書いた日とは別の日に読み直してから、`review.status: verified` と `review.verifiedAt` を入れる。

`npm run build` は確認済みの相談だけを含め、学習項目ごとに復習用の相談が2件以上ないと失敗する。

問題や解説を実行時に AI で生成する処理は持たない。実際の試験問題や市販の問題集の文面は使わない。

## 公開

`main` への push で GitHub Actions が GitHub Pages にデプロイする。初回だけ、リポジトリの Settings → Pages → Source を「GitHub Actions」にする。

第1段階（身近な人とのテストプレイ）の間は、デプロイは下書きの相談も含めて公開する（`.github/workflows/deploy.yml`）。
