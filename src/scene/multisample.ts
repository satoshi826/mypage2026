import {type Core, Renderer} from 'glaku'

/**
 * target と同じ大きさの、4 倍のマルチサンプルの描き先。描いたものの縁が画素の一部だけを覆えるので、半端な位置にある点や線を
 * 画素に丸めず描ける（hero の粒子は、丸めると動くたびに 1 画素ずつ跳んでがたついて見える）。
 * glaku はマルチサンプルの層を作れないので、glaku の Renderer の描き先をマルチサンプルのレンダーバッファにすり替えて
 * 使い（clear・render・viewport は glaku のまま）、描いたら resolve で target のテクスチャへ写す
 */
export function createMultisample(core: Core, target: Renderer) {
  const gl = core.gl
  const samples = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) as number)
  const color = gl.createRenderbuffer()
  const frameBuffer = gl.createFramebuffer()
  const renderer = new Renderer(core, {
    frameBuffer: [['RGBA8', 'RGBA', 'UNSIGNED_BYTE', 'NEAREST', 'CLAMP_TO_EDGE']],
    screenFit: false,
    backgroundColor: [0, 0, 0, 0],
    width: 1,
    height: 1
  })
  renderer.frameBuffer = frameBuffer
  let size = {width: 1, height: 1}

  const resize = (next: {width: number; height: number; pixelRatio: number}) => {
    renderer.resize(next)
    // glaku の層と同じく、端数は切り捨てた画素数にする
    size = {width: Math.trunc(next.width * next.pixelRatio), height: Math.trunc(next.height * next.pixelRatio)}
    gl.bindRenderbuffer(gl.RENDERBUFFER, color)
    gl.renderbufferStorageMultisample(gl.RENDERBUFFER, samples, gl.RGBA8, size.width, size.height)
    gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer)
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, color)
    gl.bindRenderbuffer(gl.RENDERBUFFER, null)
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    // 描き先を glaku の外で付け替えたので、次の描画で glaku に描き先を結び直させる
    core.currentRenderer = null
  }

  return {
    renderer,
    resize,
    /** 描いたものを target のテクスチャへ写す */
    resolve() {
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, frameBuffer)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, target.frameBuffer)
      const {width, height} = size
      gl.blitFramebuffer(0, 0, width, height, 0, 0, width, height, gl.COLOR_BUFFER_BIT, gl.NEAREST)
      gl.bindFramebuffer(gl.READ_FRAMEBUFFER, null)
      gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, null)
      core.currentRenderer = null
    }
  }
}
