import {type Core, Program, Renderer, Vao, plane2D} from 'glaku'
import {LOGO_HEIGHT, LOGO_RECTS, LOGO_WIDTH} from './logo'
import {DEFAULT_LIGHT, type LightTuning} from './tuning'

// 光源から出た光線が mu のロゴに当たって跳ね返る様子を、光線の通った線を重ねて描く（2D の光の経路追跡）。
// 光そのものは描かず、光線の線の重なりの明るさで光を見せる。ロゴに遮られたところは影になる。
// ロゴは部屋（ページの中の要素）の中央に置く。ロゴは光をばらばらの向きに散らして返し、ロゴに当たらなかった光線はそこで終わる。
// ロゴの素材は 3 つ。白い面（ばらばらの向きに散らして返す）と、和紙（u_paper）と、つや（u_gloss）。素材を切り替えるあいだは、
// 光線ごとに今の素材と次の素材を割合で選ぶ。
// - 和紙: 当たった光線の一部が中へ入り、中であちこちに散ってから、どこかの面からばらばらの向きに出る。文字が内側から明るくなる
// - つや: 当たった光線の一部が、鏡の向きの近くにぼけて返る。光に向いた縁に柔らかいハイライトが出る
// 光源は 2 つ。上の光（u_light）と、部屋の床の上に置く下の光（u_under）。どちらも向き（u_lightAngle、u_underAngle）を持つ
// スポットで、ふだんはロゴの今の位置を向く（訪問者がフッターの設定で変えられる。Light.tsx）。ロゴの切り込みのうち 2 本は下に開いていて、
// 上の光は奥まで入らないので、下の光で下から照らす。光線の数は 2 つで分け合う。
// 光線の数は端末の速さに合わせてメインスレッドが決め（rayBudget.ts）、フレームの合間に変わる。
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
      u_scale: 'float',
      u_light: 'vec2',
      u_lightSize: 'float',
      u_cone: 'float',
      u_focus: 'float',
      u_rays: 'float',
      u_bounces: 'float',
      u_albedo: 'float',
      u_paper: 'float',
      u_scatter: 'float',
      u_gloss: 'float',
      u_rough: 'float',
      u_power: 'float',
      u_seed: 'float',
      u_lightAngle: 'float',
      u_under: 'vec2',
      u_underAngle: 'float',
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

      // 和紙のロゴの中（ro）から rd へ進んだ光線が、ロゴの外へ出るところまでの距離と、出る面の外向きの向き（normal）。
      // 長方形どうしは辺を接しているので、出た先が隣の長方形の中なら、そのまま通り抜けて先を探す
      float traceInside(vec2 ro, vec2 rd, out vec2 normal) {
        vec2 safe = mix(rd, vec2(1e-6), lessThan(abs(rd), vec2(1e-6)));
        vec2 inv = 1.0 / safe;
        float t = 0.0;
        normal = rd;
        for (int k = 0; k < ${LOGO_RECTS.length}; k++) {
          vec2 p = ro + rd * (t + 1e-3);
          int found = -1;
          for (int i = 0; i < ${LOGO_RECTS.length}; i++) {
            vec4 r = u_rects[i];
            if (all(greaterThanEqual(p, r.xy)) && all(lessThanEqual(p, r.zw))) found = i;
          }
          if (found < 0) break;
          vec4 r = u_rects[found];
          vec2 far = max((r.xy - ro) * inv, (r.zw - ro) * inv);
          t = min(far.x, far.y);
          normal = far.x < far.y ? vec2(sign(rd.x), 0.0) : vec2(0.0, sign(rd.y));
        }
        return t;
      }

      // 面の向き n の側へ、ばらばらの向きに出す。面の向きに近いほど多く出す（2D の完全拡散）。r は 0〜1 の乱数
      vec2 diffuse(vec2 n, float r) {
        float sn = 2.0 * r - 1.0;
        return n * sqrt(1.0 - sn * sn) + vec2(-n.y, n.x) * sn;
      }

      void main() {
        // 頂点は光線ごとに「線分の数 × 2」個並ぶ
        int segments = int(u_bounces) + 1;
        int id = gl_VertexID;
        int end = id % 2;
        int seg = (id / 2) % segments;
        int ray = id / (2 * segments);
        v_energy = a_index * 0.0;
        // 頂点は上限の本数ぶん並べてある。今の本数を超える光線は、画面の外へ置いて描かない
        if (float(ray) >= u_rays) {
          gl_Position = vec4(2.0, 2.0, 0.0, 1.0);
          return;
        }

        // 先頭の u_underRays 本は下の光、残りは上の光から出す。どちらも出す範囲を等分した区画の中でフレームごとにずらす
        vec2 pos;
        vec2 dir;
        float energy;
        if (float(ray) < u_underRays) {
          // 半径 u_underSize の円の中から、向き u_underAngle の円錐（中心の向きから左右に u_underCone）に出す。
          // 中心の向きが一番明るく、端に向かってなめらかに 0 になる（上の光を絞りきったときと同じ）
          float across = 2.0 * (float(ray) + rand(ray, 0)) / u_underRays - 1.0;
          float angle = u_underAngle + across * u_underCone;
          float spread = TAU * rand(ray, ${MAX_SEGMENTS + 1});
          pos = u_under + u_underSize * sqrt(rand(ray, ${MAX_SEGMENTS + 2})) * vec2(cos(spread), sin(spread));
          dir = vec2(cos(angle), sin(angle));
          float falloff = cos(across * TAU * 0.25);
          energy = u_underPower * falloff * falloff / (u_underRays * 0.5);
        } else {
          // 絞れ具合（u_focus）が 0 なら全周に均一に出す。1 なら向き u_lightAngle の円錐（中心の向きから左右に u_cone）だけに出し、
          // 真下が一番明るく、端に向かってなめらかに 0 になるよう重みを付ける。あいだは広がりも重みもなめらかに移す。
          // 出す範囲を光線の数で等分する。重みの平均（均一なら 1、cos² なら 1/2）で割り、全体の強さは u_power のまま
          // 光は半径 u_lightSize の円の中のどこかから出す。点から出すと影の縁がくっきりして、光の筋のように見える
          float pointRays = u_rays - u_underRays;
          float across = 2.0 * (float(ray) - u_underRays + rand(ray, 0)) / pointRays - 1.0;
          float angle = u_lightAngle + across * mix(TAU * 0.5, u_cone, u_focus);
          float spread = TAU * rand(ray, ${MAX_SEGMENTS + 1});
          pos = u_light + u_lightSize * sqrt(rand(ray, ${MAX_SEGMENTS + 2})) * vec2(cos(spread), sin(spread));
          dir = vec2(cos(angle), sin(angle));
          float falloff = cos(across * TAU * 0.25);
          energy = u_power * mix(1.0, falloff * falloff, u_focus) / (pointRays * mix(1.0, 0.5, u_focus));
        }
        vec2 a = pos;
        vec2 b = pos;
        // 光線が和紙のロゴの中にいるか
        bool inside = false;
        for (int s = 0; s < ${MAX_SEGMENTS}; s++) {
          vec2 normal;
          bool solid;
          float t;
          // 和紙の中では、外へ出る面に着く前に散ることがある。散るまでの長さは平均 u_scatter の指数分布
          bool scatter = false;
          if (inside) {
            t = traceInside(pos, dir, normal);
            float free = -log(max(rand(ray, ${MAX_SEGMENTS + 3} + s), 1e-6)) * u_scatter;
            scatter = free < t;
            t = min(t, free);
          } else {
            t = trace(pos, dir, normal, solid);
          }
          vec2 next = pos + dir * t;
          if (s == seg) {
            a = pos;
            b = next;
            break;
          }
          // 和紙の中。散るなら全周のどこかへ向きを変え、面に着いたらばらばらの向きに外へ出る
          if (inside) {
            if (scatter) {
              float angle = TAU * rand(ray, ${2 * MAX_SEGMENTS + 3} + s);
              dir = vec2(cos(angle), sin(angle));
              pos = next;
            } else {
              dir = diffuse(normal, rand(ray, ${2 * MAX_SEGMENTS + 3} + s));
              pos = next + normal * 0.01;
              inside = false;
            }
            continue;
          }
          // ロゴに当たらなかった光線はそこで終わる
          if (!solid) {
            energy = 0.0;
            break;
          }
          float pick = rand(ray, ${3 * MAX_SEGMENTS + 3} + s);
          // 和紙として当たった光線は、ばらばらの向きに中へ入る
          if (pick < u_paper) {
            dir = diffuse(-normal, rand(ray, ${2 * MAX_SEGMENTS + 3} + s));
            pos = next - normal * 0.01;
            inside = true;
            continue;
          }
          // つやとして当たった光線は、鏡の向きから左右に最大 u_rough ずれた向きに返る（真ん中ほど多い）。面の中へ向いたら折り返す
          if (pick < u_paper + u_gloss) {
            vec2 m = reflect(dir, normal);
            float off = u_rough * (rand(ray, ${2 * MAX_SEGMENTS + 3} + s) + rand(ray, s + 1) - 1.0);
            m = vec2(m.x * cos(off) - m.y * sin(off), m.x * sin(off) + m.y * cos(off));
            dir = dot(m, normal) < 0.0 ? reflect(m, normal) : m;
            pos = next + normal * 0.01;
            continue;
          }
          // 白い面。ばらばらの向きに散る
          dir = diffuse(normal, rand(ray, s + 1));
          energy *= u_albedo;
          pos = next + normal * 0.01;
        }

        // 線は長い向きの画素数だけ塗られるので、斜めの線が暗くならないよう長さとの比を掛ける。
        // 線の幅は層の 1 画素なので、層の画素が細かいほど（画面の密度や解像度が高いほど）1 画素あたりの明るさが薄まる。
        // 1 CSS px あたりの層の画素数（u_scale）を掛け、画面によらず同じ明るさにする
        vec2 d = b - a;
        float extent = max(abs(d.x), abs(d.y));
        v_energy = energy * u_scale * (extent > 0.0 ? length(d) / extent : 1.0);
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
  /** 前のフレームのロゴの位置と大きさ（左上と 1 マス） */
  let lastLogo = {x: 0, y: 0, unit: 0}
  /** 動いている度合い（0〜1）。動くと上がり、止まるとなめらかに 0 へ戻る */
  let moving = 0
  /** 前のフレームの光の向きと素材。回しているあいだと切り替えているあいだも動いているものとする */
  let lastTurn = ''

  const layout = () => {
    const {width, height} = size
    const scale = pixelRatio * (tuning.resolution / 100)
    rays.setUniform({u_size: [width, height], u_scale: scale})
    for (const r of [frameLayer, ...acc]) r.resize({width, height, pixelRatio: scale})
    fresh = true
  }

  /** 今の光線の数。tuning の下限と上限のあいだ */
  let count = tuning.minRays
  const setRays = (next: number) => {
    count = Math.min(tuning.maxRays, Math.max(tuning.minRays, next))
    rays.setUniform({u_rays: count})
  }

  const tune = (next: LightTuning) => {
    tuning = next
    setRays(count)
    rays.setUniform({
      u_bounces: tuning.bounces,
      u_albedo: tuning.albedo / 100,
      u_scatter: tuning.scatter,
      u_rough: (tuning.roughness * Math.PI) / 180,
      u_lightSize: tuning.lightSize,
      u_underSize: tuning.underSize,
      u_underCone: (tuning.underCone * Math.PI) / 180,
      u_cone: (tuning.cone * Math.PI) / 180
    })
    // 頂点の数は光線の数の上限と跳ね返りの回数で決まるので、変わったら作り直す。光線の数が変わっても作り直さない
    const vertices = tuning.maxRays * (tuning.bounces + 1) * 2
    if (vertices !== lineCount) {
      lineCount = vertices
      lines = new Vao(core, {attributes: {a_index: new Float32Array(vertices) as unknown as number[]}})
    }
    layout()
  }

  /**
   * 1 フレーム描く。extra は、光線を描いた 1 フレームぶんの層に、加算の合成のまま重ねて描くもの（光へ飛んでいる粒子）。
   * 描いたら true を返す。そのあいだは動いているものとして、前のフレームを残す割合を弱める
   */
  const draw = (frame: LightFrame | null, extra?: (target: Renderer) => boolean) => {
    // 消えているあいだは何も描かない。前の結果も捨て、次につくときはそのフレームだけで描き始める
    if (!frame) {
      lit = false
      fresh = true
      return
    }
    if (!lines) return
    lit = true
    const {upper, under, logo, material} = frame
    // ロゴは画素にそろえて置く
    const unit = (tuning.cell * logo.scale) / 2
    const left = Math.round(logo.x - (LOGO_WIDTH * unit) / 2)
    const top = Math.round(logo.y - (LOGO_HEIGHT * unit) / 2)
    const {width, height} = size
    blend.setUniform({u_shift: [-(upper.x - lastLight.x) / width, (upper.y - lastLight.y) / height]})
    const moved =
      Math.hypot(upper.x - lastLight.x, upper.y - lastLight.y) +
      Math.hypot(left - lastLogo.x, top - lastLogo.y) +
      Math.abs(unit - lastLogo.unit) * LOGO_WIDTH
    const turn = [upper.angle, under.angle, material.paper, material.gloss].join()
    moving = Math.max(Math.min(1, moved / MOVING_PX), turn === lastTurn ? 0 : 1, moving * SETTLE_RATE)
    lastLight = {x: upper.x, y: upper.y}
    lastLogo = {x: left, y: top, unit}
    lastTurn = turn
    seed = (seed + 1) % 1_000_000
    rays.setUniform({
      u_seed: seed,
      u_power: upper.power,
      u_light: [upper.x, upper.y],
      u_lightAngle: upper.angle,
      u_focus: upper.focus,
      u_paper: material.paper * (tuning.translucency / 100),
      u_gloss: material.gloss * (tuning.shine / 100),
      // 消えているあいだは下の光に光線を回さない
      u_under: [under.x, under.y],
      u_underAngle: under.angle,
      u_underRays: under.power > 0 ? Math.round((count * tuning.underShare) / 100) : 0,
      u_underPower: under.power,
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
    setRays,
    draw,
    /** ためた光の層。消えているあいだは null */
    layer: () => (lit ? acc[0].renderTexture[0] : null)
  }
}

/** メインスレッドからの指示 */
export type LightCommand = {
  tuning?: LightTuning
  /** 光線の数。tuning の下限と上限に収めて使う */
  rays?: number
  /**
   * 1 フレーム描く。null なら光を消す。粒子が光へ向けて飛び始めたら描き始める（光が明るくなるのは粒子が着いてから）
   */
  frame?: LightFrame | null
}

/** 光源 1 つ。位置は canvas の左上からの px */
export type Lamp = {
  x: number
  y: number
  /** 照らす向き。ラジアンで、右が 0、下へ回る向きが正 */
  angle: number
  /** 強さ。tuning の power と同じ単位で、スクロールでついていく明るさの割合も掛けたもの */
  power: number
}

/** 1 フレームぶんの光の状態。位置はどれも canvas の左上からの px */
export type LightFrame = {
  /** 上の光。focus は絞れ具合で、0 で全周に均一、1 で向きの円錐に絞りきる（tuning の cone） */
  upper: Lamp & {focus: number}
  /** 部屋の床の上に置く下の光 */
  under: Lamp
  /** ロゴの中心と、大きさの倍率（tuning の cell に掛ける） */
  logo: {x: number; y: number; scale: number}
  /**
   * ロゴの素材の割合。どちらも 0 で白い面、paper が 1 で和紙、gloss が 1 でつや。切り替えるあいだはあいだを通る
   * （和紙は tuning の translucency の割合だけ中へ入り、つやは shine の割合だけ鏡の向きに返る。残りは白い面と同じ）
   */
  material: {paper: number; gloss: number}
}
