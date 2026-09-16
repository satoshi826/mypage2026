import {Link, useRoute} from 'wouter'
import {NAV_ROUTES, NAME} from './routes'

const LINK = 'pointer-events-auto no-underline tracking-[0.12em] transition-opacity duration-300'

function NavLink({path, label}: {path: string; label: string}) {
  const [isActive] = useRoute(path)
  return (
    <Link
      href={path}
      aria-current={isActive ? 'page' : undefined}
      className={`${LINK} opacity-55 hover:opacity-100 focus-visible:opacity-100 aria-[current=page]:opacity-100`}
    >
      {label}
    </Link>
  )
}

export function Nav() {
  return (
    <nav className="pointer-events-none fixed inset-x-0 top-0 z-10 box-border flex min-h-(--spacing-nav) items-baseline justify-between gap-4 border-b border-white/10 bg-black/35 px-8 py-6 backdrop-blur-[14px] max-sm:px-5 max-sm:py-4">
      <Link href="/" className={`${LINK} text-sm max-sm:text-xs`}>
        {NAME}
      </Link>
      {/* 狭い画面では名前とリンクが1行に収まらず、ナビが2行に伸びて
          --spacing-nav とずれる。360px で収まるところまで詰める */}
      <div className="flex gap-6 text-xs max-sm:gap-3 max-sm:text-[0.625rem]">
        {NAV_ROUTES.map(({path, label}) => (
          <NavLink key={path} path={path} label={label!} />
        ))}
      </div>
    </nav>
  )
}
