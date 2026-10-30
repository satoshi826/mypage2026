import {type Core, Vao, Program, Renderer} from 'glaku'
import {blockOrigin, buildTable, chooseGrid, layoutFor, loadPixels, type AtlasLayout, type Grid} from './table'
import type {Frame} from './sequence'
import {GATHER_STAGGER} from '../app/stage'
import {createMultisample} from '../scene/multisample'
import {DEFAULT_INTERACTION, DEFAULT_TUNING, type Interaction, type Tuning} from './tuning'

/**
 * 同時にデコードする枚数。31枚での実測では 6 で頭打ちになり、8 で全並列と同じ
 * 速さ（約530ms）。増やしてもヒープはほとんど増えないが、1枚ぶんの画素は
 * 並列数だけ同時に生きるので、際限なく上げる理由もない
 */
const DECODE_LANES = 8

/**
 * 写真を1枚ずつ読み込み、アトラスの自分の区画へ直接上げる。1枚上がるごとに onLoaded を呼ぶ。
 *
 * 最初の1枚（0 番）だけ単独で先に上げる。回線を分け合わずに済むので最初の1枚が
 * 最速で届き、そこから描き始められる。残りは順番をばらして並列に上げる。
 * 2枚目に届くものが最初の遷移先になるので、ばらさないと毎回同じ遷移で始まる。
 *
 * 全枚数ぶんを JS 側に溜めてから1枚の巨大な配列に詰め直すと、画素・テーブル・
 * アトラスが同時に生きる（31枚で 225MB）。区画ごとに上げれば、同時に生きるのは
 * 並列数ぶんだけになる。
 */
async function fillAtlas(
  core: Core,
  texture: WebGLTexture,
  photos: string[],
  grid: Grid,
  layout: AtlasLayout,
  onLoaded: (layer: number) => void
) {
  const {gl} = core

  const upload = async (layer: number) => {
    let table: Uint8Array
    try {
      table = buildTable(await loadPixels(photos[layer], grid), grid)
    } catch (e) {
      // 1枚の失敗で全体を止めない。届かなかった写真は選ばれないまま残る
      console.error(`hero: ${photos[layer]} を読めない`, e)
      return
    }
    const {x, y} = blockOrigin(layer, layout, grid)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texSubImage2D(gl.TEXTURE_2D, 0, x, y, grid.width, grid.height, gl.RGBA, gl.UNSIGNED_BYTE, table)
    gl.bindTexture(gl.TEXTURE_2D, null)
    onLoaded(layer)
  }

  await upload(0)

  const rest = Array.from({length: photos.length - 1}, (_, i) => i + 1)
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  let next = 0
  await Promise.all(
    Array.from({length: Math.min(DECODE_LANES, rest.length)}, async () => {
      for (let i = next++; i < rest.length; i = next++) await upload(rest[i])
    })
  )
}

/** 写真の枠。canvas の左上からの px */
export type Rect = {x: number; y: number; width: number; height: number}

/**
 * 写真の粒子を描く場面。舞台の canvas（src/scene/worker.ts）の中で、光の層と一緒に描く。粒子は写真の枠の大きさの層
 * （layer）に描き、舞台がそれを枠の位置へ拡大して重ねる。
 *
 * @param onLoaded 写真が 1 枚上がるごとに、その番号で呼ぶ
 * @param onChange 層を描き直したときに呼ぶ（舞台が重ね直す）
 */
