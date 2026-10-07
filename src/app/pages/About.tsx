import type {ReactNode} from 'react'
import {Page} from '../Page'

// 仮実装。内容は docs/profile.md を元にしている。ステートメントは note のエッセイから
// 起こした下書きなので、本人の言葉に差し替える。

const LINKS = [
  ['Instagram', 'https://www.instagram.com/mu.8263104/'],
  ['X', 'https://x.com/stosto826'],
  ['note', 'https://note.com/mu826'],
  ['1x', 'https://1x.com/satoshi826'],
  ['500px', 'https://500px.com/p/satoshi826']
] as const

// 作品名は出さない。賞名のリンク先は代表する1点の公式ページ
const AWARDS = [
  [
    '2024',
    'Tokyo International Foto Awards',
    'Honorable Mention, Street Photography',
    'https://www.tokyofotoawards.jp/winners/hm/2024/12681/'
  ],
  [
    '2025',
    '11th Fine Art Photography Awards',
    'Nominee, Street Photography',
    'https://fineartphotoawards.com/winners-gallery/fapa-2024-2025/amateur/street-photography/hm/23448'
  ]
] as const

export function About() {
  return (
    <Page title="About">
      <p className="mb-4 max-w-3xl text-[1.5rem]/[1.6] tracking-[0.02em] max-sm:text-xl">
        目に見えている景色と、脳が見ているつもりの景色の差を探して、街を撮っています。光そのものは写らないので、影と明暗と質感を通して撮ります。
      </p>
      <p className="mb-24 max-w-3xl text-sm opacity-55">
        Looking for the gap between what the eye sees and what the mind thinks it sees.
      </p>

      <Section label="Profile">
        <Row label="Name">
          Satoshi Hata <span className="opacity-55">/ mu</span>
        </Row>
        <Row label="Based in">Kanagawa, Japan</Row>
        <Row label="Subject">Street / Architecture / Abstract</Row>
        <Row label="Also">Web engineer</Row>
      </Section>

      <Section label="Awards">
        {AWARDS.map(([year, name, result, href]) => (
          <Row key={name} label={year}>
            <a href={href} target="_blank" rel="noreferrer" className="no-underline hover:underline">
              {name}
            </a>{' '}
            <span className="opacity-55">— {result}</span>
          </Row>
        ))}
      </Section>

      <Section label="Equipment">
        <Row label="Camera">Sony α7R II</Row>
        <Row label="Lens">
          Voigtländer NOKTON 50mm F1.5
          <br />
          Voigtländer SUPER WIDE-HELIAR 15mm F4.5
          <br />
          Minolta M-Rokkor 90mm F4
        </Row>
      </Section>

      <Section label="Links">
        {LINKS.map(([name, href]) => (
          <Row key={name} label={name}>
            <a href={href} target="_blank" rel="noreferrer" className="no-underline hover:underline">
              {href.replace(/^https:\/\/(www\.)?/, '').replace(/\/$/, '')}
            </a>
          </Row>
        ))}
      </Section>
    </Page>
  )
}

function Section({label, children}: {label: string; children: ReactNode}) {
  return (
    <section className="mb-16 grid grid-cols-[10rem_1fr] gap-x-8 border-t border-white/10 pt-6 max-sm:grid-cols-1 max-sm:gap-y-4">
      <h2 className="m-0 text-xs font-normal tracking-[0.1em] opacity-55">{label}</h2>
      <dl className="m-0 grid grid-cols-[7rem_1fr] gap-x-6 gap-y-3 max-sm:grid-cols-[5.5rem_1fr]">{children}</dl>
    </section>
  )
}

function Row({label, children}: {label: string; children: ReactNode}) {
  return (
    <>
      <dt className="text-sm opacity-55">{label}</dt>
      <dd className="m-0">{children}</dd>
    </>
  )
}
