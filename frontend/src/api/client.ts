// Thin client for our own backend (docs/API_NOTES.md §4).

import { findMockStory } from '../mock/stories'
import type { ApiError, StoryView } from './types'

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
