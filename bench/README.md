# 計測（bench）

同じ手順・同じ条件で読み込みと操作中の滑らかさを測り、変更の前後を数字で比べる。
本番ビルドを `wrangler dev` で配信して測る（写真の API も本番と同じく Worker が持つ）。

## 使い方

```sh
npm run bench                                    # ビルドしてから全部測る（各場面 3 回の中央値）
npm run bench -- --profile mobile-low            # 端末の条件を絞る（複数指定できる）
npm run bench -- --scenario photos-columns       # 場面を絞る（複数指定できる）
npm run bench -- --runs 3 --headed               # 回数を変える / 画面を出して GPU で描く
npm run bench -- --url https://example.com       # 公開中のサイトを測る（ビルドの大きさは測らない）
npm run bench:compare                            # 新しい 2 回分を比べる
npm run bench:compare -- 前.json 後.json         # 指定した 2 回分を比べる
```

結果は `bench/results/<日時>-<コミット>.json`（git には入れない）。未コミットの変更がある状態で
測ると、ファイル名に `-dirty` が付く。計測用の `wrangler dev` は 8790 番で立てるので、
`npm run dev` を動かしたままでよい。

## 端末の条件（scenarios.mjs の PROFILES）

| 名前         | 画面             | CPU      | 通信（読み込みの場面だけ） |
| ------------ | ---------------- | -------- | -------------------------- |
| `mobile-low` | 390×844、タッチ  | 6 倍遅く | Slow 4G                    |
| `desktop`    | 1440×900、マウス | そのまま | そのまま                   |

## 場面（scenarios.mjs の SCENARIOS）

| 名前                                    | 内容                                                               |
| --------------------------------------- | ------------------------------------------------------------------ |
| `load-top-cold` / `load-top-warm`       | トップを開く。cold はキャッシュ無し、warm は一度開いてから開き直す |
| `load-photos-cold` / `load-photos-warm` | Photos を開く                                                      |
| `photos-scroll`                         | 一覧を 6000px 流す（タッチは指、PC はホイール）                    |
| `photos-columns`                        | 列数を 6 → 2 → 5 → Auto と切り替える                               |
| `photos-expand`                         | 画面の中央に近い写真を 3 枚続けて広げ、全部戻す                    |
| `page-transition`                       | トップ → Photos → About → Works → Contact → トップ                 |
| `hero-idle`                             | hero を 5 秒再生したまま置く                                       |

場面の操作の量や待ち時間を変えると、それ以前の結果とは比べられなくなる。

## 指標

- 読み込み: 最初の描画（FCP）、最大の要素の描画（LCP）、hero の最初の写真（アプリの
  `performance.mark('hero:photo')`。canvas は LCP の対象にならないため）、レイアウトのずれ（CLS）、
  転送量（worker が読む写真も含む）、JS の実行時間、JS のヒープ
- 操作: requestAnimationFrame で数えたフレームの間隔（p95・最大）と落ちたフレーム、
  長いフレームの詰まり（Long Animation Frames の blockingDuration の合計）、
  メインスレッドの内訳（JS・スタイルの再計算・レイアウト・合計。Chrome の Performance.getMetrics の差分）
- ビルドの大きさ: dist の JS・CSS・HTML の gzip 後の合計、フォントはそのままの大きさ

比較では、中央値の変化が 5% 未満は誤差として扱う。

## 限界

- **同じ機械どうしで比べる。** 数字は機械によって変わる。比較は別の機械の結果どうしだと注意を出す。
- **ヘッドレスは GPU を使わずに描く。** ぼかし（backdrop-filter）のような GPU の負荷は実機と出方が違う。
  実機に近い数字が欲しいときは `--headed`。
- **フレームはメインスレッドで数える。** 合成スレッドだけで動くもの（transform のアニメーション、
  スクロール連動の線）のカクつきは数に出ない。
- **最初の HTML の取得には通信の遅さが掛からない。** Chrome の通信の制限が、ローカルへの最初の
  ページの取得に効かなかった（Chrome 155）。そのあとの JS・CSS・画像には効く。そのため「最初の
  1 バイト」はローカルでは常にほぼ 0 で、ほかの時間も実際より少し短い。前後の比較には影響しない。
