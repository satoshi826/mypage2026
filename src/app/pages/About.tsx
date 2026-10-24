import type {ComponentChildren} from 'preact'
import {Page} from '../Page'
import type {Lang} from '../lang'
import {AWARDS, EXHIBITIONS, LINKS, PRESS} from '../profile'

// 内容は docs/profile.md を元にしている（データは ../profile.ts）。
// 欄の名前と経歴はもともと英語なので、言語で変わるのはステートメントだけ

/**
 * ステートメント。詩のように行で区切って読ませるので、1 行ずつ持つ。
 * 日本語は狭い画面で行の中が折り返すとき、語の途中で切れないよう、切ってよい位置を | で示す
 */
const STATEMENT = {
  ja: [
    'カメラを始めて、|まだ|名前の|ついていない|美しさが、|世界に|潜んでいると|知りました。',
    '街にも、|人にも、|ありふれた|ものにも。',
    '光が|通った|跡に、|現れては|消える|それを、|写真という|形で|残したい。'
  ],
  en: [
    'Through the camera, I learned that the world holds a beauty yet to be named.',
    'In streets, in people, in ordinary things.',
    'Where light has passed, it appears and fades.',
    'I want to keep it in the form of a photograph.'
  ]
}

export function About({lang}: {lang: Lang}) {
  return (
    <Page title="About">
      <p className="mb-24 max-w-3xl text-lg/[1.9] tracking-[0.04em] max-sm:text-base/[1.9]">
        {STATEMENT[lang].map((line) => (
          // 折り返してよいのは <wbr> の位置だけにする（英語は語の間の空白でも折り返す）
          <span key={line} className="block break-keep">
            {line.split('|').map((phrase, i) => (
              <>
                {i > 0 && <wbr />}
                {phrase}
              </>
            ))}
          </span>
        ))}
      </p>

      <Section label="Profile">
        <Row label="Name">
          端 智士
          <br />
          Satoshi Hata <span className="opacity-55">/ mu</span>
        </Row>
        <Row label="Based in">Tokyo / Kanagawa, Japan</Row>
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
