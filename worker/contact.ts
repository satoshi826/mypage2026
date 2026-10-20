// 問い合わせフォーム（src/app/pages/ContactForm.tsx）の受け口。Turnstile で人が送ったものか確かめ、
// 本人の Gmail へメールで送る。返信先（Reply-To）は送った人のアドレスにするので、Gmail で返信すれば相手に届く。
//
// TURNSTILE_SECRET が空のときは、localhost からの要求だけ確かめずに通す（wrangler dev 用）。

/** 送り先。Email Routing で確認済みのアドレスでないと送れない */
const TO = 'stosto826@gmail.com'
/** 送り元。Email Routing を有効にした mu826.com のアドレスでないと送れない（受け取る箱は無い） */
const FROM = {email: 'form@mu826.com', name: 'mu826.com'}

const LIMITS = {name: 100, email: 254, message: 5000}

type Inquiry = {name: string; email: string; message: string; token: string}

const reply = (status: number, error?: string) =>
  new Response(error ? JSON.stringify({error}) : null, {
    status,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'}
  })

export async function contact(request: Request, env: Env): Promise<Response> {
  const ip = request.headers.get('cf-connecting-ip') ?? ''
  if (!(await env.CONTACT_LIMIT.limit({key: ip})).success) return reply(429, 'too many requests')

  let inquiry: Inquiry | null
  try {
    inquiry = parse(await request.json())
  } catch {
    inquiry = null
  }
  if (!inquiry) return reply(400, 'invalid inquiry')
  if (!(await human(inquiry.token, ip, request, env))) return reply(403, 'verification failed')

  try {
    await env.MAIL.send({
      from: FROM,
      to: TO,
      replyTo: {email: inquiry.email, name: inquiry.name},
      subject: `お問い合わせ: ${inquiry.name}`,
      text: `${inquiry.name} <${inquiry.email}>\n\n${inquiry.message}\n`
    })
  } catch (e) {
    console.error('contact: send failed', e)
    return reply(502, 'send failed')
  }
  return reply(204)
}

/** 入力を確かめて狭める。名前の改行は件名に入るので外す */
function parse(body: unknown): Inquiry | null {
  if (typeof body !== 'object' || body === null) return null
  const {name, email, message, token} = body as Record<string, unknown>
  if (typeof name !== 'string' || typeof email !== 'string' || typeof message !== 'string') return null
  if (typeof token !== 'string') return null
  const inquiry = {
    name: name.replace(/\s+/g, ' ').trim(),
    email: email.trim(),
    message: message.trim(),
    token
  }
  if (!inquiry.name || inquiry.name.length > LIMITS.name) return null
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(inquiry.email) || inquiry.email.length > LIMITS.email) return null
  if (!inquiry.message || inquiry.message.length > LIMITS.message) return null
  return inquiry
}

/** Turnstile の答えを Cloudflare に確かめる */
async function human(token: string, ip: string, request: Request, env: Env): Promise<boolean> {
  if (!env.TURNSTILE_SECRET) {
    const host = new URL(request.url).hostname
    return host === 'localhost' || host === '127.0.0.1' || host === '[::1]'
  }
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    body: new URLSearchParams({secret: env.TURNSTILE_SECRET, response: token, remoteip: ip})
  })
  const result = (await response.json()) as {success?: boolean}
  return result.success === true
}
