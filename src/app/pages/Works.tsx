import {usePhotos, type Photo} from '../../photos'
import {Gallery} from '../../gallery/Gallery'
import {Heading, Text} from '../Page'

// 撮影の依頼の実績。写真は R2 の一覧で category が works のもの（サイトの上で足し、並べ替える）。ジャンル別の
// 見出しは立てず、1 本の流れで並べる。案件は並び順で表し、最初の写真に種類と説明の 1 行を添える
// （調査: reports/写真家の依頼仕事の見せ方.md）。説明は仮。本人のメモが届いたら差し替える
export function Works() {
  const photos = usePhotos()?.filter((photo) => photo.category === 'works') ?? []
  return (
    <div className="mx-auto min-h-[100svh] max-w-7xl px-8 pt-[calc(var(--spacing-nav)+3.5rem)] pb-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+2rem)] max-sm:px-4">
      <h1 className="mb-8 text-[1.75rem] tracking-[0.05em]">Works</h1>
      <Text>公演・講演・ポートレートの撮影。街で光と影を見るのと同じ目で、人と場を撮ります。</Text>
      <div className="mt-12">
        <Gallery photos={photos} label="Works" caption={captionOf} />
      </div>
      {photos.length === 0 && (
        <>
          <Heading>準備中</Heading>
          <Text>撮影の実績をまとめています。</Text>
        </>
      )}
    </div>
  )
}

/** 案件の最初の写真に出す 1 行。種類と説明をつなぐ（例: Performance — Conductor / Hall / 2025） */
const captionOf = (photo: Photo) => (photo.caption ? [photo.tag, photo.caption].filter(Boolean).join(' — ') : undefined)
