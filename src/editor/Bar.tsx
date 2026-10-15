import {useLocation} from 'wouter-preact'
import {forget, setEditing, useEditing} from '../app/editing'
import {useExternal} from '../app/useExternal'
import {changes, discard, getState, publish, subscribe} from './draft'
import {setPanelOpen} from './panel'

const useDraft = () => useExternal(subscribe, getState, getState())

const ACTION =
  'cursor-pointer border-0 bg-transparent p-0 text-inherit opacity-70 transition-opacity duration-300 hover:opacity-100 disabled:cursor-default disabled:opacity-30'

/**
 * 右下（フッターのすぐ上）の操作バー。編集の切り替え、未公開の変更の数、公開と破棄、ログアウト。
 * 処理中と失敗はここに文字で出す
 */
export function Bar() {
  const {draft, busy, error} = useDraft()
  const editing = useEditing()
  const [location] = useLocation()
  const count = draft ? changes(draft) : 0
  return (
    <div className="fixed right-4 max-sm:left-4 bottom-[calc(var(--spacing-footer)+env(safe-area-inset-bottom)+12px)] z-20 flex flex-wrap items-center justify-end gap-x-4 gap-y-1.5 whitespace-nowrap border border-white/25 bg-black/70 px-3 py-2 text-xs backdrop-blur-[20px]">
      <button
        type="button"
        aria-pressed={editing}
        onClick={() => setEditing(!editing)}
        className={`${ACTION} flex items-center gap-1.5`}
      >
        <span className={`size-1.5 rounded-full border border-ink ${editing ? 'bg-ink' : ''}`} />
        編集
      </button>
      {editing && location === '/' && (
        <button type="button" onClick={() => setPanelOpen(true)} className={ACTION}>
          hero を編集
        </button>
      )}
      {busy ? (
        <span>{busy}</span>
      ) : error ? (
        <span className="max-w-60 truncate" title={error}>
          {error}
        </span>
      ) : (
        <span className="opacity-55">{count ? `未公開の変更 ${count}` : '変更なし'}</span>
      )}
      <button type="button" onClick={publish} disabled={!count || !!busy} className={ACTION}>
        公開
      </button>
      <button type="button" onClick={discard} disabled={!draft || !!busy} className={ACTION}>
        破棄
      </button>
      <a href="/cdn-cgi/access/logout" onClick={forget} className={`${ACTION} no-underline`}>
        ログアウト
      </a>
    </div>
  )
}
