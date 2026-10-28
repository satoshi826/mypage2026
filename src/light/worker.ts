import {Core, Program, Renderer, Vao, plane2D} from 'glaku'
import {LOGO_HEIGHT, LOGO_RECTS, LOGO_WIDTH} from './logo'
import {DEFAULT_LIGHT, type LightTuning} from './tuning'

// 光源から出た光線が mu のロゴに当たって跳ね返る様子を、光線の通った線を重ねて描く（2D の光の経路追跡）。
// 光そのものは描かず、光線の線の重なりの明るさで光を見せる。ロゴに遮られたところは影になる。
// 画面の端は光を返す壁にでき（wall）、壁で跳ね返った光がロゴを横や下からも照らす。
//
// 速さのための作り:
// - ロゴは長方形 7 つ（logo.ts）なので、光線との交わりを式で直接求める。少しずつ進めて当たりを探さない
// - 光線の経路は線を描く頂点シェーダの中で求める。頂点 1 つが「何本目の光線の、何回目の跳ね返りの、始点か終点か」
//   を受け持ち、その点までの経路を自分で計算する。経路を一度テクスチャに書き出す段を挟まない
// - 光線の向きは全周を等分した区画の中で毎フレームずらし、前のフレームの結果と混ぜて、光線のすき間をならす
// - 光をためる層は画面より粗い解像度（resolution）で持ち、画面へはなめらかに拡大する

/** 1 本の光線が描く線分の数の上限（光源からの 1 本 + 跳ね返り 3 回） */
const MAX_SEGMENTS = 4

const HALF_FLOAT = [['RGBA16F', 'RGBA', 'HALF_FLOAT', 'LINEAR', 'CLAMP_TO_EDGE']] as const

