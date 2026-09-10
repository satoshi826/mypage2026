import {Core, Vao, Program, Renderer} from 'glaku'
import {buildTable, chooseGrid, layoutFor, loadPixels, packAtlas} from './table'
import type {Frame} from './sequence'
import {DEFAULT_INTERACTION, DEFAULT_TUNING, type Interaction, type Tuning} from './tuning'
export default {}

/** `#rrggbb` を WebGL のクリア色に変換する。ページ背景と canvas の余白を揃えるため */
function parseColor(hex: string): [number, number, number, number] {
  const value = Number.parseInt(hex.trim().replace('#', ''), 16)
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255, 1]
}

async function createScene(canvas: OffscreenCanvas, pixelRatio: number, photos: string[], ground: string) {
  const core = new Core({canvas, pixelRatio})

  // 粒子グリッドは起動時に一度だけ決める。以後は変わらない
  const textureLimit = core.gl.getParameter(core.gl.MAX_TEXTURE_SIZE) as number
  const grid = chooseGrid({textureLimit, count: photos.length})
  const imageAspect = grid.width / grid.height

  const tables = (await Promise.all(photos.map((url) => loadPixels(url, grid)))).map((px) => buildTable(px, grid))
  const layout = layoutFor(textureLimit, tables.length, grid)
  const atlas = packAtlas(tables, layout, grid)

  // 頂点ごとのランク。glaku の型は number[] だが内部で Float32Array に詰め直すだけ
  const rankIndices = Float32Array.from({length: grid.count}, (_, i) => i)
  const vao = new Vao(core, {attributes: {a_rank: rankIndices as unknown as number[]}})

  const program = new Program(core, {
    attributeTypes: {a_rank: 'float'},
    uniformTypes: {
      u_from: 'int',
      u_to: 'int',
      u_phase: 'float',
      u_fit: 'vec2',
      u_pointSize: 'float',
      u_staggerTotal: 'float',
      u_toneCurve: 'float',
      u_easePower: 'float',
      u_pointer: 'vec2',
      u_pointerVelocity: 'vec2',
      u_radius2: 'float',
      u_push: 'float',
      u_drag: 'float',
      u_massGain: 'float'
    },
    texture: {
      t_table: core.createTexture({array: atlas, width: layout.width, height: layout.height, filter: 'NEAREST'})
    },
    primitive: 'POINTS',
    vert: /* glsl */ `
      out vec3 v_color;

      // RGB に入っている元画素のインデックス(24bit LE)を NDC 座標に戻す
      vec2 decodePosition(vec4 texel) {
        vec3 byte = floor(texel.rgb * 255.0 + 0.5);
        int index = int(byte.r) + int(byte.g) * 256 + int(byte.b) * 65536;
        return vec2(
          (float(index % ${grid.width}) + 0.5) / ${grid.width}.0 * 2.0 - 1.0,
          1.0 - (float(index / ${grid.width}) + 0.5) / ${grid.height}.0 * 2.0
        );
      }

      // レイヤは横 ${layout.cols} 個ずつ並べ、あふれた分は下の段へ折り返す
      ivec2 addressOf(int layer, int col, int row) {
        return ivec2(
          (layer % ${layout.cols}) * ${grid.width} + col,
          (layer / ${layout.cols}) * ${grid.height} + row
        );
      }

      // p = 1 で等速、p = 3 で easeInOutCubic と一致する
      float easeInOut(float t, float p) {
        return t < 0.5 ? pow(2.0 * t, p) * 0.5 : 1.0 - pow(2.0 * (1.0 - t), p) * 0.5;
      }

      // 粒子の座標は写真の縦横それぞれで正規化されているので、そのまま距離を測ると
      // 縦1目盛りが横1目盛りより短くなり、力の効く範囲が横長の楕円になる。
      // 半幅を単位とする等方な空間で計算し、変位だけ元の空間へ戻す
      const vec2 TO_EVEN = vec2(1.0, 1.0 / ${imageAspect.toFixed(6)});
      const vec2 TO_NDC = vec2(1.0, ${imageAspect.toFixed(6)});

      // ポインタ起点の変位。速度に比例し、距離で減衰する。
      // まだ状態を持たないので、ポインタが止まれば即座に元の位置へ戻る
      vec2 disturbance(vec2 pos, float lum) {
        vec2 flow = u_pointerVelocity * TO_EVEN;
        float speed = length(flow);
        if (speed < 1e-4) return vec2(0.0);

        vec2 d = (pos - u_pointer) * TO_EVEN;
        float dist2 = dot(d, d);
        float falloff = exp(-dist2 / u_radius2);
        vec2 dir = dist2 > 1e-8 ? d * inversesqrt(dist2) : vec2(0.0);

        // 重い粒子は同じ力でも動きにくい
        float mass = clamp(1.0 + u_massGain * (2.0 * lum - 1.0), 0.2, 5.0);
        return falloff * (u_push * dir * speed + u_drag * flow) * TO_NDC / mass;
      }

      void main() {
        int k = int(a_rank);
        int col = k % ${grid.width};
        int row = k / ${grid.width};
        ivec2 addrFrom = addressOf(u_from, col, row);
        ivec2 addrTo   = addressOf(u_to,   col, row);

        // 1回のフェッチで座標と輝度の両方が取れる
        vec4 texFrom = texelFetch(t_table, addrFrom, 0);
        vec4 texTo   = texelFetch(t_table, addrTo,   0);
        vec2 pFrom = decodePosition(texFrom);
        vec2 pTo   = decodePosition(texTo);

        // 両端の平均を取った「暗さ」。暗いほど 1 に近い。
        // 平均にすることで逆再生でも同じ順序を辿る
        float darkness = 1.0 - (texFrom.a + texTo.a) * 0.5;

        // 暗い粒子ほど遅れて出発する。光が先に抜け、闇が後から追う
        float delay = pow(darkness, u_toneCurve) * u_staggerTotal;
        // 分母が 0 にならないよう、1粒子あたりの移動時間には下限を置く
        float span = max(1.0 - u_staggerTotal, 0.05);
        float local = easeInOut(clamp((u_phase - delay) / span, 0.0, 1.0), u_easePower);

        float lum = mix(texFrom.a, texTo.a, local);
        v_color = vec3(lum);

        vec2 pos = mix(pFrom, pTo, local);
        gl_Position = vec4((pos + disturbance(pos, lum)) * u_fit, 0.0, 1.0);
        gl_PointSize = u_pointSize;
      }`,
    frag: /* glsl */ `
      in vec3 v_color;
      out vec4 o_color;
      void main() {
        o_color = vec4(v_color, 1.0);
      }`
  })

  const renderer = new Renderer(core, {backgroundColor: parseColor(ground)})

  let frame: Frame = {from: 0, to: 0, phase: 0}
  // 粒子は u_fit を掛ける前の空間にいるので、ポインタも同じ空間へ戻してから渡す
  let fit = [1, 1]

  const applyTuning = (tuning: Tuning) =>
    program.setUniform({
      u_staggerTotal: tuning.staggerTotal,
      u_toneCurve: tuning.toneCurve,
      u_easePower: tuning.easePower
    })

  const applyInteraction = (interaction: Interaction) =>
    program.setUniform({
      u_radius2: interaction.radius * interaction.radius,
      u_push: interaction.push,
      u_drag: interaction.drag,
      u_massGain: interaction.massGain
    })

  const draw = () => {
    program.setUniform({u_from: frame.from, u_to: frame.to, u_phase: frame.phase})
    renderer.clear()
    renderer.render(vao, program)
  }

  const resize = ({width, height}: {width: number; height: number}) => {
    renderer.resize({width, height})
    // 画像を歪めずに収める
    const canvasAR = width / height
    fit = canvasAR > imageAspect ? [imageAspect / canvasAR, 1] : [1, canvasAR / imageAspect]
    // 点サイズはピクセル単位に丸められるので、切り上げないと格子状の隙間が出る。
    // 重なる分には後から描かれる明るい粒子が上書きするだけで害がない
    const pointSize = Math.max(1, Math.ceil((height * pixelRatio * fit[1]) / grid.height))
    program.setUniform({u_fit: fit, u_pointSize: pointSize})
  }

  applyTuning(DEFAULT_TUNING)
  applyInteraction(DEFAULT_INTERACTION)
  resize({width: core.canvasWidth, height: core.canvasHeight})

  return {
    resize,
    draw,
    tune: applyTuning,
    interact: applyInteraction,
    setPointer({x, y, vx, vy}: PointerCommand) {
      program.setUniform({u_pointer: [x / fit[0], y / fit[1]], u_pointerVelocity: [vx / fit[0], vy / fit[1]]})
    },
    setFrame(next: Frame) {
      frame = next
    }
  }
}

