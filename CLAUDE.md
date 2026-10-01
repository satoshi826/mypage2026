# mypage2026

Satoshi Hata（写真家 / エンジニア）のポートフォリオサイト。

## 進め方（セッションをまたいで守ること）

- **サイトの現在地は [docs/site.md](docs/site.md)。** 何を載せるかの決まったことと
  足りないものだけを書く。経緯・日付・根拠・他サイトへの言及は書かない。
  構成に関わる判断をしたら、その場で更新する。
- **見せ方の指針は [docs/design.md](docs/design.md)。** テーマはモノトーン・ミニマル・
  心地よさ・連続性。UI や演出を作る前に読み、迷ったらこの4つで判断する。

## 現在の状態

実装済みのものと技術的な詳細は [README.md](README.md) を参照。トップの粒子 hero、
Photos の試作、About / Contact の仮実装がある。ページごとの状態と未決は site.md。

## スタック

Vite + React 18 + TypeScript + [glaku](https://github.com/satoshi826/glaku)（WebGL）。
スタイルは Tailwind v4（`@theme` にトークンを置き CSS 変数として共有）。

- **glaku の使い方は [docs/glaku.md](docs/glaku.md) にまとめてある。** シェーダの
  自動挿入、テクスチャの制約、Worker で使うときの注意など、毎回ハマる点が書いてある。
  glaku を触る前に読む。
- 前作 mypage2025 は Cloudflare Workers + React 19 + Tailwind + Drizzle 構成だったが、
  このリポジトリは素の SPA。**Cloudflare Workers に静的アセットとして置く**（`wrangler.jsonc`）。

## 注意

- **Node 20.19+ / 22.12+ で動かすこと。** Vite 8 と TypeScript 7 がそれより古い Node で
  起動せず、`npm run dev` も `npm run build` も不可解なエラーで落ちる。シェルの既定が
  古い Node になっていることがあるので、まず `node -v` を確認する。
- lint / format は eslint ではなく **oxlint / oxfmt**（`npm run lint` / `npm run format`）。

- **`public/photos/` の写真は本人の作品。** 表示品質を落とす変更（解像度、圧縮、
  トリミング）は必ず相談してから行う。
- 粒子ギミックは全写真を同一アスペクト比に揃える必要がある（現在 3:2）。
  写真を追加・差し替えするときはこの制約を確認する。
