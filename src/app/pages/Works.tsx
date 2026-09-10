import {Link} from 'wouter'
import {Heading, Page, Text} from '../Page'

// TODO: 実装を増やしたら一覧にする。現在は粒子モーフの1件のみ。
export function Works() {
  return (
    <Page title="Works">
      <Heading>Particle morph</Heading>
      <Text>
        写真の全画素を粒子として描き、輝度のランクで対応を取ることで、複数の写真を
        任意の順序でモーフさせる実装。対応表を写真の組み合わせごとに作るのではなく、
        各写真を独立に「輝度ランク空間」へ写すことで、任意の2枚が自動的に接続される。
      </Text>
      <Text>
        <Link href="/">トップページで動いているもの</Link>
      </Text>
    </Page>
  )
}
