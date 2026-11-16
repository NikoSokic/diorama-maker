// Stories created on this device, remembered in localStorage for the "Your stories" shelf.

import type { Lang } from '../api/types'

export interface MyStory {
  slug: string
  title: string
  lang: Lang
  createdAt: number
  /** Single-use permission to send this story's gallery picture (only on the device that made it). */
  uploadToken?: string
}

const KEY = 'dm.myStories'
const MAX = 24

export function readMyStories(): MyStory[] {
  try {
    const raw = JSON.parse(window.localStorage.getItem(KEY) ?? '[]') as unknown
    if (!Array.isArray(raw)) return []
    return raw.filter(
      (s): s is MyStory => !!s && typeof s.slug === 'string' && typeof s.title === 'string' && typeof s.createdAt === 'number',
    )
  } catch {
    return []
  }
}

function write(list: MyStory[]) {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch {
    // Storage blocked: the shelf just stays empty.
  }
}

/** Adds or refreshes a story (newest first). */
export function rememberStory(story: Omit<MyStory, 'createdAt'> & { createdAt?: number }) {
  const rest = readMyStories().filter((s) => s.slug !== story.slug)
  const prev = readMyStories().find((s) => s.slug === story.slug)
  write([{ ...prev, ...story, createdAt: story.createdAt ?? prev?.createdAt ?? Date.now() }, ...rest])
}

export function uploadTokenFor(slug: string): string | undefined {
  return readMyStories().find((s) => s.slug === slug)?.uploadToken
}

/** The token is single-use: once the picture was sent (or refused for good) it is dropped. */
export function spendUploadToken(slug: string) {
  write(readMyStories().map((s) => (s.slug === slug ? { ...s, uploadToken: undefined } : s)))
}

export function forgetStory(slug: string) {
  write(readMyStories().filter((s) => s.slug !== slug))
}
