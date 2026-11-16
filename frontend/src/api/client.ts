// Thin client for our own backend (docs/API_NOTES.md §4).

import { findMockStory, MOCK_STORIES } from '../mock/stories'
import type { ApiError, CreatedStory, EnvironmentId, GalleryItem, Lang, StoryView, TimeOfDay, Weather } from './types'

export class ApiFailure extends Error {
  readonly code: string
  readonly status: number

  constructor(status: number, error: ApiError) {
    super(error.message)
    this.code = error.code
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, { ...init, headers: { Accept: 'application/json', ...init?.headers } })
  } catch {
    throw new ApiFailure(0, { code: 'NETWORK', message: 'The server cannot be reached.' })
  }
  if (!response.ok) {
    let error: ApiError = { code: 'INTERNAL', message: `HTTP ${response.status}` }
    try {
      const body = (await response.json()) as Partial<ApiError>
      if (body.code && body.message) error = { code: body.code, message: body.message }
    } catch {
      // Not our JSON error shape (a proxy error page, for example): keep the generic one.
    }
    throw new ApiFailure(response.status, error)
  }
  return (await response.json()) as T
}

/** Story view by slug. Slugs starting with `mock-` are the bundled sample stories and need no backend. */
export function getStory(slug: string, signal?: AbortSignal): Promise<StoryView> {
  const mock = findMockStory(slug)
  if (mock) return Promise.resolve(mock)
  return request<StoryView>(`/api/stories/${encodeURIComponent(slug)}`, { signal })
}

/** Hands a story to the pipeline; the answer comes at once, the story is then polled by its slug. */
export function createStory(text: string, lang: Lang, signal?: AbortSignal): Promise<CreatedStory> {
  return request<CreatedStory>('/api/stories', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': lang },
    body: JSON.stringify({ text: text.trim(), lang }),
    signal,
  })
}

export interface VariantRequest {
  mode: 'tweak' | 'retry'
  environment?: EnvironmentId
  timeOfDay?: TimeOfDay
  weather?: Weather
}

/** A new story from a finished one: the same plan in another place / time / weather, or the text planned again. */
export function createVariant(slug: string, body: VariantRequest, lang: Lang): Promise<CreatedStory> {
  return request<CreatedStory>(`/api/stories/${encodeURIComponent(slug)}/variants`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Accept-Language': lang },
    body: JSON.stringify(body),
  })
}

/**
 * Sends the story's gallery picture. 'done': stored, or refused for good (already has one, bad image, no such
 * story); 'retry': anything else (network, server, a proxy or CORS refusal), so the token is kept for a later visit.
 */
export async function putThumbnail(slug: string, token: string, jpeg: Blob): Promise<'done' | 'retry'> {
  try {
    const response = await fetch(`/api/stories/${encodeURIComponent(slug)}/thumbnail`, {
      method: 'PUT',
      headers: { 'Content-Type': 'image/jpeg', 'X-Upload-Token': token },
      body: jpeg,
    })
    return response.ok || [400, 404, 409].includes(response.status) ? 'done' : 'retry'
  } catch {
    return 'retry'
  }
}

/** Public stories, newest first (the backend allows 1–48). */
export function listStories(limit = 24, signal?: AbortSignal): Promise<GalleryItem[]> {
  return request<GalleryItem[]>(`/api/stories?limit=${Math.min(48, Math.max(1, Math.round(limit)))}`, { signal })
}

/** A bundled sample story in the shape of a gallery item. */
export function toGalleryItem(story: StoryView): GalleryItem {
  return {
    slug: story.slug,
    title: story.title ?? story.plan?.title ?? story.slug,
    mood: story.plan?.mood ?? 'cozy',
    palette: story.plan?.palette ?? [],
    environment: story.plan?.scenes[0]?.environment ?? 'meadow',
    characters: story.characters.map((c) => c.displayName),
    createdAt: story.createdAt,
  }
}

export const SAMPLE_GALLERY: GalleryItem[] = MOCK_STORIES.map(toGalleryItem)