/** ポインタの位置と速度。どちらも写真の半幅を 1 とした NDC（速度は 1秒あたり） */
export type PointerCommand = {x: number; y: number; vx: number; vy: number}

/** メインスレッドからの指示。届いた順に積み上げ、シーンができた時点で適用する */
export type Command = {
  canvas?: OffscreenCanvas
  pixelRatio?: number
  photos?: string[]
  /** ページ背景の色。canvas の余白をこれに合わせる */
  ground?: string
  resize?: {width: number; height: number}
  render?: Frame
  tuning?: Tuning
  interaction?: Interaction
  pointer?: PointerCommand
}

type Scene = Awaited<ReturnType<typeof createScene>>

const pending: Command = {}
let scene: Scene | null = null
let booting = false

/** uniform を全部入れてから1回だけ描く */
const apply = (command: Command) => {
  if (!scene) return
  if (command.tuning) scene.tune(command.tuning)
  if (command.interaction) scene.interact(command.interaction)
  if (command.resize) scene.resize(command.resize)
  if (command.pointer) scene.setPointer(command.pointer)
  if (command.render) scene.setFrame(command.render)
  scene.draw()
}

onmessage = ({data}: {data: Command}) => {
  Object.assign(pending, data)
  if (scene) return apply(data)
  if (booting || !pending.canvas || !pending.photos) return

  booting = true
  createScene(pending.canvas, pending.pixelRatio ?? 1, pending.photos, pending.ground ?? '#000').then((created) => {
    scene = created
    apply(pending)
  })
}
