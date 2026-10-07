# mypage2026

ポートフォリオサイト。何を載せるかは `docs/site.md`、見せ方は `docs/design.md`。

## 粒子モーフの仕組み

写真の全画素を粒子として描き、N枚の写真の間を任意の順序で遷移させる。

対応付けはペアごとに作らない。各画像を独立に**輝度ランク空間**へ写す。

```
写真a ─sort─┐
写真b ─sort─┼→ ランク k = 0..粒子数-1（全画像共通の粒子ID）
写真z ─sort─┘
```

粒子 k は「どの写真でも k 番目に暗い画素」という一つの意味を持つので、任意の
2枚が自動的に接続される。対応表は画像ごとに1つ（計 N 個）で済み、a→e→z→a と
巡っても誤差が蓄積せず厳密に元へ戻る。モノクロ＝輝度が1次元で全順序が付くこと
が前提で、これは1次元の最適輸送そのもの。

### データの持ち方

事前計算するのは**縮小画像だけ**（`hero/<file>.webp`、1152×768 のグレースケール）。
ソート結果は元画像から一意に決まるので持っても情報が増えず、座標列は圧縮も効かない。
輝度を8bitに量子化したカウントソートは 884,736 粒子で実測 5〜6ms
（`src/hero/table.ts`）なので、実行時に作るほうが速くて軽い。

カウントソートが安定ソートであることも効いている。画素を走査順にバケットへ流し
込むので、同輝度の画素は「上から下・左から右」に並ぶ。空や壁のような平坦部が塊
のまま移動するのはこの副作用。

粒子グリッドは配信解像度そのまま（1152×768）が既定で、VRAM 予算（96MB）とテクスチャ
上限に収まらないときだけ落とす。画面サイズは見ない。

GPU には RGBA8 のデータテクスチャ `t_table` を1枚だけ置く。N枚ぶんの表を縦横に
敷き詰めたアトラスで、1テクセルが粒子1つ。

| チャンネル | 内容 |
|---|---|
| RGB | ランク k → 元画像の画素インデックス（24bit LE）。シェーダで格子座標に戻す |
| A   | その粒子の輝度 |

座標ではなくインデックスを持つのは、3バイトに収まって A が空くため。作品がモノクロ
なので、色は輝度1バイトで足りる。アトラスの列数は「確保するブロック数が最小で、同数なら
正方形に近い」ものを選ぶ（横一列では 16384px の上限に 21 枚で当たる）。

頂点シェーダは `u_from` / `u_to` の2ブロックを `texelFetch` して `mix` する。
1粒子が読むのは2テクセルなので、**描画コストは写真の枚数に依存しない**。

### 粒子ごとの時間差

粒子ごとに、**暗さ**で出発時刻をずらす。暗い粒子ほど遅れて出発する。

```glsl
darkness = 1.0 - (lumFrom + lumTo) * 0.5   // 両端の平均。逆再生でも同じ順序になる
delay    = pow(darkness, u_toneCurve) * u_staggerTotal
local    = easeInOut((u_phase - delay) / (1 - u_staggerTotal), u_easePower)
```

光が先に抜け、闇が後から追う。`easeInOut` は指数つきで、`u_easePower` が 1 なら
等速、3 なら easeInOutCubic と一致する。既定値は `src/hero/tuning.ts`。

#### 速さとカスケードのトレードオフ

`staggerTotal` を大きくすると出発のばらつきは広がるが、残りの `1 - staggerTotal` が
1粒子あたりの移動時間なので、**同時に個々の粒子は速くなる**。両立はしない。

#### 調整のしかた

パラメータは uniform なので実行時に変えられる。`npm run dev` で開いた画面の左上に
スライダーのパネルが出る（`import.meta.env.DEV` の中でのみ描画され、本番バンドルには
入らない）。値は localStorage に残るのでリロードしても消えない。**既定値を変えても
保存された値が勝つ**ので、既定の挙動を確かめるときは「既定値」を押すか localStorage を消す。

値が決まったら「コードをコピー」を押して、`src/hero/tuning.ts` の `DEFAULT_TUNING` /
`DEFAULT_INTERACTION` に貼り替える。パラメータの定義（範囲・ラベル・説明）も
`src/hero/tuning.ts` にあり、worker の既定値とパネルの両方がそこを唯一の出典として使う。

`staggerTotal` を 0 にすると、ずらしなしで全粒子が同時に動く。

### 起動

