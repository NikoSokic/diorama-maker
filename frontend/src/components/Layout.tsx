import type { ReactNode } from 'react'
import { NavLink, Link } from 'react-router'
import { useI18n } from '../i18n/I18n'

export const BTN =
  'inline-flex items-center justify-center gap-2 rounded-full bg-[#ff7a59] px-7 py-3 text-lg font-bold text-white shadow-[0_5px_0_#d9532f] transition-transform hover:-translate-y-0.5 active:translate-y-1 active:shadow-[0_1px_0_#d9532f] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3a2a4d] disabled:cursor-not-allowed disabled:opacity-60'
export const BTN_GHOST =
  'inline-flex items-center justify-center gap-2 rounded-full bg-white px-5 py-2.5 font-bold text-[#3a2a4d] shadow-[0_4px_0_#e6d6b8] ring-2 ring-[#3a2a4d]/10 transition-transform hover:-translate-y-0.5 active:translate-y-1 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3a2a4d]'

function LangToggle() {
  const { lang, setLang, t } = useI18n()
  return (
    <div role="group" aria-label={t.nav.language} className="flex rounded-full bg-white/80 p-1 shadow-[0_3px_0_#e6d6b8]">
      {(['hr', 'en'] as const).map((code) => (
        <button
          key={code}
          type="button"
          aria-pressed={lang === code}
          onClick={() => setLang(code)}
          className={`min-h-9 min-w-11 rounded-full px-3 text-sm font-extrabold uppercase transition-colors ${
            lang === code ? 'bg-[#3a2a4d] text-[#fff7e8]' : 'text-[#3a2a4d] hover:bg-[#ffcb52]/50'
          }`}
        >
          {code}
        </button>
      ))}
    </div>
  )
}

/** Paper-coloured page frame: header with navigation and the language toggle, footer. */
export function Layout({ children, overlayHeader }: { children: ReactNode; overlayHeader?: boolean }) {
  const { t } = useI18n()
  const link = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-3 py-2 text-sm font-bold sm:text-base ${isActive ? 'bg-[#ffcb52]' : 'hover:bg-[#ffcb52]/40'}`
  return (
    <div className="flex min-h-full flex-col bg-[#fff7e8] text-[#3a2a4d]">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded-full focus:bg-white focus:px-4 focus:py-2">
        {t.nav.skip}
      </a>
      <header className={`z-20 flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-8 ${overlayHeader ? 'absolute inset-x-0 top-0' : ''}`}>
        <Link to="/" className="font-display text-xl font-bold sm:text-2xl">
          <span aria-hidden="true">🎬 </span>
          {t.appName}
        </Link>
        <nav className="flex items-center gap-1 sm:gap-2" aria-label="Main">
          <NavLink to="/" end className={link}>
            {t.nav.home}
          </NavLink>
          <NavLink to="/gallery" className={link}>
            {t.nav.gallery}
          </NavLink>
          <NavLink to="/how-it-works" className={link}>
            {t.nav.how}
          </NavLink>
          <LangToggle />
        </nav>
      </header>
      <div id="main" className="flex-1">
        {children}
      </div>
      <footer className="px-4 py-6 text-center text-sm font-semibold opacity-70">{t.footer.line}</footer>
    </div>
  )
}
