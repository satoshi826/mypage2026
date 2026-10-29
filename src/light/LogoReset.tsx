import {GLOW_HOVER} from '../app/glow'
import {useArrange} from './arrange'

/**
 * フッターの左に置く、動かしたロゴをもとの位置へ戻す操作。hero の再生操作と同じ場所に重ね、ロゴを動かしたあと
 * （光がついて hero の再生操作が隠れているあいだ）だけ出す。状態と操作は Light が arrange.ts に出したものを使う
 */
export function LogoReset() {
  const arrange = useArrange()
  if (!arrange) return null
  return (
    <button
      type="button"
      onClick={arrange.reset}
      aria-label="Reset"
      aria-hidden={!arrange.moved}
      tabIndex={arrange.moved ? 0 : -1}
      // before は指の当たり判定。配置を変えずに 44px を確保する
      className={`glow-mark relative flex cursor-pointer transition-[opacity,filter] duration-700 before:absolute before:top-1/2 before:left-1/2 before:size-11 before:-translate-x-1/2 before:-translate-y-1/2 before:content-[''] ${GLOW_HOVER} ${arrange.moved ? '' : 'pointer-events-none opacity-0'}`}
    >
      {/* 反時計回りの矢印。線の太さはフッターの SNS のアイコンと同じ */}
      <svg viewBox="0 0 24 24" aria-hidden className="size-5" fill="none" stroke="currentColor" stroke-width={1.5}>
        <path d="M5 12a7 7 0 1 0 2.05-4.95" />
        <path d="M4.5 3.5v4h4" />
      </svg>
    </button>
  )
}
