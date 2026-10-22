import {Heading, Page, Text} from '../Page'
import type {Lang} from '../lang'
import {ContactForm} from './ContactForm'

const EMAIL = 'hello@mu826.com'

// 受ける依頼の種類と拠点だけを短く書く。種類は「など」で開いておき、依頼の中身は Works の写真に任せる
// （docs/site.md 参照）。料金・流れ・返信の目安は載せない。フォームとメールのどちらでも受ける
const INTRO = {
  ja: [
    '撮影のご依頼や、展示・掲載、ワークショップなどのご相談を受けています。',
    '東京・神奈川を拠点にしています。',
    'お気軽にお問い合わせください。'
  ],
  en: [
    'Open to commissions, exhibitions and publications, workshops, and more.',
    'Based in Tokyo and Kanagawa, Japan.',
    'Feel free to get in touch.'
  ]
}

export function Contact({lang}: {lang: Lang}) {
  return (
    <Page title="Contact">
      {INTRO[lang].map((line) => (
        <Text key={line}>{line}</Text>
      ))}
      <Heading>Form</Heading>
      <ContactForm lang={lang} />
      <Heading>Email</Heading>
      <Text>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </Text>
    </Page>
  )
}
