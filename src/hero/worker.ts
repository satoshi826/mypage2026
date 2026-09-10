import {Core, Vao, Program, Renderer} from 'glaku'
import {buildTable, chooseGrid, layoutFor, loadPixels, packAtlas} from './table'
import type {Frame} from './sequence'
import {DEFAULT_TUNING, type Tuning} from './tuning'
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
      u_easePower: 'float'
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

        v_color = vec3(mix(texFrom.a, texTo.a, local));

        gl_Position = vec4(mix(pFrom, pTo, local) * u_fit, 0.0, 1.0);
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

  const applyTuning = (tuning: Tuning) =>
    program.setUniform({
      u_staggerTotal: tuning.staggerTotal,
      u_toneCurve: tuning.toneCurve,
      u_easePower: tuning.easePower
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
    const fit = canvasAR > imageAspect ? [imageAspect / canvasAR, 1] : [1, canvasAR / imageAspect]
    // 点サイズはピクセル単位に丸められるので、切り上げないと格子状の隙間が出る。
    // 重なる分には後から描かれる明るい粒子が上書きするだけで害がない
    const pointSize = Math.max(1, Math.ceil((height * pixelRatio * fit[1]) / grid.height))
    program.setUniform({u_fit: fit, u_pointSize: pointSize})
    draw()
  }

  applyTuning(DEFAULT_TUNING)
  resize({width: core.canvasWidth, height: core.canvasHeight})

  return {
    resize,
    tune(tuning: Tuning) {
      applyTuning(tuning)
      draw()
    },
    render(next: Frame) {
      frame = next
      draw()
    }
  }
}

/** メインスレッドからの指示。届いた順に積み上げ、シーンができた時点で適用する */
type Command = {
  canvas?: OffscreenCanvas
  pixelRatio?: number
  photos?: string[]
  /** ページ背景の色。canvas の余白をこれに合わせる */
  ground?: string
  resize?: {width: number; height: number}
  render?: Frame
  tuning?: Tuning
}

type Scene = Awaited<ReturnType<typeof createScene>>

const pending: Command = {}
let scene: Scene | null = null
let booting = false

/** uniform を先に入れてから寸法を決め、最後に描く */
const apply = (command: Command) => {
  if (command.tuning) scene?.tune(command.tuning)
  if (command.resize) scene?.resize(command.resize)
  if (command.render) scene?.render(command.render)
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
