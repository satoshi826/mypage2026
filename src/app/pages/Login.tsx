import {useEffect} from 'preact/hooks'
import {remember} from '../editing'
import {Page, Text} from '../Page'

/**
 * /admin。Cloudflare Access のログインを通った人だけがここに来る。このブラウザに目印を残して、元のページ
 * （?return=、無ければ Photos）へ戻る。戻った先で編集できるようになる（src/app/editing.ts）
 */
export function Login() {
  useEffect(() => {
    remember()
    const back = new URLSearchParams(location.search).get('return')
    location.replace(back?.startsWith('/') && !back.startsWith('//') ? back : '/photos/street')
  }, [])
  return (
    <Page title="Login">
      <Text>ログインしました。</Text>
    </Page>
  )
}
