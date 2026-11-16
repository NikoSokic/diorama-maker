// Language guessing: the UI language from the browser, the story language from the text itself.

import type { Lang } from '../api/types'

export const LANG_STORAGE_KEY = 'dm.lang'

/** Languages a Croatian UI serves better than an English one. */
const CROATIAN_LIKE = /^(hr|bs|sr|sh|cnr)\b/i

/** UI language: the saved choice, else the first browser language we speak, else English. */
export function pickUiLang(saved: string | null | undefined, browserLangs: readonly string[] | undefined): Lang {
  if (saved === 'hr' || saved === 'en') return saved
  for (const tag of browserLangs ?? []) {
    if (CROATIAN_LIKE.test(tag)) return 'hr'
    if (/^en\b/i.test(tag)) return 'en'
  }
  return 'en'
}

const HR_WORDS = new Set(
  'je se su bio bila bilo jednom koji koja koje što kako kad kada ali onda zatim mali mala malo jedan jedna jedno bez iz od za sa na u i nije svoj svoju njegov njezin dok jer gdje tamo ovdje vrlo jako prijatelj prijatelja priča šuma šumi more zmaj mačak pas kuća kući sunce mjesec zvijezda zvijezde htio htjela dan noć'.split(
    ' ',
  ),
)
const EN_WORDS = new Set(
  'the a an and was were is are once upon time who that with his her their they she he it but then when little small big one day night to of in on at for from into out friend friends story said went saw found wanted had have very there here home sun moon star stars'.split(
    ' ',
  ),
)

/**
 * Language of a story text, or null when it is too short or too mixed to tell.
 * Croatian letters are a strong sign; otherwise the commonest little words decide.
 */
export function detectStoryLang(text: string): Lang | null {
  const words = text.toLowerCase().match(/\p{L}+/gu) ?? []
  if (words.length < 3) return null
  let hr = (text.match(/[čćžšđ]/gi) ?? []).length * 2
  let en = 0
  for (const word of words) {
    if (HR_WORDS.has(word)) hr += 1
    if (EN_WORDS.has(word)) en += 1
  }
  if (hr === en || Math.max(hr, en) < 2) return null
  return hr > en ? 'hr' : 'en'
}
