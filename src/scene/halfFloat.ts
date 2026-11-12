// 16bit 浮動小数の層の形式を、端末が描けるものから選ぶ。
// 浮動小数の層に描くには拡張が要る。EXT_color_buffer_float があれば R16F・RG16F・RGBA16F のどれにも描けるが、
// それがなく EXT_color_buffer_half_float だけの端末で必ず描けるのは RGBA16F だけで、R16F と RG16F は端末による
// （描けない形式の層に描くと、何も描かれない）。少ないチャンネルの形式が描けなければ RGBA16F を使う

const FORMATS = {1: ['R16F', 'RED'], 2: ['RG16F', 'RG']} as const

type Format = readonly [internalFormat: string, format: string]

/** 1 画素の層を作って、描けるかを確かめる。結んでいた枠とテクスチャは戻す（glaku が結んだものを覚えているので） */
function renderable(gl: WebGL2RenderingContext, [internalFormat, format]: Format) {
  const frameBuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const bound = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null
  const texture = gl.createTexture()
  const probe = gl.createFramebuffer()
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl[internalFormat as 'R16F'], 1, 1, 0, gl[format as 'RED'], gl.HALF_FLOAT, null)
  gl.bindFramebuffer(gl.FRAMEBUFFER, probe)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  const complete = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE
  gl.bindFramebuffer(gl.FRAMEBUFFER, frameBuffer)
  gl.bindTexture(gl.TEXTURE_2D, bound)
  gl.deleteFramebuffer(probe)
  gl.deleteTexture(texture)
  return complete
}

/** channels 個のチャンネルを持つ 16bit 浮動小数の層の形式（internalFormat と format）。描けなければ RGBA16F */
export function halfFloatFormat(gl: WebGL2RenderingContext, channels: keyof typeof FORMATS): Format {
  gl.getExtension('EXT_color_buffer_float')
  gl.getExtension('EXT_color_buffer_half_float')
  return renderable(gl, FORMATS[channels]) ? FORMATS[channels] : ['RGBA16F', 'RGBA']
}
