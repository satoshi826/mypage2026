// 計測の条件（端末）と場面。run.mjs が組み合わせて回す。
// 場面は「同じ操作を同じ量だけ」行うこと。比べたいのは実装の差なので、操作の量や待ち時間は変えない
// （変えたら、それ以前の結果とは比べられない）。

import {PredefinedNetworkConditions} from 'puppeteer-core'

/**
 * 端末の条件。cpu は CPU を何倍遅くするか、network は読み込みの場面だけに掛ける通信の条件。
 * hasTouch の端末はタッチで操作する（タッチの環境では自前のスクロールバーも慣性スクロールも効かない）
 */
export const PROFILES = {
  'mobile-low': {
    viewport: {width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true},
    cpu: 6,
    network: PredefinedNetworkConditions['Slow 4G']
  },
  desktop: {
    viewport: {width: 1440, height: 900, deviceScaleFactor: 2},
    cpu: 1,
    network: null
  }
}

/** 操作のあと、動き（写真の移動 1.2 秒、ページの移動など）が収まるまで待つ ms */
const SETTLE = 1500

/**
 * 場面。load は読み込みを測る（cache: false はキャッシュ無し、true は一度開いてから開き直す）。
 * interaction は path を開いて落ち着いてから setup を行い、run のあいだの滑らかさとメインスレッドの内訳を測る
 */
export const SCENARIOS = {
  'load-top-cold': {kind: 'load', path: '/', cache: false},
  'load-top-warm': {kind: 'load', path: '/', cache: true},
  'load-photos-cold': {kind: 'load', path: '/photos', cache: false},
  'load-photos-warm': {kind: 'load', path: '/photos', cache: true},

  // 一覧を 6000px 流す
  'photos-scroll': {
    kind: 'interaction',
    path: '/photos',
    async run({scroll, wait}) {
      await scroll(6000)
      await wait(SETTLE)
    }
  },

  // 列数を 5 → 2 → 4 → 3 と切り替える。写真が一斉に動く（スマホは 5 列まで）。列数はスライダー
  // （input[type=range]）の値を変えて選ぶ。操作の速さに左右されず、毎回同じ切り替えになるように
  'photos-columns': {
    kind: 'interaction',
    path: '/photos',
    async setup({page, wait}) {
      await page.evaluate(() => scrollTo(0, 1500))
      await wait(500)
    },
    async run({page, wait}) {
      for (const columns of [5, 2, 4, 3]) {
        await page.evaluate((value) => {
          const input = [...document.querySelectorAll('input[data-slider]')].find((i) => Number(i.max) >= value)
          // React は値の書き換えを input イベントで拾うので、ネイティブの setter で書いてから知らせる
          Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, String(value))
          input.dispatchEvent(new Event('input', {bubbles: true}))
        }, columns)
        await wait(SETTLE)
      }
    }
  },

  // 画面の中央に近い写真を広げ、もう一度押して戻す。これを 3 回
  'photos-expand': {
    kind: 'interaction',
    path: '/photos',
    async setup({page, wait}) {
      await page.evaluate(() => scrollTo(0, 1200))
      await wait(500)
    },
    async run({page, press, wait}) {
      for (let i = 0; i < 3; i++) {
        const figure = (
          await page.evaluateHandle(
            () =>
              // 広げていない写真のうち、中心が画面の中心にいちばん近いもの
              [...document.querySelectorAll('figure.cursor-zoom-in')]
                .map((f) => {
                  const r = f.getBoundingClientRect()
                  return {f, d: Math.abs(r.top + r.height / 2 - innerHeight / 2)}
                })
                .filter(({d}) => d < innerHeight / 2)
                .sort((a, b) => a.d - b.d)[0]?.f
          )
        ).asElement()
        if (!figure) throw new Error('画面に広げられる写真が無い')
        await press(figure)
        await wait(SETTLE)
        await press(figure)
        await wait(SETTLE)
      }
    }
  },

  // トップ → Photos → About → Works → Contact → トップ
  'page-transition': {
    kind: 'interaction',
    path: '/',
    async run({press, wait}) {
      for (const href of ['/photos', '/about', '/works', '/contact', '/']) {
        await press(`nav a[href="${href}"]`)
        await wait(2000)
      }
    }
  },

  // hero を 5 秒再生したまま置く
  'hero-idle': {
    kind: 'interaction',
    path: '/',
    async setup({page}) {
      await page.waitForFunction(() => performance.getEntriesByName('hero:photo').length >= 2, {timeout: 30000})
    },
    async run({wait}) {
      await wait(5000)
    }
  }
}
