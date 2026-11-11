import {Core, Program, Renderer, Vao, plane2D} from 'glaku'
import {applyHero, createHeroScene, type HeroCommand} from '../hero/scene'
import {createLightScene, type LightCommand} from '../light/scene'
import {LOGO_RECTS} from '../light/logo'
import {DEFAULT_LIGHT} from '../light/tuning'

// トップの舞台の canvas。写真の粒子（hero）と、光がロゴを照らす層（light）を 1 枚の canvas に描く。
// どちらも自分の層に描き、ここで 1 回の全画面の描画で重ねる（光の上に写真の粒子）。光へ飛んでいる粒子は、その上に直接描く。
// 2 枚の canvas に分けていると、粒子と光が別の物に見え、粒子が写真の枠の外へ出られなかったため 1 枚にした。
//
// 指示はメインスレッドの rAF から届く。hero と光はそれぞれ別に指示を送ってくるので、届いたぶんを入れたら、
// 同じタスクで届く指示を待ってから 1 回だけ重ね直す（setTimeout 0）。
// 光の 1 フレームを重ね終えたら、GPU が描き終わるのを待って知らせる（Drawn）。メインスレッドは知らせが来るまで次の
// フレームを送らない。遅い端末で指示がたまって光が遅れないように、また、描ける速さを測って光線の数を決めるため。

/** worker からメインスレッドへ返すもの */
export type Reply = Loaded | Drawn
/** 写真が1枚上がるごとに、その番号が届く */
export type Loaded = {layer: number}
/** 光の 1 フレームを GPU が描き終えた */
export type Drawn = {drawn: true}

/** メインスレッドからの指示 */
export type SceneCommand = {
  canvas?: OffscreenCanvas
  pixelRatio?: number
  /** canvas の大きさ。CSS px */
  resize?: {width: number; height: number}
  /** hero に使う写真。届いたら hero の場面を作る */
  photos?: string[]
  hero?: HeroCommand
  light?: LightCommand
}

