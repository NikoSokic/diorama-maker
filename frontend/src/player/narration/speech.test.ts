import { describe, expect, it } from 'vitest'
import { Narrator, pickVoice, type VoiceLike } from './speech'

const voice = (lang: string, name: string, localService = true): VoiceLike => ({ lang, name, localService })

describe('pickVoice', () => {
  const voices = [
    voice('en-GB', 'Daniel'),
    voice('en-US', 'Samantha'),
    voice('en-US', 'Microsoft Aria Online (Natural)', false),
    voice('de-DE', 'Anna'),
    voice('hr-HR', 'Microsoft Matej'),
    voice('sr-RS', 'Nikola'),
  ]

  it('prefers the exact locale and a natural voice', () => {
    expect(pickVoice(voices, 'en')?.name).toBe('Microsoft Aria Online (Natural)')
    expect(pickVoice(voices, 'hr')?.name).toBe('Microsoft Matej')
  })

  it('accepts another variant of the same language', () => {
    expect(pickVoice([voice('en-AU', 'Karen'), voice('fr-FR', 'Amelie')], 'en')?.name).toBe('Karen')
    expect(pickVoice([voice('hr', 'Lana')], 'hr')?.name).toBe('Lana')
  })

  it('reads underscores and case the way Android reports them', () => {
    expect(pickVoice([voice('hr_HR', 'Android hr')], 'hr')?.name).toBe('Android hr')
    expect(pickVoice([voice('EN_us', 'Android en')], 'en')?.name).toBe('Android en')
  })

  it('falls back to a close relative for Croatian, but never to Cyrillic or an unrelated language', () => {
    expect(pickVoice([voice('en-US', 'Samantha'), voice('bs-BA', 'Goran')], 'hr')?.name).toBe('Goran')
    expect(pickVoice([voice('sr-Cyrl-RS', 'Sophie')], 'hr')).toBeUndefined()
    expect(pickVoice([voice('en-US', 'Samantha'), voice('de-DE', 'Anna')], 'hr')).toBeUndefined()
  })

  it('returns nothing when there are no voices', () => {
    expect(pickVoice([], 'en')).toBeUndefined()
  })
})

describe('Narrator', () => {
  it('is a silent no-op where the Web Speech API does not exist', () => {
    const narrator = new Narrator()
    expect(narrator.supported).toBe(false)
    let started = false
    narrator.speak('Hello', 'en', { onStart: () => (started = true) })
    narrator.pause()
    narrator.resume()
    narrator.cancel()
    expect(started).toBe(false)
  })
})
