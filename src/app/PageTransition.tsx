import {DevPanel} from './DevPanel'
import {DEFAULT_PAGE_MOTION, PAGE_MOTION_PARAMS, type PageMotion} from './pageMotion'

// ページの移動に使う部品。仕組みと演出の定義は pageMotion.ts

/** wipe で中身を覆う地の色の幕。ナビとフッターより奥、中身より手前 */
export function PageCover() {
  return (
    <div
      data-page-cover
      aria-hidden
      // 縮めておくのは transform で。クラスの scale にすると、幕を動かす transform と掛け合わさって出てこない
      style={{transform: 'scaleY(0)'}}
      className="pointer-events-none fixed inset-0 z-[5] origin-bottom bg-ground"
    />
  )
}

/** 演出を切り替える開発用パネル。App が import.meta.env.DEV の中でだけ描く */
export function PageMotionPanel({onChange}: {onChange: (motion: PageMotion) => void}) {
  return (
    <div className="pointer-events-none fixed right-4 bottom-[calc(var(--spacing-footer)+1rem)] z-20">
      <DevPanel
        title="ページの移動"
        typeName="PageMotion"
        constName="DEFAULT_PAGE_MOTION"
        params={PAGE_MOTION_PARAMS}
        defaults={DEFAULT_PAGE_MOTION}
        storageKey="mypage2026.pageMotion"
        onChange={onChange}
      />
    </div>
  )
}
