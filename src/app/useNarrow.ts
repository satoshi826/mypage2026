import {useEffect, useState} from 'preact/hooks'

/** 幅の狭い画面（Tailwind の sm 未満）か。プリレンダでは広い画面として描き、ブラウザで測り直す */
export function useNarrow() {
  const [narrow, setNarrow] = useState(false)
  useEffect(() => {
    const media = matchMedia('(max-width: 639px)')
    const update = () => setNarrow(media.matches)
    update()
    media.addEventListener('change', update)
    return () => media.removeEventListener('change', update)
  }, [])
  return narrow
}
