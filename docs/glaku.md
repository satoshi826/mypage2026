# glaku 実装メモ

[glaku](https://github.com/satoshi826/glaku) を使うときに毎回ハマる点。dist を読んで
確認した内容で、**公式ドキュメントではない**。作者本人による訂正歓迎。

対象バージョン: **0.5.2**（2026-09-10 時点）

## シェーダは「書かない部分」がある

`vert` / `frag` に渡す文字列の**前に**、glaku が以下を自動で挿入する。自分で書くと
二重定義になる。

```
#version 300 es          ← vert / frag 両方
precision highp float;   ← frag のみ。vert には付かない
uniform <type> u_xxx;    ← uniformTypes から
uniform highp sampler2D t_xxx;  ← texture から（vert。frag は precision 修飾なし）
layout(location = N) in <type> a_xxx;  ← attributeTypes から（vert のみ）
```

自分で書くのは `out` / `in` の varying、関数、`main()` だけ。

### 挿入は「名前が本文に出現するか」で決まる

出現判定は素朴な正規表現。

```js
new RegExp(`[-=+*/(\\s,]${name}[-=+*/).,;\\s\\[]`).test(source)
```

**名前の前後がこの文字集合に入っていないと挿入されない。** 行頭にいきなり
`t_foo` と書く、`u_x*2.0` のように書く（`*` は後方集合にあるので可）などで挙動が
変わる。宣言されず `undeclared identifier` になったら、まずここを疑う。

使っていない uniform があると `unused uniform keys` という警告がコンソールに出る。

### 名前の接頭辞は型で強制される

| 接頭辞 | 用途 |
|---|---|
| `u_` | uniform |
| `t_` | テクスチャ（sampler2D） |
| `a_` | attribute |
| `o_` | フラグメント出力 |

### 頂点シェーダの sampler は highp（0.5.2 以降）

GLSL ES 3.00 の既定では、頂点シェーダの `float` は highp だが **`sampler2D` は lowp**。
**0.5.2 から glaku が `uniform highp sampler2D` の形で挿入する**ので、頂点シェーダで
浮動小数テクスチャ（RGBA32F / RGBA16F）を `texelFetch` しても精度は落ちない。

0.5.1 以前は precision 修飾なしで挿入され、その宣言は自分の本文より前に来るため、
後から `precision highp sampler2D;` を足しても間に合わなかった。座標のような精度が
要るデータを RGBA8（unorm）に詰める回避策が必要だったのはこのため。

フラグメント側は据え置きで、`precision highp float;` は入るが sampler には付かない。

## createTexture が受け付けるデータ

```ts
core.createTexture({image})                      // TexImageSource → RGBA/UNSIGNED_BYTE、mipmap 生成
core.createTexture({array, width, height})       // ArrayBufferView。既定は下の表のとおり
core.createTexture({width, height, format, internalFormat, type})  // 空のテクスチャ（FBO 用）
```

**0.5.2 から `array` が `ArrayBufferView` を受ける。** `Float32Array` かどうかで既定が
変わり、`format` / `internalFormat` / `type` で上書きできる。

| array | internalFormat | format | type |
|---|---|---|---|
| `Float32Array` | `RGBA32F` | `RGBA` | `FLOAT` |
| それ以外（`Uint8Array` など） | `RGBA8` | `RGBA` | `UNSIGNED_BYTE` |

`filter` の既定は `LINEAR`、`wrap` の既定は `CLAMP_TO_EDGE`。`texelFetch` しか使わない
データテクスチャは `filter: 'NEAREST'` を渡す。

```ts
core.createTexture({array: atlas, width, height, filter: 'NEAREST'})
```

0.5.1 以前は `Uint8Array` を RGBA8 で上げる経路がなく、`core.gl` に降りる必要があった。

なお `{image}` 経路は既定で mipmap を生成する。

## ブレンド

**0.5.2 に `core.blend(mode)` がある。** `NORMAL` / `ADDITIVE` / `MULTIPLY` / `SCREEN` /
`PREMULTIPLIED` から選ぶと、`gl.enable(gl.BLEND)` と `blendFuncSeparate` をまとめて
やってくれる。アルファ側は `(ZERO, ONE)` 固定＝描画先を維持で、下に書いた理由と同じ。

```ts
core.blend('ADDITIVE')
```

`new Core({options: ['BLEND']})` のほうは `gl.enable(gl.BLEND)` を呼ぶだけで `blendFunc`
は触らない。WebGL の既定は `(ONE, ZERO)`（＝上書き）なので、**有効にしただけでは何も
変わらない**。自分で指定するなら `core.gl` から。

```ts
core.gl.blendFuncSeparate(
  core.gl.ONE, core.gl.ONE_MINUS_SRC_ALPHA,  // 色（プリマルチプライド）
  core.gl.ZERO, core.gl.ONE                  // アルファは描画先を維持
)
```

アルファ側を分けているのは canvas 自体の不透明度を保つため。glaku は
`getContext('webgl2', {antialias: true})` で取得していて `alpha: false` を指定しないので、
通常のアルファブレンドだと描画先のアルファまで削れ、canvas 越しに背景が透ける。

## Renderer

**`render()` は画面をクリアしない。** 毎フレーム描き直すなら `clear()` を明示的に呼ぶ。

```ts
renderer.clear()
renderer.render(vao, program)
```

`resize({width, height})` は **CSS ピクセル**を受け取り、内部で
`canvas.width = width * pixelRatio` を設定する。`pixelRatio` は `Core` のコンストラクタ
に渡した値。

## Vao は遅延構築される

`Vao` の実体は最初の `render()` の中で作られる。そのため `Vao` を `Program` より先に
構築してよい（attribute の location は Program 生成時に登録されるため、逆に見えるが
動く）。

`attributes` の型は `Record<AttributeName, number[]>` だが、内部で `new Float32Array(x)`
に渡すだけなので **TypedArray を渡してよい**（型アサーションは要る）。頂点数が多いと
JS 配列は無駄なのでこちらを使う。

描画頂点数は attribute の要素数 ÷ stride で決まる。`gl_VertexID` だけ使いたい場合でも、
頂点数を決めるためのダミー attribute が1つ要る。

## Worker で使うときの注意

**`Loop` は `interval` を渡さないと `requestAnimationFrame` を使う。** Worker には rAF が
存在しないので動かない。`interval` を渡せば `setTimeout` になるが、vsync に同期せず、
タブが非表示でも回り続ける。

このリポジトリではメインスレッドの rAF から Worker にメッセージを送る形にしている
（`src/useCanvas.tsx` の `useAnimationFrame`）。タブが非表示になると rAF が止まるので、
無駄な描画も自動的に止まる。

## バージョンの落とし穴

| バージョン | 変わったこと |
|---|---|
| 0.5.0 | 頂点シェーダに sampler を注入しない（フラグメントのみ）。頂点でテクスチャを読むなら 0.5.1 以上が必須 |
| 0.5.1 | 頂点シェーダにも sampler を注入。ただし precision 修飾なし |
| 0.5.2 | 頂点シェーダの sampler が `highp`。`createTexture` が `ArrayBufferView` を受ける。`core.blend(mode)` 追加 |

**package.json が `^0.5.1` でも lockfile が古い版に固定されていることがある。**
`node_modules/glaku/package.json` の version を直接確認する。

バージョンを上げたら Vite の依存キャッシュを消す。

```bash
rm -rf node_modules/.vite
```

## ユーティリティ

| 関数 | 用途 |
|---|---|
| `resizeObserver(cb)` | `ResizeObserver` のラッパ。`cb({width, height})` に contentRect が来る |
| `screenToViewPort({offsetX, offsetY, clientWidth, clientHeight})` | ポインタ座標をビューポート座標へ |
| `calcAspectRatioVec(w, h)` | アスペクト比ベクトル |

## glaku 側で直せると嬉しいこと

ドキュメントで回避するより、ライブラリを直したほうが良さそうなもの。

1. **`testKeyword` の正規表現。** 単語境界（`\b` や lookahead/lookbehind）で判定すれば、
   書き方によって宣言が消える問題がなくなる。

0.5.2 で対応済み: `createTexture` の `Uint8Array` 経路、頂点シェーダの sampler の
precision。
