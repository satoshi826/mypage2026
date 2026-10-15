import {render} from 'preact'
import {editorReady} from '../app/editing'
import {Bar} from './Bar'
import {start} from './draft'

// サイトの上での編集。ログインしている人にだけ、src/app/editing.ts が動的 import で読み込む。
// 訪問者の JS には入らない。

/** 読み込まれたときに 1 回呼ばれる。操作バーを置き、公開中の一覧を読む */
export function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  render(<Bar />, host)
  editorReady()
  void start()
}