export function createHeroScene(
  core: Core,
  pixelRatio: number,
  photos: string[],
  {onLoaded, onChange}: {onLoaded: (layer: number) => void; onChange: () => void}
) {
  // 粒子グリッドは起動時に一度だけ決める。以後は変わらない
  const textureLimit = core.gl.getParameter(core.gl.MAX_TEXTURE_SIZE) as number
  const grid = chooseGrid({textureLimit, count: photos.length})
  const imageAspect = grid.width / grid.height

  const layout = layoutFor(textureLimit, photos.length, grid)

  // 頂点ごとのランク。glaku の型は number[] だが内部で Float32Array に詰め直すだけ
  const rankIndices = Float32Array.from({length: grid.count}, (_, i) => i)
  const vao = new Vao(core, {attributes: {a_rank: rankIndices as unknown as number[]}})
  // 光へ飛ぶ粒子を光の層に描くときの、stride 個に 1 個へ間引いたランク。stride ごとに作って使い回す
  const sparse = new Map<number, Vao>([[1, vao]])
  const sparseVao = (stride: number) => {
    let found = sparse.get(stride)
    if (!found) {
      const ranks = Float32Array.from({length: Math.ceil(grid.count / stride)}, (_, i) => i * stride)
      found = new Vao(core, {attributes: {a_rank: ranks as unknown as number[]}})
      sparse.set(stride, found)
    }
    return found
  }

  // 干渉の状態（ズレと速度）を粒子1つにつき1テクセルで持つ。読みと書きで別の
  // テクスチャが要るので2枚を交互に使う。半精度で足りるのは、値が 0 付近では
  // 細かく、大きいところでも 0.3px 程度の分解能があるため
  const canSimulate = !!(
    core.gl.getExtension('EXT_color_buffer_float') || core.gl.getExtension('EXT_color_buffer_half_float')
  )
  const state = [0, 1].map((i) => {
    const buffer = new Renderer(core, {
      id: `state${i}`,
      width: grid.width,
      height: grid.height,
      screenFit: false,
      backgroundColor: [0, 0, 0, 0],
      frameBuffer: [['RGBA16F', 'RGBA', 'HALF_FLOAT', 'NEAREST', 'CLAMP_TO_EDGE']]
    })
    // glaku の pixelRatio は core の値に掛かる倍率なので、実寸で作り直して
    // 1テクセル = 1粒子にする
    buffer.resize({width: grid.width, height: grid.height, pixelRatio: 1})
    buffer.clear()
    return buffer
  })
  let readIndex = 0

  // 描画と更新が同じ式で基準位置を出すための共有部分。二重管理を作らないため1か所に置く
  const shared = /* glsl */ `
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

      // 干渉がないときの粒子 k の位置と輝度。組を引数で受けるのは、ジャンプの
      // ときに古い組と新しい組の両方を同じ式で出す必要があるため
      void baseOf(int k, int from, int to, float phase, out vec2 pos, out float lum) {
        int col = k % ${grid.width};
        int row = k / ${grid.width};

        // 1回のフェッチで座標と輝度の両方が取れる
        vec4 texFrom = texelFetch(t_table, addressOf(from, col, row), 0);
        vec4 texTo   = texelFetch(t_table, addressOf(to,   col, row), 0);

        // 両端の平均を取った「暗さ」。暗いほど 1 に近い。
        // 平均にすることで逆再生でも同じ順序を辿る
        float darkness = 1.0 - (texFrom.a + texTo.a) * 0.5;

        // 暗い粒子ほど遅れて出発する。光が先に抜け、闇が後から追う
        float delay = pow(darkness, u_toneCurve) * u_staggerTotal;
        // 分母が 0 にならないよう、1粒子あたりの移動時間には下限を置く
        float span = max(1.0 - u_staggerTotal, 0.05);
        float local = easeInOut(clamp((phase - delay) / span, 0.0, 1.0), u_easePower);

        pos = mix(decodePosition(texFrom), decodePosition(texTo), local);
        lum = mix(texFrom.a, texTo.a, local);
      }`

  /** 基準位置の計算に要る uniform。描画と更新の両方が持つ */
  const morphUniforms = {
    u_from: 'int',
    u_to: 'int',
    u_phase: 'float',
    u_staggerTotal: 'float',
    u_toneCurve: 'float',
    u_easePower: 'float'
  } as const

  /** 舞台を進めたときの粒子の位置。写真のあいだの描画と、光の層への描画が同じ式で出す */
  const flightUniforms = {u_fit: 'vec2', u_gather: 'float', u_gatherAt: 'vec2'} as const
  const flight = /* glsl */ `
      // 粒子 k の、写真の枠の NDC での位置と輝度（lum）と、光へ向けて出発してからの進み（local。0 でまだ写真の中、1 で光に着いた）。
      // 舞台を進めると、光の位置（u_gatherAt）へ自分の明るさのまま加速して飛び込み、着いたら光に吸い込まれて消える。
      // 写真を切り替えるときと同じく、明るい粒子ほど先に出発する。減速して着くと、光の位置の周りに粒子が溜まって
      // 塊に見えるので、加速だけにする
      vec2 flightOf(int k, out float lum, out float local) {
        vec2 pos;
        baseOf(k, u_from, u_to, u_phase, pos, lum);
        // 干渉によるズレ。更新パスが書いた値をそのまま足す
        vec2 offset = texelFetch(t_state, ivec2(k % ${grid.width}, k / ${grid.width}), 0).xy;
        float delay = (1.0 - lum) * ${GATHER_STAGGER.toFixed(2)};
        local = clamp((u_gather - delay) / ${(1 - GATHER_STAGGER).toFixed(2)}, 0.0, 1.0);
        return mix((pos + offset) * u_fit, u_gatherAt, local * local);
      }`

  // 中身は空で確保し、写真ごとに区画へ上げる
  const table = core.createTexture({
    width: layout.width,
    height: layout.height,
    format: 'RGBA',
    internalFormat: 'RGBA8',
    type: 'UNSIGNED_BYTE',
    filter: 'NEAREST'
  })

  const program = new Program(core, {
    id: 'draw',
    attributeTypes: {a_rank: 'float'},
    uniformTypes: {
      ...morphUniforms,
      ...flightUniforms,
      u_pointSize: 'float'
    },
    texture: {t_table: table, t_state: state[0].renderTexture[0]},
    primitive: 'POINTS',
    vert: /* glsl */ `
      out vec3 v_color;
      ${shared}
      ${flight}

      // 写真のあいだの粒子。光へ向けて出発した粒子は、光の層（glow）へ移るのでここでは描かない
      void main() {
        float lum;
        float local;
        vec2 pos = flightOf(int(a_rank), lum, local);
        v_color = vec3(lum);
        gl_Position = local <= 0.0 ? vec4(pos, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = u_pointSize;
      }`,
    frag: /* glsl */ `
      in vec3 v_color;
      out vec4 o_color;
      void main() {
        o_color = vec4(v_color, 1.0);
      }`
  })

  // 光へ向けて飛んでいる粒子。光の層（light/scene.ts の 1 フレームぶんの層）に、自分の明るさの光の粒として加算で描く。
  // 光と同じ層・同じ描き方なので、粒子がそのまま光になって光源に集まる。画面全体に描くので、写真の枠の外へも出られる
  const glow = new Program(core, {
    id: 'glow',
    attributeTypes: {a_rank: 'float'},
    uniformTypes: {
      ...morphUniforms,
      ...flightUniforms,
      u_rect: 'vec4',
      u_glow: 'float',
      u_glowSize: 'float'
    },
    texture: {t_table: table, t_state: state[0].renderTexture[0]},
    primitive: 'POINTS',
    vert: /* glsl */ `
      out float v_energy;
      ${shared}
      ${flight}

      void main() {
        float lum;
        float local;
        vec2 pos = flightOf(int(a_rank), lum, local);
        v_energy = lum * u_glow;
        // 写真の枠の NDC を、画面の NDC へ（u_rect は枠の中心と半分の大きさ）
        gl_Position = local > 0.0 && local < 1.0 ? vec4(u_rect.xy + pos * u_rect.zw, 0.0, 1.0) : vec4(2.0, 2.0, 0.0, 1.0);
        gl_PointSize = u_glowSize;
      }`,
    frag: /* glsl */ `
      in float v_energy;
      out vec4 o_color;
      void main() {
        o_color = vec4(vec3(v_energy), 1.0);
      }`
  })

  // 粒子1つにつき1テクセルを更新する。フラグメントではなく頂点側で計算するのは、
  // フラグメントの sampler が lowp 既定で、16F の状態を読むと精度が落ちるため
  const update = new Program(core, {
    id: 'update',
    attributeTypes: {a_rank: 'float'},
    uniformTypes: {
      ...morphUniforms,
      u_pointer: 'vec2',
      u_pointerVelocity: 'vec2',
      u_radius2: 'float',
      u_push: 'float',
      u_drag: 'float',
      u_prevFrom: 'int',
      u_prevTo: 'int',
      u_prevPhase: 'float',
      u_catchUp: 'float',
      u_massGain: 'float',
      u_massCurve: 'float',
      u_spread: 'float',
      u_scatter: 'float',
      u_stiffness: 'float',
      u_damping: 'float',
      u_dt: 'float'
    },
    texture: {t_table: table, t_state: state[0].renderTexture[0]},
    primitive: 'POINTS',
    vert: /* glsl */ `
      flat out vec4 v_state;
      ${shared}

      // 粒子の座標は写真の縦横それぞれで正規化されているので、そのまま距離を測ると
      // 縦1目盛りが横1目盛りより短くなり、力の効く範囲が横長の楕円になる。
      // 半幅を単位とする等方な空間で計算し、変位だけ元の空間へ戻す
      const vec2 TO_EVEN = vec2(1.0, 1.0 / ${imageAspect.toFixed(6)});
      const vec2 TO_NDC = vec2(1.0, ${imageAspect.toFixed(6)});

      // 粒子ごとの、位置と相関しない乱数。輝度は画像なので空間的になめらかで、
      // ばらつきの種には使えない
      float hash(uint h) {
        h = h * 747796405u + 2891336453u;
        h = ((h >> ((h >> 28) + 4u)) ^ h) * 277803737u;
        return float((h >> 22u) ^ h) / 4294967295.0;
      }

      // ポインタ起点の「目標のズレ」。速度に比例し、距離で減衰する
      vec2 targetOffset(vec2 pos, float mass, float twist) {
        vec2 flow = u_pointerVelocity * TO_EVEN;
        float speed = length(flow);
        if (speed < 1e-4) return vec2(0.0);

        vec2 d = (pos - u_pointer) * TO_EVEN;
        float dist2 = dot(d, d);
        float falloff = exp(-dist2 / u_radius2);
        vec2 dir = dist2 > 1e-8 ? d * inversesqrt(dist2) : vec2(0.0);

        // 押される向きを粒子ごとにずらす。放射状に整列していると膜のように見える
        float angle = (twist - 0.5) * u_scatter;
        float sn = sin(angle);
        float cs = cos(angle);
        dir = mat2(cs, sn, -sn, cs) * dir;

        return falloff * (u_push * dir * speed + u_drag * flow) * TO_NDC / mass;
      }

      void main() {
        int k = int(a_rank);
        int col = k % ${grid.width};
        int row = k / ${grid.width};

        vec2 pos;
        float lum;
        baseOf(k, u_from, u_to, u_phase, pos, lum);

        vec4 prev = texelFetch(t_state, ivec2(col, row), 0);
        vec2 offset = prev.xy;
        vec2 velocity = prev.zw;

        // 番号をクリックして行き先を変えた瞬間。基準位置が飛ぶぶんをズレに振り替えると、
        // 見た目の位置は変わらないまま、バネが新しい軌道へ引き戻してくれる
        if (u_catchUp > 0.5) {
          vec2 wasPos;
          float wasLum;
          baseOf(k, u_prevFrom, u_prevTo, u_prevPhase, wasPos, wasLum);
          offset += wasPos - pos;
        }

        // 重い粒子は同じ力でも動きにくい。暗さにカーブを掛けてから重さに写す。
        // 写真が暗部に偏っているので、線形のままでは大半の粒子が同じ重さになる。
        // 指数にしているのは、重さが比で効くため。差を線形に取ると軽い側だけ
        // 先に下限へ張り付き、gain を上げても明るい側が変わらなくなる
        float shaped = pow(1.0 - lum, u_massCurve);
        float mass = clamp(exp(u_massGain * (2.0 * shaped - 1.0)), 0.05, 20.0)
                   * mix(1.0 - u_spread, 1.0 + u_spread, hash(uint(k)));

        // 目標のズレへバネで引かれる。力が消えれば目標は 0 になり、必ず写真に戻る。
        // 質量で加速度ごと割るので、固有振動数が 1/sqrt(mass)、減衰比が 1/sqrt(mass) に
        // 散る。同じ力を受けても戻る速さと行き過ぎ方が粒子ごとに変わる
        vec2 target = targetOffset(pos + offset, mass, hash(uint(k) + 1013904223u));
        vec2 acceleration = ((target - offset) * u_stiffness - velocity * u_damping) / mass;
        velocity += acceleration * u_dt;
        offset += velocity * u_dt;

        v_state = vec4(offset, velocity);
        // 自分のテクセルの中心へ打つ
        gl_Position = vec4(
          (float(col) + 0.5) / ${grid.width}.0 * 2.0 - 1.0,
          (float(row) + 0.5) / ${grid.height}.0 * 2.0 - 1.0,
          0.0,
          1.0
        );
        gl_PointSize = 1.0;
      }`,
    frag: /* glsl */ `
      flat in vec4 v_state;
      out vec4 o_color;
      void main() {
        o_color = v_state;
      }`
  })

  // 直前に描いた組。ジャンプのとき、基準位置の飛びを打ち消すのに要る
  let frame: Frame = {from: 0, to: 0, phase: 0}
  // 上がった写真。両端が揃っていないフレームは描かない（空の区画を読むと全粒子が隅に集まる）
  const loaded = new Set<number>()
  fillAtlas(core, table, photos, grid, layout, (layer) => {
    loaded.add(layer)
    onLoaded(layer)
    // 待っていた写真が届いたら、次の指示を待たずに描く
    if (layer === frame.from || layer === frame.to) {
      draw()
      onChange()
    }
  }).catch((e) => console.error('hero: 写真の読み込みが止まった', e))

  // 粒子を描く層。写真の枠の大きさで、粒子のすき間は透明にする（舞台が重ねたとき、下の光の層や地を透かす）。
  // 粒子は不透明に描く。動く粒子を画素に丸めないよう、マルチサンプルで描いてから、この層へ写す
  const renderer = new Renderer(core, {
    frameBuffer: [['RGBA8', 'RGBA', 'UNSIGNED_BYTE', 'LINEAR', 'CLAMP_TO_EDGE']],
    screenFit: false,
    backgroundColor: [0, 0, 0, 0],
    width: 1,
    height: 1
  })
  const sampled = createMultisample(core, renderer)

  // 粒子は u_fit を掛ける前の空間にいるので、ポインタも同じ空間へ戻してから渡す
  let fit = [1, 1]
  // 写真の枠。大きさが決まる前は null
  let rect: Rect | null = null

  /** 基準位置の計算に要る uniform は、描画（写真と光の層）と更新のすべてが持つ */
  const setMorph = (values: Record<string, number>) => {
    program.setUniform(values)
    glow.setUniform(values)
    update.setUniform(values)
  }
  /** 舞台を進めたときの位置の uniform は、写真と光の層の描画が持つ */
  const setFlight = (values: Record<string, number | number[]>) => {
    program.setUniform(values)
    glow.setUniform(values)
  }
  // 粒子が集まった割合。0 より大きく 1 より小さいあいだ、粒子が光へ向けて飛んでいる
  let gathered = 0

  const applyTuning = (tuning: Tuning) =>
    setMorph({
      u_staggerTotal: tuning.staggerTotal,
      u_toneCurve: tuning.toneCurve,
      u_easePower: tuning.easePower
    })

  const applyInteraction = (interaction: Interaction) => {
    // バネは剛性と減衰ではなく「戻る速さ」と「減衰比」で指定する。
    // 減衰比 1 で行き過ぎなし、下げるほどしなって戻る
    const omega = (2 * Math.PI) / Math.max(interaction.returnSeconds, 0.1)
    update.setUniform({
      u_radius2: interaction.radius * interaction.radius,
      u_push: interaction.push,
      u_drag: interaction.drag,
      u_massGain: interaction.massGain,
      u_massCurve: interaction.massCurve,
      u_spread: interaction.spread,
      u_scatter: interaction.scatter,
      u_stiffness: omega * omega,
      u_damping: 2 * interaction.damping * omega
    })
  }

  const draw = () => {
    // 枠の寸法が決まる前と、両端の写真が揃う前は描かない
    if (!drawable()) return
    core.setTexture('t_state', state[readIndex].renderTexture[0])
    sampled.renderer.clear()
    sampled.renderer.render(vao, program)
    sampled.resolve()
  }

  /** 干渉の状態を dt 秒ぶん進める。読んだ側とは別のテクスチャへ書き、role を入れ替える */
  const step = (dt: number) => {
    if (!canSimulate) return
    // 明示的な積分なので、タブ復帰などの大きい dt を入れると発散する
    update.setUniform({u_dt: Math.min(dt, 0.02)})
    core.setTexture('t_state', state[readIndex].renderTexture[0])
    state[1 - readIndex].render(vao, update)
    readIndex = 1 - readIndex
    // 打ち消しは1回だけ効かせる
    update.setUniform({u_catchUp: 0})
  }

  const drawable = () => !!rect && loaded.has(frame.from) && loaded.has(frame.to)

  /** 写真の枠を置く。位置だけ変わったときは描き直さない（舞台が重ねる位置を変えるだけ） */
  const place = (next: Rect) => {
    // 枠が決まる前は 0×0 で届く。0 で割ると fit が NaN になり、描画だけでなく
    // ポインタ経由で干渉の状態テクスチャまで NaN で埋まり、以後まともに描けなくなる
    if (next.width <= 0 || next.height <= 0) return
    const resized = !rect || rect.width !== next.width || rect.height !== next.height
    rect = next
    if (resized) resize(next)
  }

  const resize = ({width, height}: {width: number; height: number}) => {
    // 描く解像度は、画面の画素と粒子の格子の小さいほうにする。粒子の格子より大きく描くと、半端な間隔の粒子が
    // 画素に丸められて点の詰まり方に周期的なむらができ、干渉で粒子がずれると砂鉄の模様のような縞（モアレ）に
    // 見える。格子の解像度で描けば粒子 1 つが 1 画素に乗り、拡大は舞台が重ねるときになめらかに行う
    const ratio = pixelRatio * Math.min(1, grid.height / (height * pixelRatio))
    renderer.resize({width, height, pixelRatio: ratio})
    sampled.resize({width, height, pixelRatio: ratio})
    // 画像を歪めずに収める
    const canvasAR = width / height
    fit = canvasAR > imageAspect ? [imageAspect / canvasAR, 1] : [1, canvasAR / imageAspect]
    // 点サイズはピクセル単位に丸められるので、切り上げないと格子状の隙間が出る。
    // 重なる分には後から描かれる明るい粒子が上書きするだけで害がない
    const pointSize = Math.max(1, Math.ceil((height * ratio * fit[1]) / grid.height))
    setFlight({u_fit: fit})
    program.setUniform({u_pointSize: pointSize})
  }

  applyTuning(DEFAULT_TUNING)
  applyInteraction(DEFAULT_INTERACTION)
  update.setUniform({u_prevFrom: 0, u_prevTo: 0, u_prevPhase: 0, u_catchUp: 0})
  setFlight({u_gather: 0, u_gatherAt: [0, 0]})

  return {
    place,
    draw,
    /** 粒子を描いた層と、その層を置く枠。まだ描けないあいだは null */
    layer: () => (drawable() && rect ? {texture: renderer.renderTexture[0], rect} : null),
    step,
    tune: applyTuning,
    interact: applyInteraction,
    gather: (amount: number) => {
      gathered = amount
      setFlight({u_gather: amount})
    },
    gatherAt: (point: [number, number]) => setFlight({u_gatherAt: point}),
    /**
     * 光へ向けて飛んでいる粒子を、光の層（target）に加算で描く。飛んでいる粒子がなければ描かず false を返す。
     * 呼ぶ側が加算の合成にしておくこと
     *
     * @param screen 舞台の canvas の大きさ（CSS px）
     * @param energy 粒子の光の強さ。輝度に掛ける。1 で、写真の粒子と同じくらいの明るさ
     * @param scale target の、CSS px あたりの画素数
     */
    glow(target: Renderer, screen: {width: number; height: number}, energy: number, scale: number) {
      if (!drawable() || !rect || gathered <= 0 || gathered >= 1) return false
      // 粒子の格子は target の画素より細かいことがあり、そのぶん 1 画素に何粒も重なって足される。写真の枠の中の
      // 1 画素あたりの粒の数で割り、重なっても写真と同じくらいの明るさにする
      const perPixel = Math.max(1, grid.count / (rect.width * scale * rect.height * scale))
      // 描くのは、写真の枠の 1 CSS px に 1 粒までに間引いた粒子。点の大きさは 1 CSS px なので、それより多く描いても
      // 重なるだけで見え方は変わらず、足す画素の数だけが増える（写真の小さいスマホほど重なる）。間引いたぶん 1 粒を明るくする
      const stride = Math.max(1, Math.floor(grid.count / (rect.width * rect.height)))
      const lights = sparseVao(stride)
      const drawn = Math.ceil(grid.count / stride)
      glow.setUniform({
        u_rect: [
          ((rect.x + rect.width / 2) / screen.width) * 2 - 1,
          1 - ((rect.y + rect.height / 2) / screen.height) * 2,
          rect.width / screen.width,
          rect.height / screen.height
        ],
        u_glow: (energy / perPixel) * (grid.count / drawn),
        u_glowSize: Math.max(1, Math.round(scale))
      })
      core.setTexture('t_state', state[readIndex].renderTexture[0])
      target.render(lights, glow)
      return true
    },
    setPointer({x, y, vx, vy}: PointerCommand) {
      update.setUniform({u_pointer: [x / fit[0], y / fit[1]], u_pointerVelocity: [vx / fit[0], vy / fit[1]]})
    },
    setFrame(next: Frame, catchUp = false) {
      if (catchUp) {
        update.setUniform({
          u_prevFrom: frame.from,
          u_prevTo: frame.to,
          u_prevPhase: frame.phase,
          u_catchUp: 1
        })
      }
      frame = next
      setMorph({u_from: next.from, u_to: next.to, u_phase: next.phase})
    }
  }
}

