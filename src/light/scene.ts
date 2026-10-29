import {type Core, Program, Renderer, Vao, plane2D} from 'glaku'
import {LOGO_HEIGHT, LOGO_RECTS, LOGO_WIDTH} from './logo'
import {DEFAULT_LIGHT, type LightTuning} from './tuning'

// 光源から出た光線が mu のロゴに当たって跳ね返る様子を、光線の通った線を重ねて描く（2D の光の経路追跡）。
// 光そのものは描かず、光線の線の重なりの明るさで光を見せる。ロゴに遮られたところは影になる。
// ロゴは部屋（ページの中の要素）の中央に置く。ロゴは光をばらばらの向きに散らして返し、ロゴに当たらなかった光線はそこで終わる。
// 光源は 2 つ。上の光（u_light）と、部屋の床の上に置く下の光（u_under）。どちらもロゴの中心を向くスポット。ロゴの切り込みの
// うち 2 本は下に開いていて、上の光は奥まで入らないので、下の光で下から照らす。光線の数は 2 つで分け合う。
//
// 速さのための作り:
// - ロゴは長方形 7 つ（logo.ts）なので、光線との交わりを式で直接求める。少しずつ進めて当たりを探さない
// - 光線の経路は線を描く頂点シェーダの中で求める。頂点 1 つが「何本目の光線の、何回目の跳ね返りの、始点か終点か」
//   を受け持ち、その点までの経路を自分で計算する。経路を一度テクスチャに書き出す段を挟まない
// - 光線の向きは全周を等分した区画の中で毎フレームずらし、前のフレームの結果と混ぜて、光線のすき間をならす。
//   光が動いたときは、前のフレームの結果を光が動いたぶんずらしてから混ぜる（跡を引かない）。ロゴや光が動いているあいだは
//   前の結果を残す割合を弱め（keepMoving）、跡を引かないようにする。止まるとなめらかに元の割合（keep）へ戻す
// - 光をためる層は画面より粗い解像度（resolution）で持ち、画面へはなめらかに拡大する

/** 動いているとみなす、1 フレームでのロゴと光の動き px。これ以上動いたら、残す割合を動いているときの値にする */
const MOVING_PX = 2

/** 止まってから、残す割合が元へ戻る速さ。1 フレームごとに、動いている度合いをこの割合に減らす */
const SETTLE_RATE = 0.9

/** 1 本の光線が描く線分の数の上限（光源からの 1 本 + 跳ね返り 8 回）。tuning.ts の跳ね返りの上限と合わせる */
const MAX_SEGMENTS = 9

const HALF_FLOAT = [['RGBA16F', 'RGBA', 'HALF_FLOAT', 'LINEAR', 'CLAMP_TO_EDGE']] as const

/**
 * 光がロゴを照らす場面。舞台の canvas（src/scene/worker.ts）の中で、写真の粒子と一緒に描く。光は層（texture）にためて、
 * 舞台がそれを明るさに直して重ねる。光がついているあいだだけ描く（lit）
 */