function createScene(canvas: OffscreenCanvas, pixelRatio: number) {
  const core = new Core({canvas, pixelRatio})
  core.gl.getExtension('EXT_color_buffer_float')

  const layer = () =>
    new Renderer(core, {
      frameBuffer: HALF_FLOAT.map((args) => [...args]) as never,
      screenFit: false,
      backgroundColor: [0, 0, 0, 0],
      width: 1,
      height: 1
    })
  // 1 フレームぶんの光線（frame）と、前のフレームと混ぜた結果（acc を 2 枚交互に使う）
  const frameLayer = layer()
  const acc = [layer(), layer()]
  const screen = new Renderer(core, {id: 'canvas', backgroundColor: [0, 0, 0, 0]})

  const rays = new Program(core, {
    id: 'rays',
    primitive: 'LINES',
    attributeTypes: {a_index: 'float'},
    uniformTypes: {
      u_size: 'vec2',
      u_light: 'vec2',
      u_rays: 'float',
      u_bounces: 'float',
      u_albedo: 'float',
      u_wall: 'float',
      u_specular: 'float',
      u_power: 'float',
      u_seed: 'float',
      u_rects: `vec4[${LOGO_RECTS.length}]`
    },
    vert: /* glsl */ `
      out float v_energy;

      const float TAU = 6.28318530718;

      float hash(uint h) {
        h = h * 747796405u + 2891336453u;
        h = ((h >> ((h >> 28) + 4u)) ^ h) * 277803737u;
        return float((h >> 22u) ^ h) / 4294967295.0;
      }
      // 光線ごと、跳ね返りごと、フレームごとの乱数
      float rand(int ray, int k) {
        return hash(uint(ray) * 1664525u + uint(k) * 1013904223u + uint(u_seed) * 2654435761u);
      }

      // 長方形 r（左上と右下）に、今の best より手前で当たれば、best と面の向きを書き換える
      void hitRect(vec2 ro, vec2 rd, vec2 inv, vec4 r, inout float best, inout vec2 normal, inout bool solid) {
        vec2 a = (r.xy - ro) * inv;
        vec2 b = (r.zw - ro) * inv;
        vec2 near = min(a, b);
        vec2 far = max(a, b);
        float tNear = max(near.x, near.y);
        float tFar = min(far.x, far.y);
        if (tNear < tFar && tNear > 1e-3 && tNear < best) {
          best = tNear;
          solid = true;
          normal = near.x > near.y ? vec2(-sign(rd.x), 0.0) : vec2(0.0, -sign(rd.y));
        }
      }

      // 光線 ro + rd t が最初に当たるところまでの距離と、当たった面の向き（normal）。ロゴに当たれば solid。
      // ロゴに当たらなければ、画面の端（壁）に当たるところまで
      float trace(vec2 ro, vec2 rd, out vec2 normal, out bool solid) {
        vec2 safe = mix(rd, vec2(1e-6), lessThan(abs(rd), vec2(1e-6)));
        vec2 inv = 1.0 / safe;
        vec2 far = max(-ro * inv, (u_size - ro) * inv);
        float best = min(far.x, far.y);
        solid = false;
        normal = far.x < far.y ? vec2(-sign(rd.x), 0.0) : vec2(0.0, -sign(rd.y));
        for (int i = 0; i < ${LOGO_RECTS.length}; i++) hitRect(ro, rd, inv, u_rects[i], best, normal, solid);
        return best;
      }

      void main() {
        int id = gl_VertexID;
        int end = id % 2;
        int seg = (id / 2) % ${MAX_SEGMENTS};
        int ray = id / ${2 * MAX_SEGMENTS};
        v_energy = a_index * 0.0;
        if (float(seg) > u_bounces) {
          gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
          return;
        }

        // 全周を光線の数で等分し、その区画の中でフレームごとに向きをずらす
        float angle = (float(ray) + rand(ray, 0)) / u_rays * TAU;
        vec2 pos = u_light;
        vec2 dir = vec2(cos(angle), sin(angle));
        float energy = u_power / u_rays;
        vec2 a = pos;
        vec2 b = pos;
        for (int s = 0; s < ${MAX_SEGMENTS}; s++) {
          vec2 normal;
          bool solid;
          float t = trace(pos, dir, normal, solid);
          vec2 next = pos + dir * t;
          if (s == seg) {
            a = pos;
            b = next;
            break;
          }
          // 壁に当たった光線は、壁が光を返さないならそこで終わる
          float albedo = solid ? u_albedo : u_wall;
          if (albedo <= 0.0) {
            energy = 0.0;
            break;
          }
          if (rand(ray, s * 2 + 1) < u_specular) {
            dir = reflect(dir, normal);
          } else {
            // ばらばらの向きに散る。面の向きに近いほど多く返す（2D の完全拡散）
            float sn = 2.0 * rand(ray, s * 2 + 2) - 1.0;
            dir = normal * sqrt(1.0 - sn * sn) + vec2(-normal.y, normal.x) * sn;
          }
          energy *= albedo;
          pos = next + normal * 0.01;
        }

        // 線は長い向きの画素数だけ塗られるので、斜めの線が暗くならないよう長さとの比を掛ける
        vec2 d = b - a;
        float extent = max(abs(d.x), abs(d.y));
        v_energy = energy * (extent > 0.0 ? length(d) / extent : 1.0);
        vec2 p = end == 0 ? a : b;
        gl_Position = vec4(p.x / u_size.x * 2.0 - 1.0, 1.0 - p.y / u_size.y * 2.0, 0.0, 1.0);
      }`,
    frag: /* glsl */ `
      in float v_energy;
      out vec4 o_color;
      void main() {
        o_color = vec4(vec3(v_energy), 1.0);
      }`
  })

  const plane = new Vao(core, plane2D())
  const quadVert = /* glsl */ `
    out vec2 v_uv;
    void main() {
      v_uv = a_textureCoord;
      gl_Position = vec4(a_position, 0.0, 1.0);
    }`
  // 前のフレームの結果と、このフレームの光線を混ぜる
  const blend = new Program(core, {
    id: 'blend',
    attributeTypes: {a_position: 'vec2', a_textureCoord: 'vec2'},
    uniformTypes: {u_keep: 'float'},
    texture: {t_prev: acc[0].renderTexture[0], t_frame: frameLayer.renderTexture[0]},
    vert: quadVert,
    frag: /* glsl */ `
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        o_color = vec4(mix(texture(t_frame, v_uv).rgb, texture(t_prev, v_uv).rgb, u_keep), 1.0);
      }`
  })
  // 画面へ。たまった光の量を明るさに直し、白い光として地の上に重ねる（プリマルチプライド）
  const present = new Program(core, {
    id: 'present',
    attributeTypes: {a_position: 'vec2', a_textureCoord: 'vec2'},
    texture: {t_light: acc[0].renderTexture[0]},
    vert: quadVert,
    frag: /* glsl */ `
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        float c = 1.0 - exp(-texture(t_light, v_uv).r);
        o_color = vec4(vec3(c), c);
      }`
  })

  let tuning: LightTuning = DEFAULT_LIGHT
  let size = {width: 1, height: 1}
  let lines: Vao | null = null
  let lineRays = 0
  let seed = 0
  let fresh = true

  const layout = () => {
    const {width, height} = size
    const unit = tuning.cell / 2
    // 画素にそろえる
    const left = Math.round(width / 2 - (LOGO_WIDTH * unit) / 2)
    const top = Math.round((height * tuning.logoY) / 100 - (LOGO_HEIGHT * unit) / 2)
    rays.setUniform({
      u_size: [width, height],
      u_light: [width / 2, (height * tuning.lightY) / 100],
      u_rects: LOGO_RECTS.flatMap(([l, t, r, b]) => [left + l * unit, top + t * unit, left + r * unit, top + b * unit])
    })
    const scale = pixelRatio * (tuning.resolution / 100)
    for (const r of [frameLayer, ...acc]) r.resize({width, height, pixelRatio: scale})
    screen.resize({width, height, pixelRatio})
    fresh = true
  }

  const tune = (next: LightTuning) => {
    tuning = next
    rays.setUniform({
      u_rays: tuning.rays,
      u_bounces: tuning.bounces,
      u_albedo: tuning.albedo / 100,
      u_wall: tuning.wall / 100,
      u_specular: tuning.specular / 100,
      u_power: tuning.power
    })
    // 頂点の数は光線の数で決まるので、変わったら作り直す
    if (tuning.rays !== lineRays) {
      lineRays = tuning.rays
      const count = lineRays * MAX_SEGMENTS * 2
      lines = new Vao(core, {attributes: {a_index: new Float32Array(count) as unknown as number[]}})
    }
    layout()
  }

  const draw = () => {
    if (!lines) return
    seed = (seed + 1) % 1_000_000
    rays.setUniform({u_seed: seed})

    frameLayer.clear()
    core.blend('ADDITIVE')
    frameLayer.render(lines, rays)
    core.gl.disable(core.gl.BLEND)

    // 大きさが変わった直後は前の結果が無いので、このフレームだけで描く
    blend.setUniform({u_keep: fresh ? 0 : tuning.keep / 100})
    blend.setTexture({t_prev: acc[0].renderTexture[0]})
    acc[1].render(plane, blend)
    acc.reverse()
    fresh = false

    present.setTexture({t_light: acc[0].renderTexture[0]})
    screen.clear()
    screen.render(plane, present)
  }

  tune(tuning)
  return {
    resize: (next: {width: number; height: number}) => {
      if (next.width <= 0 || next.height <= 0) return
      size = next
      layout()
    },
    tune,
    draw
  }
}

/** メインスレッドからの指示 */
export type LightCommand = {
  canvas?: OffscreenCanvas
  pixelRatio?: number
  resize?: {width: number; height: number}
  tuning?: LightTuning
  /** 1 フレーム描く */
  frame?: boolean
}

let scene: ReturnType<typeof createScene> | null = null
const pending: LightCommand = {}

onmessage = ({data}: {data: LightCommand}) => {
  Object.assign(pending, data)
  if (!scene) {
    if (!pending.canvas) return
    scene = createScene(pending.canvas, pending.pixelRatio ?? 1)
    if (pending.tuning) scene.tune(pending.tuning)
    if (pending.resize) scene.resize(pending.resize)
    return
  }
  if (data.tuning) scene.tune(data.tuning)
  if (data.resize) scene.resize(data.resize)
  if (data.frame) scene.draw()
}
