// Narration through the Web Speech API. Everything degrades to "subtitles only": no API, no voice for the
// language, or a browser that refuses to speak all end in the same silent, working player.

import type { Lang } from '../../api/types'

export interface VoiceLike {
  lang: string
  name: string
  localService?: boolean
}

const LOCALES: Record<Lang, { exact: string; language: string; relatives: string[] }> = {
  hr: { exact: 'hr-hr', language: 'hr', relatives: ['bs', 'sr'] },
  en: { exact: 'en-us', language: 'en', relatives: [] },
}

function score(voice: VoiceLike, lang: Lang): number {
  const want = LOCALES[lang]
  const tag = voice.lang.replace('_', '-').toLowerCase()
  const language = tag.split('-')[0]
  let points = 0
  if (tag === want.exact) points = 100
  else if (language === want.language) points = 60
  // Close relatives read Croatian text understandably; anything else would be gibberish.
  else if (want.relatives.includes(language) && !/cyrl/.test(tag)) points = 20
  else return 0
  if (/natural|neural|online|google|premium|enhanced/i.test(voice.name)) points += 8
  if (voice.localService) points += 1
  return points
}

/** Best voice for the language, or undefined when none can read it (then the story stays silent). */
export function pickVoice<T extends VoiceLike>(voices: readonly T[], lang: Lang): T | undefined {
  let best: T | undefined
  let bestScore = 0
  for (const voice of voices) {
    const s = score(voice, lang)
    if (s > bestScore) {
      best = voice
      bestScore = s
    }
  }
  return best
}

export interface SpeakHandlers {
  onStart?: () => void
  onEnd?: () => void
}

export class Narrator {
  private readonly synth: SpeechSynthesis | null
  private token = 0

  constructor() {
    this.synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null
  }

  get supported() {
    return this.synth !== null
  }

  private async voices(): Promise<SpeechSynthesisVoice[]> {
    const synth = this.synth
    if (!synth) return []
    const now = synth.getVoices()
    if (now.length > 0) return now
    // Chrome fills the list asynchronously.
    return new Promise((resolve) => {
      const done = () => {
        synth.removeEventListener('voiceschanged', done)
        clearTimeout(timer)
        resolve(synth.getVoices())
      }
      const timer = setTimeout(done, 1200)
      synth.addEventListener('voiceschanged', done)
    })
  }

  speak(text: string, lang: Lang, handlers: SpeakHandlers = {}) {
    const synth = this.synth
    if (!synth || !text.trim()) return
    const token = ++this.token
    void this.voices().then((voices) => {
      if (token !== this.token) return
      const voice = pickVoice(voices, lang)
      // Voices are known and none fits: stay silent. (Some phones never list voices but still speak.)
      if (voices.length > 0 && !voice) return
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = voice?.lang ?? (lang === 'hr' ? 'hr-HR' : 'en-US')
      if (voice) utterance.voice = voice
      utterance.rate = 0.92
      utterance.pitch = 1.08
      const finish = () => {
        if (token === this.token) handlers.onEnd?.()
      }
      utterance.onstart = () => {
        if (token === this.token) handlers.onStart?.()
      }
      utterance.onend = finish
      utterance.onerror = finish
      try {
        synth.cancel()
        synth.speak(utterance)
      } catch {
        finish()
      }
    })
  }

  pause() {
    const synth = this.synth
    if (!synth) return
    try {
      synth.pause()
    } catch {
      // Nothing to pause.
    }
    // Chrome on Android ignores pause(): the voice would talk on over a frozen picture. Stop it instead.
    const token = this.token
    setTimeout(() => {
      if (token === this.token && synth.speaking && !synth.paused) this.cancel()
    }, 250)
  }

  resume() {
    try {
      this.synth?.resume()
    } catch {
      // Nothing to resume.
    }
  }

  cancel() {
    this.token++
    try {
      this.synth?.cancel()
    } catch {
      // Already quiet.
    }
  }
}
