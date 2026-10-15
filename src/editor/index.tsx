import {render} from 'preact'
import {editorReady, isEditing} from '../app/editing'
import {toCategory} from '../photos'
import {Bar} from './Bar'
import {HeroPanel} from './HeroPanel'
import {start} from './draft'
import {addPhotos} from './ops'
import {select} from './selection'
import {AddTile, PhotoTools} from './Tools'

// サイトの上での編集。ログインしている人にだけ、src/app/editing.ts が動的 import で読み込む。
// 訪問者の JS には入らない。

/** 読み込まれたときに 1 回呼ばれる。操作バーを置き、Gallery に部品を渡し、公開中の一覧を読む */
export function mount() {
  const host = document.createElement('div')
  document.body.append(host)
  render(
    <>
      <Bar />
      <HeroPanel />
    </>,
    host
  )
  editorReady({Photo: PhotoTools, Add: AddTile})
  void start()

  // 写真の外を触ったら、出している操作を閉じる
  addEventListener('pointerdown', (event) => {
    if (!(event.target as Element).closest('[data-photo-tools]')) select(null)
  })

  // Photos では、ファイルを一覧の上へ落としても足せる（今見ているカテゴリの先頭に入る）
  const category = () => {
    const match = location.pathname.match(/^\/photos\/([^/]+)/)
    return match ? toCategory(match[1]) : null
  }
  const files = (event: DragEvent) => !!event.dataTransfer?.types.includes('Files')
  addEventListener('dragover', (event) => {
    if (isEditing() && category() && files(event)) event.preventDefault()
  })
  addEventListener('drop', (event) => {
    const target = category()
    if (!isEditing() || !target || !files(event)) return
    event.preventDefault()
    const images = [...(event.dataTransfer?.files ?? [])].filter((file) => /^image\/(jpeg|png)$/.test(file.type))
    if (images.length) void addPhotos(images, target)
  })
}