全枚数を待たずに描き始める。worker は 0 番の写真だけ単独で先に上げ、届いた時点で
静止画として描く。残りは順番をばらして 8 並列で上げ、1枚上がるごとにメインスレッドへ
番号と輝度の要約を返す。抽選はその時点で上がっている写真の中からだけ行い、
次の1枚が未定のあいだは時計を止めて静止帯の頭で待つ（遷移の途中で行き先が決まると
粒子が飛ぶため）。カレンダーの未読み込みの番号は薄く出し、押せない。

トップの HTML には hero のチャンクと一覧の先読み、worker のスクリプトと最初の写真の
prefetch が入る（`scripts/prerender.js`、`worker/index.ts`）。JS の起動と並行して
後ろの段を取り始めるため。Photos も同じく、一覧の先読みと最初の数枚の preload が入る。

## 自動再生

hero は 100svh の1画面で、スクロールは遷移を操作しない。時計で自分で進み、次の1枚は
**ランダムに選ぶ**（直前と同じものは選ばない）。

進行状態は `src/hero/sequence.ts` が持つ。ランダム順なので「進捗から (from, to) を
逆算する」形にはできず、`{from, to, elapsed, history}` を状態として保持して時間で進める。
1周は静止帯 → 遷移帯。

`(from, to, phase)` の算出は**メインスレッドが持つ**。DOM のインジケータが同じ値を
必要とするため。worker は渡された3値を描くだけの純粋なレンダラで、時計を持たない。
phase は**線形**で、イージングは頂点シェーダが粒子ごとに掛ける（粒子ごとに開始時刻を
ずらすため、CPU 側でイージング済みの値を渡すと各粒子の加減速が制御できなくなる）。

「今の1枚」の答えは2つある。丸が示すのは遷移の開始で切り替わる側、粒子が位置として
近いのは中点で切り替わる側。同じ番号を押しても何も起きない判定は前者、番号を押した
ときの出発点は後者を使う。行き先が変わった瞬間は基準位置が跳ぶので、その差を
「ズレ」（下記）に振り替えて見た目の位置を保ち、バネが新しい軌道へ引き戻す。

自動再生を切っても進行中の遷移は完走させてから止まる（散ったまま凍結すると事故に
見えるため）。画面外では `IntersectionObserver` で時計を止める。
`prefers-reduced-motion` のときは初期 OFF で、動かすときも中点で切り替えるだけにする。

React の state に載せるのは現在の index と読み込み済みの番号だけ。`phase` のような
連続値を state に入れると毎フレーム再レンダリングが走るので、ref 経由で直接 style を書く。

## 干渉（マウス・指）

粒子は写真上の位置に加えて「ズレ」を持つ。ズレは粒子1つにつき1テクセルの
RGBA16F テクスチャ（ズレ xy と速度 zw）に入っていて、毎フレーム別のテクスチャへ書き
ながら交互に入れ替える。更新をフラグメントではなく頂点側で計算しているのは、
フラグメントの sampler が lowp 既定で、半精度の状態を読むと精度が落ちるため。

ポインタの速度に比例した「目標のズレ」が、距離でガウス減衰しながら掛かる
（放射状の押しと進行方向の引きずりの合成。向きは粒子ごとに乱数でずらす）。粒子は
目標へバネで引かれ、力が消えれば目標は 0 なので**必ず元の写真に戻る**。バネは
剛性ではなく「戻る秒数」と「減衰比」で指定する。暗い粒子ほど重く、質量は暗さの
指数関数なので比で効く。質量で加速度ごと割るため、固有振動数も減衰比も粒子ごとに散る。

ポインタ速度は瞬間値ではなく時定数で均す（上がるときは遅く、下がるときは速く）。
`stopBelow` を 0 より大きくすると、均した速度がそれを下回ってから戻りの猶予が過ぎた
時点で更新を止められる。既定は 0 で、hero が画面内にあるあいだは止めずに回し続ける。

## スペクトラム（横並びのときだけ）

写真ごとに輝度の分位点を 8192 個持ち、粒子と同じ遅延で補間してから棒に数える。
だから遷移中の分布も厳密に出る。高さは分布、濃さは速度（イージングの傾きの平均）で、
次元が違うので別のチャンネルに出す。棒にホバーすると、その輝度帯の粒子だけ残して
他を地の色へ薄める。

## 構成

```
src/
  main.tsx  entry-server.tsx  styles.css
  app/      サイトの骨格
  hero/     粒子ギミック（トップ専用）
  photos/   写真の一覧の取得。hero と Photos の両方がここを見る
  gallery/  Photos ページの一覧・拡大表示・現れ方
  admin/    写真の管理画面
worker/     Cloudflare Worker（写真の API）
```