/** ポインタの位置と速度。どちらも写真の半幅を 1 とした NDC（速度は 1秒あたり） */
export type PointerCommand = {x: number; y: number; vx: number; vy: number}

/** メインスレッドからの指示 */
export type HeroCommand = {
  /** 写真の枠。canvas の左上からの px */
  rect?: Rect
  render?: Frame
  /** 番号のクリックで行き先が変わったフレーム。基準位置の飛びをズレに振り替える */
  catchUp?: boolean
  /** 干渉を進める秒数。入っているフレームだけ状態を更新する */
  step?: number
  /** 粒子が集まった割合（src/app/stage.ts） */
  gather?: number
  /** 粒子が集まる点。写真の枠の NDC */
  gatherAt?: [number, number]
  tuning?: Tuning
  interaction?: Interaction
  pointer?: PointerCommand
}

/** 指示を場面に入れる。uniform を全部入れてから 1 回だけ描く */
export function applyHero(scene: ReturnType<typeof createHeroScene>, command: HeroCommand) {
  if (command.tuning) scene.tune(command.tuning)
  if (command.interaction) scene.interact(command.interaction)
  if (command.rect) scene.place(command.rect)
  if (command.pointer) scene.setPointer(command.pointer)
  if (command.render) scene.setFrame(command.render, command.catchUp)
  if (command.gather !== undefined) scene.gather(command.gather)
  if (command.gatherAt) scene.gatherAt(command.gatherAt)
  // 打ち消しは更新パスの中で効くので、干渉が止まっていても1回は回す
  if (command.step !== undefined || command.catchUp) scene.step(command.step ?? 0)
  scene.draw()
}
