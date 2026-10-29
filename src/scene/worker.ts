import {Core, Program, Renderer, Vao, plane2D} from 'glaku'
import {applyHero, createHeroScene, type HeroCommand} from '../hero/scene'
import {createLightScene, type LightCommand} from '../light/scene'
import {DEFAULT_LIGHT} from '../light/tuning'

// トップの舞台の canvas。写真の粒子（hero）と、光がロゴを照らす層（light）を 1 枚の canvas に描く。
// どちらも自分の層に描き、ここで 1 回の全画面の描画で重ねる（光の上に写真の粒子）。
// 2 枚の canvas に分けていると、粒子と光が別の物に見え、粒子が写真の枠の外へ出られなかったため 1 枚にした。
//
// 指示はメインスレッドの rAF から届く。hero と光はそれぞれ別に指示を送ってくるので、届いたぶんを入れたら、
// 同じタスクで届く指示を待ってから 1 回だけ重ね直す（setTimeout 0）。

/** worker からメインスレッドへ返すもの。写真が1枚上がるごとに、その番号が届く */
export type Loaded = {layer: number}

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

  // 光の層を明るさに直し、その上に写真の粒子の層を枠の位置へ拡大して重ねる。どちらも透ける部分は透明にして、
  // ページの地を透かす（プリマルチプライド）。粒子の層は格子の解像度で描いてあり、ここでなめらかに拡大する
  const compose = new Program(core, {
    id: 'compose',
    attributeTypes: {a_position: 'vec2', a_textureCoord: 'vec2'},
    uniformTypes: {u_lit: 'float', u_photo: 'float', u_rect: 'vec4'},
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
        float c = u_lit * (1.0 - exp(-texture(t_light, v_uv).r));
        vec2 uv = (v_uv - u_rect.xy) / (u_rect.zw - u_rect.xy);
        bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
        vec4 photo = u_photo > 0.5 && inside ? texture(t_photo, uv) : vec4(0.0);
        o_color = vec4(photo.rgb + vec3(c) * (1.0 - photo.a), photo.a + c * (1.0 - photo.a));
      }`
  })

  let scheduled = 0
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
    compose.setUniform({u_lit: glow ? 1 : 0, u_photo: photo ? 1 : 0})
    screen.clear()
    screen.render(plane, compose)
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
      // 光へ飛んでいる粒子は、光線と同じ層に光の粒として描く
      const scale = pixelRatio * (tuning.resolution / 100)
      if (command.frame)
        light.draw(command.frame, (target) => hero?.glow(target, size, tuning.particleGlow, scale) ?? false)
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
