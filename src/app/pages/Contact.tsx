import {Heading, Page, Text} from '../Page'

const EMAIL = 'stosto826@gmail.com'

// ジャンルは絞らず、作品と撮影実績を見て依頼が来ることを期待する（docs/site.md 参照）。
// 料金・流れ・フォームは載せない。
export function Contact() {
  return (
    <Page title="Contact">
      <Heading>撮影のご依頼</Heading>
      <Text>公演・舞台、インタビュー、ポートレート、建築・空間など、ジャンルは問いません。</Text>
      <Text>作品の掲載・展示、プリントについてのお問い合わせもこちらへ。</Text>
      <Text>内容と希望の時期を添えてメールでご連絡ください。</Text>
      <Heading>Email</Heading>
      <Text>
        <a href={`mailto:${EMAIL}`}>{EMAIL}</a>
      </Text>
    </Page>
  )
}
