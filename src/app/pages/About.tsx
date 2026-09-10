import {NAME} from '../routes'
import {Page, Text} from '../Page'

// TODO: ステートメントと経歴（個展・掲載・受賞）を入れる。
export function About() {
  return (
    <Page title="About">
      <Text>{NAME}. 写真家 / エンジニア.</Text>
    </Page>
  )
}
