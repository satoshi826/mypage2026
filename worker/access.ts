// Cloudflare Access の JWT 検証。Access で保護したパスへの要求には
// Cf-Access-Jwt-Assertion ヘッダ（または CF_Authorization cookie）に JWT が付く。
// チームの公開鍵（JWKS）で署名を確かめ、aud / iss / exp を見る。
//
// ACCESS_TEAM_DOMAIN と ACCESS_AUD が空のときは、localhost からの要求だけ通す（wrangler dev 用）。

type Jwk = JsonWebKey & {kid: string}

let jwksCache: {keys: Jwk[]; fetchedAt: number} | null = null
const JWKS_TTL = 60 * 60 * 1000

/** 通れば null、通らなければ 401 / 403 の Response */
export async function authorize(request: Request, env: Env): Promise<Response | null> {
  const deny = (status: number, message: string) =>
    new Response(JSON.stringify({error: message}), {
      status,
      headers: {'content-type': 'application/json; charset=utf-8'}
    })

  if (!env.ACCESS_TEAM_DOMAIN || !env.ACCESS_AUD) {
    const host = new URL(request.url).hostname
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]') return null
    return deny(503, 'access is not configured')
  }

  const token = request.headers.get('cf-access-jwt-assertion') ?? cookie(request, 'CF_Authorization')
  if (!token) return deny(401, 'missing access token')

  const [headerPart, payloadPart, signaturePart] = token.split('.')
  if (!headerPart || !payloadPart || !signaturePart) return deny(401, 'malformed token')

  let header: {kid?: string; alg?: string}
  let payload: {aud?: string | string[]; iss?: string; exp?: number}
  try {
    header = JSON.parse(decodeBase64Url(headerPart))
    payload = JSON.parse(decodeBase64Url(payloadPart))
  } catch {
    return deny(401, 'malformed token')
  }
  if (header.alg !== 'RS256' || !header.kid) return deny(401, 'unsupported token')

  const key = await findKey(env.ACCESS_TEAM_DOMAIN, header.kid)
  if (!key) return deny(401, 'unknown key')

  const valid = await crypto.subtle.verify(
    'RSASSA-PKCS1-v1_5',
    key,
    base64UrlToBytes(signaturePart),
    new TextEncoder().encode(`${headerPart}.${payloadPart}`)
  )
  if (!valid) return deny(401, 'invalid signature')

  const aud = Array.isArray(payload.aud) ? payload.aud : [payload.aud]
  if (!aud.includes(env.ACCESS_AUD)) return deny(403, 'wrong audience')
  if (payload.iss !== `https://${env.ACCESS_TEAM_DOMAIN}`) return deny(403, 'wrong issuer')
  if (!payload.exp || payload.exp * 1000 < Date.now()) return deny(401, 'token expired')
  return null
}

async function findKey(teamDomain: string, kid: string): Promise<CryptoKey | null> {
  const stale = !jwksCache || Date.now() - jwksCache.fetchedAt > JWKS_TTL
  if (stale || !jwksCache?.keys.some((k) => k.kid === kid)) {
    const res = await fetch(`https://${teamDomain}/cdn-cgi/access/certs`)
    if (!res.ok) return null
    const {keys} = (await res.json()) as {keys: Jwk[]}
    jwksCache = {keys, fetchedAt: Date.now()}
  }
  const jwk = jwksCache.keys.find((k) => k.kid === kid)
  if (!jwk) return null
  return crypto.subtle.importKey('jwk', jwk, {name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256'}, false, ['verify'])
}

function cookie(request: Request, name: string): string | null {
  const header = request.headers.get('cookie') ?? ''
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=')
    if (k === name) return v.join('=')
  }
  return null
}

function base64UrlToBytes(input: string): Uint8Array {
  const base64 = input
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(input.length / 4) * 4, '=')
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

const decodeBase64Url = (input: string) => new TextDecoder().decode(base64UrlToBytes(input))