function createStage(canvas: OffscreenCanvas, pixelRatio: number) {
  const core = new Core({canvas, pixelRatio})
  core.gl.getExtension('EXT_color_buffer_float')

  const screen = new Renderer(core, {id: 'canvas', backgroundColor: [0, 0, 0, 0]})
  const plane = new Vao(core, plane2D())
  const light = createLightScene(core, pixelRatio)
  let hero: ReturnType<typeof createHeroScene> | null = null
  // hero の場面を作る前（写真が届く前）に届いた hero への指示。作ったら入れる
  const early: HeroCommand = {}
  let size = {width: 1, height: 1}
  let tuning = DEFAULT_LIGHT
  // どちらの層もまだ無いあいだ、重ねる描画に持たせておく空の画像
  const empty = core.createTexture({
    width: 1,
    height: 1,
    format: 'RGBA',
    internalFormat: 'RGBA8',
    type: 'UNSIGNED_BYTE'
  })

  // ロゴの面を地より暗い単色で塗り、その上に光の層を明るさに直して重ね、さらに写真の粒子の層を枠の位置へ拡大して重ねる。
  // どれも透ける部分は透明にして、ページの地を透かす（プリマルチプライド）。ロゴの面は画面の画素で縁をなめらかにする
  // （光をためる層は粗いので、そちらでは塗らない）。粒子の層は格子の解像度で描いてあり、ここでなめらかに拡大する
  const compose = new Program(core, {
    id: 'compose',
    attributeTypes: {a_position: 'vec2', a_textureCoord: 'vec2'},
    uniformTypes: {
      u_lit: 'float',
      u_photo: 'float',
      u_rect: 'vec4',
      u_size: 'vec2',
      u_logo: 'float',
      u_logoColor: 'float',
      u_logoRects: `vec4[${LOGO_RECTS.length}]`
    },
    texture: {t_light: empty, t_photo: empty},
    vert: /* glsl */ `
      out vec2 v_uv;
      void main() {
        v_uv = a_textureCoord;
        gl_Position = vec4(a_position, 0.0, 1.0);
      }`,
    frag: /* glsl */ `
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        // この画素がロゴに覆われる割合。画素の正方形と長方形の重なりを縦横で求めて掛ける（長方形どうしは重ならない）
        vec2 p = vec2(v_uv.x, 1.0 - v_uv.y) * u_size;
        vec2 h = 0.5 * fwidth(p);
        float cover = 0.0;
        for (int i = 0; i < ${LOGO_RECTS.length}; i++) {
          vec4 r = u_logoRects[i];
          vec2 overlap = clamp((min(p + h, r.zw) - max(p - h, r.xy)) / (2.0 * h), 0.0, 1.0);
          cover += overlap.x * overlap.y;
        }
        float body = u_logo * min(cover, 1.0);
        float c = u_lit * (1.0 - exp(-texture(t_light, v_uv).r));
        // 光をロゴの面の上に重ねる
        vec4 lit = vec4(vec3(c + u_logoColor * body * (1.0 - c)), c + body * (1.0 - c));
        vec2 uv = (v_uv - u_rect.xy) / (u_rect.zw - u_rect.xy);
        bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
        vec4 photo = u_photo > 0.5 && inside ? texture(t_photo, uv) : vec4(0.0);
        o_color = photo + lit * (1.0 - photo.a);
      }`
  })

  let scheduled = 0
  // 光のフレームを描いたが、まだ描き終わりを知らせていない
  let unreported = false
  const draw = () => {
    scheduled = 0
    const glow = light.layer()
    const photo = hero?.layer()
    // 2 枚は 1 回で渡す。glaku の setTexture は、渡したものの並び順で差し替えるので、1 枚ずつ渡すと前の 1 枚が外れる
    compose.setTexture({t_light: glow ?? empty, t_photo: photo?.texture ?? empty})
    if (photo) {
      const {x, y, width, height} = photo.rect
      // 枠を、画面の下を 0 とする uv に直す
      compose.setUniform({
        u_rect: [x / size.width, 1 - (y + height) / size.height, (x + width) / size.width, 1 - y / size.height]
      })
    }
    const logo = light.logo()
    if (logo) compose.setUniform({u_logoRects: logo.rects, u_logoColor: tuning.logoColor / 255})
    compose.setUniform({
      u_lit: glow ? 1 : 0,
      u_photo: photo ? 1 : 0,
      u_logo: logo?.shown ?? 0,
      u_size: [size.width, size.height]
    })
    screen.clear()
    screen.render(plane, compose)
    // 光へ飛んでいる粒子は、重ねた上に光の粒として足す
    if (hero) {
      const {gl} = core
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      hero.glow(screen, size, tuning.particleGlow, pixelRatio)
      gl.disable(gl.BLEND)
    }
    if (unreported) {
      unreported = false
      report()
    }
  }
  /** ここまでの描画を GPU が終えたら知らせる。WebGL は待てないので、終わったかを短い間隔で見に行く */
  const report = () => {
    const {gl} = core
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0)
    if (!sync) return void postMessage({drawn: true} satisfies Drawn)
    gl.flush()
    const check = () => {
      if (gl.getSyncParameter(sync, gl.SYNC_STATUS) !== gl.SIGNALED) return void setTimeout(check, 1)
      gl.deleteSync(sync)
      postMessage({drawn: true} satisfies Drawn)
    }
    setTimeout(check, 1)
  }
  /** 同じタスクで届く指示を入れ終えてから、1 回だけ重ね直す */
  const schedule = () => {
    scheduled ||= setTimeout(draw, 0) as unknown as number
  }

  return {
    resize(next: {width: number; height: number}) {
      if (next.width <= 0 || next.height <= 0) return
      size = next
      screen.resize({...next, pixelRatio})
      light.resize(next)
      schedule()
    },
    photos(photos: string[]) {
      hero = createHeroScene(core, pixelRatio, photos, {
        onLoaded: (layer) => postMessage({layer} satisfies Loaded),
        onChange: schedule
      })
      applyHero(hero, early)
      schedule()
    },
    hero(command: HeroCommand) {
      if (!hero) {
        Object.assign(early, command)
        return
      }
      applyHero(hero, command)
      schedule()
    },
    light(command: LightCommand) {
      if (command.tuning) {
        tuning = command.tuning
        light.tune(tuning)
      }
      if (command.rays) light.setRays(command.rays)
      if (command.frame !== undefined) light.draw(command.frame)
      if (command.frame) unreported = true
      schedule()
    }
  }
}

let stage: ReturnType<typeof createStage> | null = null
// 舞台を作る前（canvas が届く前）に届いた指示は、ためておいて順に流す
const waiting: SceneCommand[] = []

const apply = (data: SceneCommand) => {
  if (!stage) return
  if (data.resize) stage.resize(data.resize)
  if (data.photos) stage.photos(data.photos)
  if (data.light) stage.light(data.light)
  if (data.hero) stage.hero(data.hero)
}

onmessage = ({data}: {data: SceneCommand}) => {
  if (!stage) {
    waiting.push(data)
    const start = waiting.find((command) => command.canvas)
    if (!start?.canvas) return
    stage = createStage(start.canvas, start.pixelRatio ?? 1)
    for (const command of waiting.splice(0)) apply(command)
    return
  }
  apply(data)
}
