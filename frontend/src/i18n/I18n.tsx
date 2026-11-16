import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { Lang } from '../api/types'
import { LANG_STORAGE_KEY, pickUiLang } from './detect'
import { STRINGS, type Strings } from './strings'

interface I18n {
  lang: Lang
  t: Strings
  setLang: (lang: Lang) => void
}

const I18nContext = createContext<I18n>({ lang: 'hr', t: STRINGS.hr, setLang: () => undefined })

function initialLang(): Lang {
  if (typeof window === 'undefined') return 'hr'
  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(LANG_STORAGE_KEY)
  } catch {
    // Storage can be blocked (private mode); the browser language still works.
  }
  // ?lang=en wins for one visit: handy for shared links and for the screenshot tools.
  const fromUrl = new URLSearchParams(window.location.search).get('lang')
  return pickUiLang(fromUrl ?? saved, navigator.languages ?? [navigator.language])
}

/** App language: auto-detected once, switchable, remembered on this device. */
export function I18nProvider({ children, initial }: { children: ReactNode; initial?: Lang }) {
  const [lang, setLangState] = useState<Lang>(() => initial ?? initialLang())

  const setLang = useCallback((next: Lang) => {
    setLangState(next)
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next)
    } catch {
      // Not remembered, still switched.
    }
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const value = useMemo(() => ({ lang, t: STRINGS[lang], setLang }), [lang, setLang])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

// oxlint-disable-next-line react/only-export-components
export function useI18n(): I18n {
  return useContext(I18nContext)
}

/** Sets the browser tab title while the page is shown. */
// oxlint-disable-next-line react/only-export-components
export function useTitle(title?: string) {
  const { t } = useI18n()
  useEffect(() => {
    document.title = title ? `${title} · ${t.appName}` : t.appName
  }, [title, t])
}
