import {useManifest, worksOf} from '../../photos'
import {Gallery} from '../../gallery/Gallery'
import {Lightbox} from '../../gallery/Lightbox'
import {useEditorTools} from '../editing'
import {Heading, Page, Text} from '../Page'

// 撮影の依頼の実績。案件（一覧の projects）ごとに、その案件の写真（category が works）を並べる。サイトの上で
// 案件を作り、写真を足して並べ替える。ジャンル別の見出しは立てず、案件ごとに区切って 1 本の流れで並べる。
// 案件の頭に細い線と、種類と説明の 1 行を置く（About の欄と同じ形）。写真の無い案件は編集中だけ出す。
// ページの説明文は置かない。何を撮るかは案件の種類が示し、撮り方の考えは About のステートメントに任せる。
// 調査: reports/写真家の依頼仕事の見せ方.md。説明は仮。本人のメモが届いたら差し替える
export function Works() {
  const manifest = useManifest()
  const tools = useEditorTools()
  const works = manifest ? worksOf(manifest).filter((work) => tools || work.photos.length) : []
  return (
    <Page title="Works">
      {tools && <tools.AddProject />}
      {works.map(({project, photos}) => (
        // data-project はファイルを落としたときの足す先（src/editor）
        <section key={project.id} data-project={project.id} className="relative mb-16 border-t border-white/10 pt-6">
          <div className="mb-6 grid grid-cols-[10rem_1fr] gap-x-8 max-sm:grid-cols-1 max-sm:gap-y-1">
            <h2 className="m-0 text-xs font-normal tracking-[0.1em] opacity-55">{project.tag}</h2>
            <p className="m-0 text-sm">{project.caption}</p>
          </div>
          {tools && <tools.Project project={project} />}
          <Gallery photos={photos} label="Works" add={{category: 'works', project: project.id}} opens="lightbox" />
        </section>
      ))}
      <Lightbox />
      {works.length === 0 && (
        <>
          <Heading>準備中</Heading>
          <Text>撮影の実績をまとめています。</Text>
        </>
      )}
    </Page>
  )
}
