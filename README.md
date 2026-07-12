# マイ工賃メーター

就労継続支援A型・B型で働く方（当事者ご本人）のための、工賃・収入記録＆目標管理ツールです。
毎日の記録を続けることで、目標やご褒美までの道のりが見え、障害年金の支給日カウントダウンも確認できます。

- 公開URL（予定）：`https://kouchin.pray-power-is-god-and-cocoro.com/`
- インフラ構成：Cloudflare Workers（Custom Domain方式／パターンB）

---

## ファイル構成

```
kouchin/
├── .github/workflows/deploy.yml   … GitHub Actions（手動実行でCFにデプロイ）
├── index.html                      … ツール本体（構造・SEO設定・広告枠）
├── style.css                       … デザイン（ゴールド系背景・カードレイアウト）
├── script.js                       … 動作ロジック（localStorage管理・記録・集計）
├── ads.txt                         … AdSense用（サブドメイン直下に必須）
├── wrangler.json                   … Cloudflare Workersの設定
├── test_node.js                    … 動作検証スクリプト（jsdom）
├── package.json                    … テスト用の依存関係定義
├── .gitignore
└── README.md                       … このファイル
```

Pythonによるビルド工程は使用していません。`index.html` / `style.css` / `script.js` の3ファイルがそのまま公開対象です。

---

## データの保存について

利用者が入力したデータ（工賃記録・気分・メモ等）は、**すべてブラウザのlocalStorageにのみ保存**されます。サーバーには一切送信されません。端末やブラウザを変えると、データは引き継がれません。

---

## ローカルでの動作確認

ブラウザで `index.html` を直接開くだけで動作します（サーバー起動は不要です）。

### 自動テストの実行

```bash
npm install
npm test
```

`test_node.js` が、初期設定〜工賃記録〜達成率計算〜支給日カウントダウン〜リセットまでの一連の動作をjsdom上で検証します。

---

## デプロイ手順

1. GitHubリポジトリの Secrets に `CLOUDFLARE_API_TOKEN` を登録する
2. Cloudflare側で、Workerにカスタムドメイン（`kouchin.pray-power-is-god-and-cocoro.com`）を追加する
3. GitHub Actions（`Deploy to Cloudflare Workers`）を手動実行（workflow_dispatch）する
4. デプロイ後、カスタムドメインのURLで表示確認する

---

## 公開前に必ず確認すること（チェックリスト）

- [ ] `index.html` の `<meta name="robots" content="noindex">` を、公開時に削除 or `content="index, follow"` に変更する
- [ ] `index.html` 内のAdSenseコード（読み込みスクリプト＋広告本体、計2箇所）のコメントアウトを解除する
- [ ] ファビコンを仮のもの（絵文字）から正式な画像に差し替える
- [ ] `ads.txt` がサブドメイン直下（`https://kouchin.pray-power-is-god-and-cocoro.com/ads.txt`）で表示されることを確認する
- [ ] スマホ実機で最終レイアウト確認を行う
- [ ] まごころ福祉総合ポータルへのカード追加を行う

---

## 今後の追加予定

- SEO記事（`column-xxx.html`）の追加：B型/A型の工賃比較、工賃と障害年金の税金の関係 など
- 障害年金以外の手当（特別障害者手当等）の支給日カウントダウンへの対応