| ファイル | 役割 |
|---|---|
| `hero/table.ts`     | 配信解像度の定数、粒子グリッドの決定、縮小・輝度計算・カウントソート、アトラス配置 |
| `hero/worker.ts`    | テクスチャ構築、シェーダ、描画と干渉の更新。OffscreenCanvas 上で動く |
| `hero/sequence.ts`  | 自動再生の進行状態。次の1枚の抽選、静止帯と遷移帯の割り当て |
| `hero/useCanvas.tsx`| canvas を worker へ譲渡する配線、resize 監視、rAF フック |
| `hero/pointer.ts`   | ポインタを写真の枠基準の NDC で追う。マウスも指も同じ経路 |
| `hero/Hero.tsx`     | 100svh の hero、時計の駆動 |
| `hero/ControlPanel.tsx` | 自動再生の切り替え、番号、次までのプログレス |
| `hero/tuning.ts`    | 調整値の既定と開発用パネルの定義 |
| `app/DevPanel.tsx`  | 数値や選択肢を詰める開発用パネル（`import.meta.env.DEV` の中でのみ描画）。hero と Photos が使う |
| `hero/layout.ts`    | コントロールパネルの寸法と、写真との並べ方の決定 |
| `app/routes.ts`     | ルート定義。ナビ・プリレンダ・title/description の唯一の出典 |
| `app/pages/`        | 各ページ |
| `app/useSmoothScroll.ts` | 慣性スクロール（Lenis）。全ページ共通 |
| `gallery/layout.ts` | Photos の段組の計算。写真の順・幅・列数・広げている写真から各写真の位置を決める純粋関数 |
| `gallery/Gallery.tsx` | Photos の一覧。layout.ts の結果を絶対配置で並べ、クリックでその場に広げる（FLIP）。`Img.tsx` が先読みと派生の切り替え |
| `gallery/reveal.ts` | 視界に入った要素を現す演出（`data-reveal`）。見た目は `styles.css` |
| `photos/index.ts`   | 写真一覧の取得（`/api/manifest`）と、派生画像の URL |
| `admin/`            | 写真の管理画面（`/admin`）。派生画像の生成と API の呼び出し |
| `worker/`           | Cloudflare Worker。写真の API と Access の検証 |
| `scripts/encode-photos.sh` | 原本から派生画像を `.photos/` に書き出し、manifest.json を生成する（移行用） |
| `scripts/sync-photos.mjs` | 写真を `.photos/` → ローカル、本番 ⇄ ローカルで動かす |
| `scripts/prerender.js` | ビルド後に各ルートを HTML 化する |

Worker には `requestAnimationFrame` がないため、駆動はメインスレッドの rAF から。
タブが非表示になると rAF が止まり、無駄な描画も止まる。

## 制約

- 全写真のアスペクト比を揃える必要がある（粒子集合を共有するため）。現在は 3:2。
- 対応の根拠は輝度の順位だけなので、意味的な対応（顔と顔）は起きない。
- 粒子グリッドは起動時に決まり、以後は変わらない。画面サイズは見ず、VRAM予算と
  テクスチャ上限に収まらないときだけ配信解像度から落とす。
- モノクロ専用。色を輝度1バイトに畳んでいるため、カラー写真は扱えない。
- `glaku` は 0.5.2 以上が必須。頂点シェーダの sampler を highp で注入し、
  `createTexture` が `Uint8Array` を受けるのがこの版から（`docs/glaku.md`）。

## 写真の管理

写真の正本は R2（バケット `mypage2026-photos`）。サイトは起動時に `/api/manifest` から
一覧を読み、画像は `/images/<kind>/<name>` から取る。再ビルドなしで写真を入れ替えられる。

| キー | 内容 |
|---|---|
| `manifest.json` | 一覧。`file / w / h / category / hero` の配列。形は `worker/manifest.ts` が検証する |
| `thumb/<file>.webp` | 一覧用。長辺 800px |
| `gallery/<file>.webp` | 拡大用。長辺 2000px、カラー、トリミングなし。一覧で広げたときに読む |
| `hero/<file>.webp` | hero 用。1152x768、中央トリミング、グレースケール。`hero: true` のものだけ使う |
| `originals/<file>.<ext>` | 原本。再派生のために置く。認証なしでは取れない |

API は `worker/index.ts`。読み取りは誰でも、書き込みと原本の取得は Cloudflare Access の
JWT を検証する（`worker/access.ts`）。`ACCESS_TEAM_DOMAIN` と `ACCESS_AUD` が未設定なら
localhost からの書き込みだけ通す（wrangler dev 用）。

