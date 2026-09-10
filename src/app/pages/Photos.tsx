import {PHOTOS} from '../../hero/photos'
import {Page} from '../Page'

// TODO: 撮影ジャンルが決まったら、シリーズ別かジャンル別かに分ける（docs/site.md 参照）。
// 今はフラットなグリッド。効果はかけず、素直に大きく見せる。
//
// hero/photos の一覧を流用しているのは仮。あの webp は粒子グリッドの実寸・グレースケール
// に最適化したもので、鑑賞用には解像度が足りない。このページ専用の高解像度版と
// サムネイルを別に用意する。
export function Photos() {
  return (
    <Page title="Photos">
      <div className="grid grid-cols-1 gap-16">
        {PHOTOS.map(({src, title}, i) => (
          <img
            key={i}
            src={src}
            alt={title}
            width={1152}
            height={768}
            loading="lazy"
            decoding="async"
            className="block aspect-3/2 h-auto w-full object-cover"
          />
        ))}
      </div>
    </Page>
  )
}
