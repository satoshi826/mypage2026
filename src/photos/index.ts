import {useEffect, useState} from 'react'

// サイトに載せる写真の一覧。正本は R2 の manifest.json で、Worker の /api/manifest から
// 実行時に読む（写真の追加・入れ替えで再ビルドしない）。画像も /images/ 経由で R2 から。
// 形は worker/manifest.ts と同じ。管理画面（/admin）が書き換える。
//
// | 派生      | キー            | 形 |
// |-----------|-----------------|----|
// | 一覧用    | thumb/<file>.webp   | 長辺 800px。Photos の格子で使う |
// | 拡大用    | gallery/<file>.webp | 長辺 2000px、カラー、トリミングなし。クリックで開く拡大表示と大判の見せ方で使う |
// | hero 用   | hero/<file>.webp    | 1152x768、中央トリミング、グレースケール。hero: true のものだけ |
// | 原本      | originals/<file>.<ext> | 再派生のために置く。公開しない |

export {CATEGORIES, EAGER_THUMBS, isCategory, type Category, type Photo} from './manifest'
import {parseManifest, type Photo} from './manifest'

export const thumbSrc = (photo: Photo) => `/images/thumb/${photo.file}.webp`
export const gallerySrc = (photo: Photo) => `/images/gallery/${photo.file}.webp`
export const heroSrc = (photo: Photo) => `/images/hero/${photo.file}.webp`

function parse(body: unknown): Photo[] {
  const result = parseManifest(body)
  if ('error' in result) throw new Error(`manifest: ${result.error}`)
  return result.photos
}

let loading: Promise<Photo[]> | null = null

/** 一覧を取得する。同じセッション内では1回だけ取りに行く */
export function loadPhotos(): Promise<Photo[]> {
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
