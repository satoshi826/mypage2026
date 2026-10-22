import type {ComponentChildren} from 'preact'
import {useEffect, useRef, useState} from 'preact/hooks'
import type {Lang} from '../lang'

// 問い合わせフォーム。送ると Worker（worker/contact.ts）が本人の Gmail へメールで送る。
// 自動送信の対策に Turnstile を使う。読み込むのはフォームに触れたときで、人の操作が要るときだけ
// 枠が出る（interaction-only）。開発中は必ず通るテスト用の鍵を使う

const SITE_KEY = import.meta.env.DEV ? '1x00000000000000000000AA' : '0x4AAAAAAFdwlmTmH7HtQWoy'
const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'

type Turnstile = {
  render(
    el: HTMLElement,
    options: {
      sitekey: string
      theme: 'dark'
      appearance: 'interaction-only'
      size: 'flexible'
      callback: (token: string) => void
      'expired-callback': () => void
      'error-callback': () => void
    }
  ): string
  reset(id: string): void
  remove(id: string): void
}

const loaded = () => (window as unknown as {turnstile?: Turnstile}).turnstile

let script: Promise<Turnstile> | null = null
function loadTurnstile() {
  script ??= new Promise((resolve, reject) => {
    const api = loaded()
    if (api) return resolve(api)
    const el = document.createElement('script')
    el.src = SCRIPT
    el.async = true
    el.onload = () => resolve(loaded()!)
    el.onerror = () => {
      script = null
      reject(new Error('turnstile を読めない'))
    }
    document.head.append(el)
  })
  return script
}

/** Turnstile の枠を box に置き、送るときの答え（token）を渡す。答えは 1 回しか使えないので、送るたびに取り直す */
function useTurnstile(box: {current: HTMLElement | null}) {
  const state = useRef({
    api: null as Turnstile | null,
    id: null as string | null,
    token: null as string | null,
    waiting: [] as {resolve: (token: string) => void; reject: (e: Error) => void}[]
  })
  const settle = (token: string | null) => {
    const s = state.current
    s.token = token
    for (const w of s.waiting.splice(0))
      if (token) w.resolve(token)
      else w.reject(new Error('turnstile が答えを返さない'))
  }
  const start = () => {
    const s = state.current
    if (s.id !== null || !box.current) return
    s.id = '' // 読み込み中。2 回目からは何もしない
    loadTurnstile().then(
      (api) => {
        if (!box.current) return
        s.api = api
        s.id = api.render(box.current, {
          sitekey: SITE_KEY,
          theme: 'dark',
          appearance: 'interaction-only',
          size: 'flexible',
          callback: settle,
          'expired-callback': () => (s.token = null),
          'error-callback': () => settle(null)
        })
      },
      () => {
        s.id = null
        settle(null)
      }
    )
  }
  useEffect(
    () => () => {
      const s = state.current
      if (s.api && s.id) s.api.remove(s.id)
    },
    []
  )
  return {
    start,
    token: () => {
      start()
      const s = state.current
      if (s.token) return Promise.resolve(s.token)
      return new Promise<string>((resolve, reject) => s.waiting.push({resolve, reject}))
    },
    reset: () => {
      const s = state.current
      s.token = null
      if (s.api && s.id) s.api.reset(s.id)
    }
  }
}

type Status = 'idle' | 'sending' | 'sent' | 'failed'

// 状態の文はすべて最初から HTML に置き、濃さで出し入れする。書体は HTML に出てくる文字だけに
// 絞っているので（scripts/fonts.js）、あとから出す文を HTML に無い文字で書くと別の書体になる
const TEXT = {
  ja: {
    name: 'お名前',
    email: 'メールアドレス',
    message: '内容',
    hint: 'ご依頼・ご相談の内容と、希望の時期など',
    send: '送信',
    sending: '送っています',
    sent: '送りました。折り返しご連絡します。',
    failed: '送れませんでした。時間をおいて試すか、下のアドレスへメールでご連絡ください。'
  },
  en: {
    name: 'Name',
    email: 'Email',
    message: 'Message',
    hint: 'What you have in mind, and when',
    send: 'Send',
    sending: 'Sending…',
    sent: 'Sent. I will get back to you soon.',
    failed: 'Could not send. Please try again later, or email the address below.'
  }
}

const MESSAGES = ['sending', 'sent', 'failed'] as const

export function ContactForm({lang}: {lang: Lang}) {
  const text = TEXT[lang]
  const [status, setStatus] = useState<Status>('idle')
  const box = useRef<HTMLDivElement>(null)
  const turnstile = useTurnstile(box)

  const submit = async (event: SubmitEvent) => {
    event.preventDefault()
    const form = event.currentTarget as HTMLFormElement
    const data = new FormData(form)
    setStatus('sending')
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: {'content-type': 'application/json'},
        body: JSON.stringify({
          name: data.get('name'),
          email: data.get('email'),
          message: data.get('message'),
          token: await turnstile.token()
        })
      })
      if (!response.ok) throw new Error(`${response.status}`)
      form.reset()
      setStatus('sent')
    } catch {
      setStatus('failed')
    } finally {
      turnstile.reset()
    }
  }

  return (
    <form
      onSubmit={submit}
      onFocusIn={turnstile.start}
      // 送ったあと、また書き始めたら結果の文を下げる
      onInput={() => status !== 'sending' && setStatus('idle')}
      className="flex max-w-2xl flex-col gap-6"
    >
      <Field label={text.name}>
        <input name="name" required maxLength={100} autoComplete="name" className={INPUT} />
      </Field>
      <Field label={text.email}>
        <input name="email" type="email" required maxLength={254} autoComplete="email" className={INPUT} />
      </Field>
      <Field label={text.message}>
        <textarea
          name="message"
          required
          maxLength={5000}
          rows={6}
          placeholder={text.hint}
          className={`${INPUT} resize-y placeholder:text-inherit placeholder:opacity-30`}
        />
      </Field>
      <div ref={box} />
      <div className="flex flex-col items-start gap-3">
        <button
          type="submit"
          disabled={status === 'sending'}
          className="cursor-pointer border border-white/25 bg-transparent px-6 py-2 text-inherit transition-[border-color,opacity] duration-300 hover:border-white/60 focus-visible:border-white/60 disabled:cursor-default disabled:opacity-55"
        >
          {text.send}
        </button>
        <p className="grid text-sm" aria-live="polite">
          {MESSAGES.map((key) => (
            <span
              key={key}
              className={`col-start-1 row-start-1 transition-[opacity,translate] duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${status === key ? 'opacity-55' : 'pointer-events-none translate-y-1 opacity-0'}`}
              aria-hidden={status !== key}
            >
              {text[key]}
            </span>
          ))}
        </p>
      </div>
    </form>
  )
}

// 入力した文字は、絞った書体（scripts/fonts.js）に無いことが多いので、端末の書体で書く。
// 1 つの欄の中で書体が混ざらないようにするため
const INPUT =
  'block w-full rounded-none border-0 border-b border-white/20 bg-transparent px-0 py-2 [font-family:system-ui,sans-serif] font-light text-inherit outline-none transition-colors duration-300 focus:border-white/60'

function Field({label, children}: {label: string; children: ComponentChildren}) {
  return (
    <label className="block">
      <span className="text-sm opacity-55">{label}</span>
      {children}
    </label>
  )
}
