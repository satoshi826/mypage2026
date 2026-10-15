import {useEffect, useState} from 'preact/hooks'

// サイトに載せる写真の一覧。正本は R2 の manifest.json で、Worker の /api/manifest から
// 実行時に読む（写真の追加・入れ替えで再ビルドしない）。画像も /images/ 経由で R2 から。
// 形と派生画像の段（VARIANTS）は manifest.ts。管理画面（/admin）が書き換える。

export {CATEGORIES, heroSrc, isCategory, type Category, type Photo} from './manifest'
import {
  imageUrl,
  isCategory,
  HOVER,
  LIST_HEADROOM,
  parseManifest,
  VARIANTS,
  type Category,
  type Photo,
  type Variant
} from './manifest'

/** URL（/photos/:category）のカテゴリ。省略や知らない値は street */
export const toCategory = (value: string | undefined): Category => (isCategory(value) ? value : 'street')

/** 表示に使う派生画像。width はその段での写真の幅（画素） */
export type Source = {src: string; width: number; use: Variant['use']}

/**
 * 表示に使う派生画像を選ぶ。need は要る幅（表示幅 × 画面の密度、画素）。その段の中で need 以上の
 * 一番小さいものを選び、足りなければ一番大きいもの。一覧用は、マウスのある端末では need に余裕（LIST_HEADROOM）を掛ける。
 * large は広げたとき。一覧で一覧用の最大でも足りないときは、拡大用の最大を使う
 */
export function pickSource(photo: Photo, need: number, large: boolean): Source {
  const ladder = VARIANTS.filter((v) => v.use === (large ? 'large' : 'list'))
  if (!large) ladder.push(VARIANTS[VARIANTS.length - 1])
  const target = large || !matchMedia(HOVER).matches ? need : need * LIST_HEADROOM
  const sources = ladder.map((variant) => ({
    src: imageUrl(variant.kind, photo),
    width: Math.round(photo.w * Math.min(1, variant.long / Math.max(photo.w, photo.h))),
    use: variant.use
  }))
  return sources.find((source) => source.width >= target) ?? sources[sources.length - 1]
}

function parse(body: unknown): Photo[] {
  const result = parseManifest(body)
  if ('error' in result) throw new Error(`manifest: ${result.error}`)
  return result.photos
}

let loading: Promise<Photo[]> | null = null

/** トップと Photos の HTML に Worker が埋め込んだ一覧。ほかのページから入ったときは無い */
function embedded(): Photo[] | null {
  const text = document.getElementById('manifest')?.textContent
  if (!text) return null
  try {
    return parse(JSON.parse(text))
  } catch {
    return null
  }
}

/** 一覧を取得する。HTML に埋め込まれていればそれを使い、無ければ取りに行く。同じセッション内では 1 回だけ */
export function loadPhotos(): Promise<Photo[]> {
  const inline = loading ? null : embedded()
  if (inline) loading = Promise.resolve(inline)
  loading ??= fetch('/api/manifest')
    .then((res) => {
      if (!res.ok) throw new Error(`manifest: ${res.status}`)
      return res.json()
    })
    .then(parse)
    .catch((e) => {
      loading = null
      throw e
    })
  return loading
}

/** 一覧。取得が終わるまで null。失敗したら空配列（写真がないのと同じ扱い） */
export function usePhotos(): Photo[] | null {
  const [photos, setPhotos] = useState<Photo[] | null>(null)
  useEffect(() => {
    let alive = true
    loadPhotos().then(
      (list) => alive && setPhotos(list),
      (e) => {
        console.error(e)
        if (alive) setPhotos([])
      }
    )
    return () => {
      alive = false
    }
  }, [])
  return photos
}