export function createLightScene(core: Core, pixelRatio: number) {
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

  const rays = new Program(core, {
    id: 'rays',
    primitive: 'LINES',
    attributeTypes: {a_index: 'float'},
    uniformTypes: {
      u_size: 'vec2',
      u_light: 'vec2',
      u_lightSize: 'float',
      u_cone: 'float',
      u_focus: 'float',
      u_rays: 'float',
      u_bounces: 'float',
      u_albedo: 'float',
      u_power: 'float',
      u_seed: 'float',
      u_under: 'vec2',
      u_aim: 'vec2',
      u_underRays: 'float',
      u_underPower: 'float',
      u_underSize: 'float',
      u_underCone: 'float',
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

      // 光線 ro + rd t が最初にロゴに当たるところまでの距離と、当たった面の向き（normal）。当たれば solid。
      // 当たらなければ遠くまで伸ばす（画面の外は描かれない）
      float trace(vec2 ro, vec2 rd, out vec2 normal, out bool solid) {
        vec2 safe = mix(rd, vec2(1e-6), lessThan(abs(rd), vec2(1e-6)));
        vec2 inv = 1.0 / safe;
        float best = 1e5;
        normal = vec2(0.0);
        solid = false;
        for (int i = 0; i < ${LOGO_RECTS.length}; i++) hitRect(ro, rd, inv, u_rects[i], best, normal, solid);
        return best;
      }

      void main() {
        // 頂点は光線ごとに「線分の数 × 2」個並ぶ
        int segments = int(u_bounces) + 1;
        int id = gl_VertexID;
        int end = id % 2;
        int seg = (id / 2) % segments;
        int ray = id / (2 * segments);
        v_energy = a_index * 0.0;

        // 先頭の u_underRays 本は下の光、残りは上の光から出す。どちらも出す範囲を等分した区画の中でフレームごとにずらす
        vec2 pos;
        vec2 dir;
        float energy;
        if (float(ray) < u_underRays) {
          // 半径 u_underSize の円の中から、ロゴの中心を向く円錐（中心の向きから左右に u_underCone）に出す。
          // 中心の向きが一番明るく、端に向かってなめらかに 0 になる（上の光を絞りきったときと同じ）
          vec2 aim = u_aim - u_under;
          float across = 2.0 * (float(ray) + rand(ray, 0)) / u_underRays - 1.0;
          float angle = atan(aim.y, aim.x) + across * u_underCone;
          float spread = TAU * rand(ray, ${MAX_SEGMENTS + 1});
          pos = u_under + u_underSize * sqrt(rand(ray, ${MAX_SEGMENTS + 2})) * vec2(cos(spread), sin(spread));
          dir = vec2(cos(angle), sin(angle));
          float falloff = cos(across * TAU * 0.25);
          energy = u_underPower * falloff * falloff / (u_underRays * 0.5);
        } else {
          // 絞れ具合（u_focus）が 0 なら全周に均一に出す。1 ならロゴの中心を向く円錐（中心の向きから左右に u_cone）だけに出し、
          // 真下が一番明るく、端に向かってなめらかに 0 になるよう重みを付ける。あいだは広がりも重みもなめらかに移す。
          // 出す範囲を光線の数で等分する。重みの平均（均一なら 1、cos² なら 1/2）で割り、全体の強さは u_power のまま
          // 光は半径 u_lightSize の円の中のどこかから出す。点から出すと影の縁がくっきりして、光の筋のように見える
          float pointRays = u_rays - u_underRays;
          float across = 2.0 * (float(ray) - u_underRays + rand(ray, 0)) / pointRays - 1.0;
          vec2 aim = u_aim - u_light;
          float angle = atan(aim.y, aim.x) + across * mix(TAU * 0.5, u_cone, u_focus);
          float spread = TAU * rand(ray, ${MAX_SEGMENTS + 1});
          pos = u_light + u_lightSize * sqrt(rand(ray, ${MAX_SEGMENTS + 2})) * vec2(cos(spread), sin(spread));
          dir = vec2(cos(angle), sin(angle));
          float falloff = cos(across * TAU * 0.25);
          energy = u_power * mix(1.0, falloff * falloff, u_focus) / (pointRays * mix(1.0, 0.5, u_focus));
        }
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
          // ロゴに当たらなかった光線はそこで終わる
          if (!solid) {
            energy = 0.0;
            break;
          }
          // ばらばらの向きに散る。面の向きに近いほど多く返す（2D の完全拡散）
          float sn = 2.0 * rand(ray, s + 1) - 1.0;
          dir = normal * sqrt(1.0 - sn * sn) + vec2(-normal.y, normal.x) * sn;
          energy *= u_albedo;
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
    uniformTypes: {u_keep: 'float', u_shift: 'vec2'},
    texture: {t_prev: acc[0].renderTexture[0], t_frame: frameLayer.renderTexture[0]},
    vert: quadVert,
    frag: /* glsl */ `
      in vec2 v_uv;
      out vec4 o_color;
      void main() {
        o_color = vec4(mix(texture(t_frame, v_uv).rgb, texture(t_prev, v_uv + u_shift).rgb, u_keep), 1.0);
      }`
  })
  let tuning: LightTuning = DEFAULT_LIGHT
  let size = {width: 1, height: 1}
  let lines: Vao | null = null
  let lineCount = 0
  let seed = 0
  let fresh = true
  /** 光がついているか。消えているあいだは層を空にしてあり、舞台は重ねない */
  let lit = false
  /** 前のフレームの光の位置。前の結果をずらす量を出す */
  let lastLight = {x: 0, y: 0}
  /** 前のフレームのロゴの左上 */
  let lastLogo = {x: 0, y: 0}
  /** 動いている度合い（0〜1）。動くと上がり、止まるとなめらかに 0 へ戻る */
  let moving = 0

  const layout = () => {
    const {width, height} = size
    rays.setUniform({u_size: [width, height]})
    const scale = pixelRatio * (tuning.resolution / 100)
    for (const r of [frameLayer, ...acc]) r.resize({width, height, pixelRatio: scale})
    fresh = true
  }

  const tune = (next: LightTuning) => {
    tuning = next
    rays.setUniform({
      u_rays: tuning.rays,
      u_bounces: tuning.bounces,
      u_albedo: tuning.albedo / 100,
      u_lightSize: tuning.lightSize,
      u_underSize: tuning.underSize,
      u_underCone: (tuning.underCone * Math.PI) / 180,
      u_cone: (tuning.cone * Math.PI) / 180
    })
    // 頂点の数は光線の数と跳ね返りの回数で決まるので、変わったら作り直す
    const count = tuning.rays * (tuning.bounces + 1) * 2
    if (count !== lineCount) {
      lineCount = count
      lines = new Vao(core, {attributes: {a_index: new Float32Array(count) as unknown as number[]}})
    }
    layout()
  }

  /**
   * 1 フレーム描く。extra は、光線を描いた 1 フレームぶんの層に、加算の合成のまま重ねて描くもの（光へ飛んでいる粒子）。
   * 描いたら true を返す。そのあいだは動いているものとして、前のフレームを残す割合を弱める
   */
  const draw = (
    {on, light, logo, home, floor, brightness, under, focus}: LightFrame,
    extra?: (target: Renderer) => boolean
  ) => {
    if (!lines) return
    // 消えているあいだは何も描かない。前の結果も捨て、次につくときはそのフレームだけで描き始める
    if (!on) {
      lit = false
      fresh = true
      return
    }
    lit = true
    // ロゴは画素にそろえて置く
    const unit = tuning.cell / 2
    const left = Math.round(logo.x - (LOGO_WIDTH * unit) / 2)
    const top = Math.round(logo.y - (LOGO_HEIGHT * unit) / 2)
    const {width, height} = size
    blend.setUniform({u_shift: [-(light.x - lastLight.x) / width, (light.y - lastLight.y) / height]})
    const moved =
      Math.hypot(light.x - lastLight.x, light.y - lastLight.y) + Math.hypot(left - lastLogo.x, top - lastLogo.y)
    moving = Math.max(Math.min(1, moved / MOVING_PX), moving * SETTLE_RATE)
    lastLight = light
    lastLogo = {x: left, y: top}
    seed = (seed + 1) % 1_000_000
    rays.setUniform({
      u_seed: seed,
      u_power: tuning.power * brightness,
      u_light: [light.x, light.y],
      u_focus: focus,
      // 照明はロゴのもとの位置に合わせて固定する。どちらの光もそこを向き、下の光はその真下から underShift ずらした床の上に
      // 置く。ロゴを動かしても照明は動かないので、光の外へ動かすと暗くなる。消えているあいだは下の光に光線を回さない
      u_aim: [home.x, home.y],
      u_under: [home.x + tuning.underShift, floor - tuning.underHeight],
      u_underRays: under > 0 ? Math.round((tuning.rays * tuning.underShare) / 100) : 0,
      u_underPower: tuning.underPower * under,
      u_rects: LOGO_RECTS.flatMap(([l, t, r, b]) => [left + l * unit, top + t * unit, left + r * unit, top + b * unit])
    })

    frameLayer.clear()
    core.blend('ADDITIVE')
    frameLayer.render(lines, rays)
    if (extra?.(frameLayer)) moving = 1
    core.gl.disable(core.gl.BLEND)

    // 大きさが変わった直後は前の結果が無いので、このフレームだけで描く
    const keep = (tuning.keep + (tuning.keepMoving - tuning.keep) * moving) / 100
    blend.setUniform({u_keep: fresh ? 0 : keep})
    blend.setTexture({t_prev: acc[0].renderTexture[0]})
    acc[1].render(plane, blend)
    acc.reverse()
    fresh = false
  }

  tune(tuning)
  return {
    resize: (next: {width: number; height: number}) => {
      if (next.width <= 0 || next.height <= 0) return
      size = next
      layout()
    },
    tune,
    draw,
    /** ためた光の層。消えているあいだは null */
    layer: () => (lit ? acc[0].renderTexture[0] : null)
  }
}

/** メインスレッドからの指示 */
export type LightCommand = {
  tuning?: LightTuning
  /** 1 フレーム描く */
  frame?: LightFrame
}

/** 1 フレームぶんの光の状態。位置はどれも canvas の左上からの px */
export type LightFrame = {
  /** 光の層を描くか。粒子が光へ向けて飛び始めたら描く（光が明るくなるのは粒子が着いてから） */
  on: boolean
  light: {x: number; y: number}
  /** ロゴの中心 */
  logo: {x: number; y: number}
  /** ロゴのもとの位置の中心。照明はここに合わせて固定する（どちらの光もここを向き、下の光はこの真下に置く） */
  home: {x: number; y: number}
  /** 部屋の床の高さ。下の光はこの上に置く */
  floor: number
  /** 上の光の明るさの割合 */
  brightness: number
  /** 下の光の明るさの割合 */
  under: number
  /** 上の光の絞れ具合。0 で全周に均一、1 で下向きに絞りきる（tuning の cone） */
  focus: number
}
