import {usePhotos, type Photo} from '../../photos'
import {Gallery} from '../../gallery/Gallery'
import {Heading, Text} from '../Page'

// 撮影の依頼の実績。写真は R2 の一覧で category が works のもの（サイトの上で足し、並べ替える）。ジャンル別の
// 見出しは立てず、案件ごとに区切って 1 本の流れで並べる。案件は並び順で表し、説明の 1 行（caption）を持つ
// 写真から次の案件が始まる。案件の頭に細い線と、種類と説明の 1 行を置く（About の欄と同じ形）。
// 調査: reports/写真家の依頼仕事の見せ方.md。説明は仮。本人のメモが届いたら差し替える
export function Works() {
  const photos = usePhotos()?.filter((photo) => photo.category === 'works') ?? []
  const projects = projectsOf(photos)
  return (
    <div className="mx-auto min-h-[100svh] max-w-7xl px-8 pt-[calc(var(--spacing-nav)+3.5rem)] pb-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+2rem)] max-sm:px-4">
      <h1 className="mb-8 text-[1.75rem] tracking-[0.05em]">Works</h1>
      <Text>公演・講演・ポートレートの撮影。街で光と影を見るのと同じ目で、人と場を撮ります。</Text>
      <div className="mt-16">
        {projects.map((project, i) => (
          <section key={project[0].file} className="mb-16 border-t border-white/10 pt-6">
            <div className="mb-6 grid grid-cols-[10rem_1fr] gap-x-8 max-sm:grid-cols-1 max-sm:gap-y-1">
              <h2 className="m-0 text-xs font-normal tracking-[0.1em] opacity-55">{project[0].tag}</h2>
              <p className="m-0 text-sm">{project[0].caption}</p>
            </div>
            {/* 編集中の「＋」は先頭の案件にだけ置く。足した写真は Works の先頭に入る */}
            <Gallery photos={project} label="Works" add={i === 0} expandable={false} />
          </section>
        ))}
      </div>
      {photos.length === 0 && (
        <>
          {/* 写真が 1 枚も無くても、編集中は「＋」の枠から足せるようにする（訪問者には何も出ない） */}
          <Gallery photos={[]} label="Works" />
          <Heading>準備中</Heading>
          <Text>撮影の実績をまとめています。</Text>
        </>
      )}
    </div>
  )
}

/** 並び順の写真を案件に分ける。説明の 1 行を持つ写真から次の案件。先頭は持っていなくても 1 つ目の案件 */
function projectsOf(photos: Photo[]): Photo[][] {
  const projects: Photo[][] = []
  for (const photo of photos) {
    if (projects.length === 0 || photo.caption) projects.push([photo])
    else projects[projects.length - 1].push(photo)
  }
  return projects
}
