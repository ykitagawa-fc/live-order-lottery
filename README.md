# LIVE ORDER LOTTERY

オンラインライブの出演順を決める、ガラガラ抽選機風Webアプリ。HTML/CSS/JSのみ、サーバー・DB不要。

## 使い方（主催者）
1. 参加者に公開URLを共有
2. 参加者は1回ガラガラを回し、出た番号（1〜9999）を申告
3. 番号の小さい順に並べ、欠番は詰める。重複は主催者が個別に決定

## 別イベントで再利用
`script.js` 冒頭の `CONFIG.EVENT_ID` を変更すると、全員が新たに抽選できます。

## GitHub Pages 公開手順
1. このフォルダの4ファイルをリポジトリ直下にpush
2. リポジトリの Settings → Pages → Source を「Deploy from a branch」、Branch を `main` / `/(root)` に設定
3. 数分後 `https://<ユーザー名>.github.io/<リポジトリ名>/` で公開（相対パスのためサブパス配信に対応）

## 構成
- `Lottery`：`crypto.getRandomValues` + 棄却サンプリングで等確率抽選
- `Store`：localStorage 保存・読み戻し検証・破損検知
- `Sound`：Web Audio API で効果音生成（タップ起点で解錠）
- `Anim`：requestAnimationFrame による加速→減速回転、玉の飛び出し
- `UI`：画面状態の切り替え、エラー表示、コピー

## テスト時のリセット
Safari：設定 → Safari → 詳細 → Webサイトデータ で該当サイトを削除。PC：DevTools → Application → Local Storage でキーを削除。

## 制約（仕様どおり対象外）
データ削除・プライベートブラウズ・別端末による再抽選は防げません。
