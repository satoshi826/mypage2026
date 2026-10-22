import type {ComponentChildren} from 'preact'
import {Page} from '../Page'
import {AWARDS, EXHIBITIONS, LINKS, PRESS} from '../profile'

// 仮実装。内容は docs/profile.md を元にしている（データは ../profile.ts）。ステートメントは note のエッセイから
// 起こした下書きなので、本人の言葉に差し替える。

export function About() {
  return (
    <Page title="About">
      <p className="mb-24 max-w-3xl text-[1.5rem]/[1.6] tracking-[0.02em] max-sm:text-xl">
        目に見えている景色と、脳が見ているつもりの景色の差を探して、街を撮っています。光そのものは写らないので、影と明暗と質感を通して撮ります。
      </p>

      <Section label="Profile">
        <Row label="Name">
          端 智士
          <br />
          Satoshi Hata <span className="opacity-55">/ mu</span>
        </Row>
        <Row label="Based in">Kanagawa, Japan</Row>
        <Row label="Subject">Street / Architecture / Abstract</Row>
        <Row label="Also">Web engineer</Row>
      </Section>

      <Section label="Awards">
        <Entries items={AWARDS} />
      </Section>

      <Section label="Exhibitions">
        <Entries items={EXHIBITIONS} />
      </Section>

      <Section label="Press">
        <Entries items={PRESS} />
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

function Section({label, children}: {label: string; children: ComponentChildren}) {
  return (
    <section className="mb-16 grid grid-cols-[10rem_1fr] gap-x-8 border-t border-white/10 pt-6 max-sm:grid-cols-1 max-sm:gap-y-4">
      <h2 className="m-0 text-xs font-normal tracking-[0.1em] opacity-55">{label}</h2>
      <dl className="m-0 grid grid-cols-[7rem_1fr] gap-x-6 gap-y-3 max-sm:grid-cols-[5.5rem_1fr]">{children}</dl>
    </section>
  )
}

/** 年・名前（公式ページへのリンク）・結果の並び */
function Entries({items}: {items: typeof AWARDS}) {
  return items.map(([year, name, result, href]) => (
    <Row key={name} label={year}>
      <a href={href} target="_blank" rel="noreferrer" className="no-underline hover:underline">
        {name}
      </a>{' '}
      <span className="opacity-55">— {result}</span>
    </Row>
  ))
}

function Row({label, children}: {label: string; children: ComponentChildren}) {
  return (
    <>
      <dt className="text-sm opacity-55">{label}</dt>
      <dd className="m-0">{children}</dd>
    </>
  )
}
