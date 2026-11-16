import { beforeEach, describe, expect, it, vi } from 'vitest'
import { detectStoryLang, pickUiLang } from './detect'
import { STRINGS } from './strings'
import { forgetStory, readMyStories, rememberStory } from '../lib/myStories'
import { currentStep } from '../pages/ProgressScreen'
import { MOCK_STORIES } from '../mock/stories'

function shape(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(shape)
  if (typeof value === 'function') return 'fn'
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]))
  return typeof value
}

describe('i18n', () => {
  it('Croatian and English have the same shape', () => {
    expect(shape(STRINGS.en)).toEqual(shape(STRINGS.hr))
  })
  it('picks the UI language', () => {
    expect(pickUiLang('en', ['hr'])).toBe('en')
    expect(pickUiLang(null, ['de', 'hr-HR'])).toBe('hr')
    expect(pickUiLang(null, ['fr'])).toBe('en')
  })
  it('detects the story language', () => {
    expect(detectStoryLang('Mali zmaj se bojao mraka i šuma je bila tamna.')).toBe('hr')
    expect(detectStoryLang('Once upon a time a little fox wanted to touch the moon.')).toBe('en')
    expect(detectStoryLang('hi')).toBeNull()
  })
})

describe('my stories', () => {
  beforeEach(() => {
    const data = new Map<string, string>()
    const storage = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    vi.stubGlobal('window', { localStorage: storage })
  })
  it('remembers newest first and forgets', () => {
    rememberStory({ slug: 'a', title: 'A', lang: 'hr' })
    rememberStory({ slug: 'b', title: 'B', lang: 'en' })
    rememberStory({ slug: 'a', title: 'A2', lang: 'hr' })
    expect(readMyStories().map((s) => s.slug)).toEqual(['a', 'b'])
    expect(readMyStories()[0].title).toBe('A2')
    forgetStory('a')
    expect(readMyStories().map((s) => s.slug)).toEqual(['b'])
  })
})

describe('progress steps', () => {
  const base = MOCK_STORIES[0]
  it('follows the pipeline', () => {
    expect(currentStep(undefined)).toBe(0)
    expect(currentStep({ ...base, status: 'ANALYZING', plan: undefined, characters: [] })).toBe(0)
    expect(currentStep({ ...base, status: 'ANALYZING' })).toBe(1)
    expect(currentStep({ ...base, status: 'GENERATING_MODELS', characters: base.characters.map((c) => ({ ...c, status: 'GENERATING' as const })) })).toBe(2)
    expect(currentStep({ ...base, status: 'GENERATING_MODELS', characters: base.characters.map((c) => ({ ...c, status: 'READY' as const })) })).toBe(3)
  })
})