**管理画面 `/admin`。** 複数アップロード、カテゴリと hero の切り替え、並び替え、削除。
派生画像（thumb / gallery / hero）はブラウザで作る（`src/admin/derive.ts`。段階的な縮小、
Rec.709 のグレースケール、WebP 書き出し。Safari は WebP を書き出せないので Chrome を使う）。一覧の編集は「保存」で
manifest.json を丸ごと置き換える。画像のアップロードと削除は即座に反映される。

**最初の移行と再派生**は `scripts/encode-photos.sh`（原本 → `.photos/`）のあと
`npm run photos:import`（`.photos/` → ローカルの R2）、`npm run photos:push`（→ 本番）。
`.photos/` は作業用で追跡しない。

**写真の移動**は `scripts/sync-photos.mjs`。一覧（manifest.json）を正として、
thumb / gallery / hero を etag で比べ、違うものだけ送る。送り先の一覧にだけある写真は
画像ごと消す。原本は扱わない。`npm run dev` を動かしたまま使う（ローカル側は
wrangler dev の API 経由）。本番への書き込みは wrangler なので、ログインしておく。

```
npm run photos:import      # .photos/ → ローカル
npm run photos:pull        # 本番 → ローカル。管理画面で本番に足した写真を手元に揃える
npm run photos:push        # ローカル → 本番。実行前に何が変わるか出して確認を求める
node scripts/sync-photos.mjs push --dry-run   # 変更内容だけ見る
```

push は本番の一覧を丸ごと置き換え、ローカルにない写真を本番から消す。本番で足した写真を
消さないよう、push の前に pull するか、dry-run で差分を見る。

## 開発

```
npm install
npx wrangler types   # Worker の型（worker-configuration.d.ts）を生成する。build も先に走らせる
npm run dev       # Vite（:5173）。写真の API（wrangler dev、:8787）も一緒に立ち上がり、
                  # /api と /images はそちらへプロキシされる。ローカルの R2 を使う
npm run dev:api   # Worker だけを単体で動かすとき
```

ローカルの R2 は空なので、最初に写真を入れる。本番にあるなら `npm run photos:pull`、
原本からなら `scripts/encode-photos.sh` のあと `npm run photos:import`。

一覧の画像は視界の 2〜3 画面分手前から読み始め、読み込みが終わってから現れる。離れたら src を
外してデコード済みの画像を手放し、枠には `content-visibility: auto` を付けて画面外の描画を
飛ばす（メモリの少ない端末でのカクつき対策。`src/gallery/Img.tsx`、`src/gallery/reveal.ts`）。段組は `src/gallery/layout.ts` が計算する。各写真を順に、いちばん上が
空いている列へ置く。広げる写真は幅を px で自由に取れ、覆う列の下に置き、覆わなかった列には
後ろの写真が入るので、幅をどこで止めても自然に詰まる。上にあった写真は動かさない。
クリックした写真はその場で全幅（縦長は画面の高さに収まる幅）に広がり、周りは押し下げられる。
動きは FLIP で、変更前の位置を記録してから差分を transform で戻す（`src/gallery/Gallery.tsx`）。

**Node 20.19+ / 22.12+ が必要**（`package.json` の `engines`）。Vite 8 と TypeScript 7 が
それより古い Node では起動しない。nvm を使っているなら `nvm use 24` など。

## 本番の準備（Cloudflare 側）

1. R2 を有効にし、バケット `mypage2026-photos` を作る。
2. `./scripts/encode-photos.sh ~/path/to/originals` → `npm run photos:import` → `npm run photos:push`
   で写真と manifest を入れる。原本は入れない。
3. Zero Trust > Access で Self-hosted のアプリケーションを作り、パス `/admin` だけを保護する。
   自分のメールだけ許可する。Access はメソッドを区別できないので `/api/*` や `/images/*` は
   入れない（入れると一覧の画像が誰にも見えなくなる）。書き込み API は Worker が
   Access の Cookie（`CF_Authorization`）の JWT を検証して守る。管理画面の fetch は同一
   オリジンなので Cookie が自動で付く。
4. `ACCESS_TEAM_DOMAIN`（`<team>.cloudflareaccess.com`）と `ACCESS_AUD`（アプリケーションの
   Audience タグ）を Worker の secret に入れる（`wrangler secret put`）。dashboard の
   plain-text 変数は `wrangler deploy` で消えるので secret にする。
   未設定のままだと本番の書き込みはすべて 503 になる。
5. `npm run deploy`。
