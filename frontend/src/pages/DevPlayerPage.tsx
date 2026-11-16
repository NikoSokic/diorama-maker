import { lazy, Suspense, useMemo } from 'react'
import { useSearchParams } from 'react-router'
import { ENVIRONMENTS, TIMES_OF_DAY, WEATHERS, type EnvironmentId, type TimeOfDay, type Weather } from '../api/types'
import { environmentStory, findMockStory, MOCK_STORIES } from '../mock/stories'
import type { Quality } from '../player/engine/store'

const Player = lazy(() => import('../player/Player'))

const oneOf = <T extends string>(list: readonly T[], value: string | null, fallback: T): T =>
  list.includes(value as T) ? (value as T) : fallback

/**
 * /dev/player — the player on bundled mock data, steered by the query string. Used for development and by
 * the Playwright screenshot script:
 *   ?story=mock-robot            a bundled story (default)
 *   ?env=desert&time=sunset&weather=clear   a small story in one environment
 *   ?scene=2&t=4.5               open paused at that moment (no title card)
 *   ?quality=high|medium|low     pin the render quality
 *   ?bare=1                      no buttons
 */
export function DevPlayerPage() {
  const [params] = useSearchParams()
  const env = params.get('env')
  const storyId = params.get('story')
  const time = params.get('time')
  const weather = params.get('weather')

  const story = useMemo(() => {
    if (env) {
      return environmentStory(
        oneOf<EnvironmentId>(ENVIRONMENTS, env, 'meadow'),
        oneOf<TimeOfDay>(TIMES_OF_DAY, time, 'day'),
        oneOf<Weather>(WEATHERS, weather, 'clear'),
      )
    }
    return findMockStory(storyId ?? '') ?? MOCK_STORIES[0]
  }, [env, storyId, time, weather])

  const scene = params.get('scene')
  const initial = useMemo(
    () => (scene === null ? undefined : { scene: Number(scene) || 0, time: Number(params.get('t')) || 0 }),
    [scene, params],
  )
  const quality = params.get('quality')

  return (
    <Suspense fallback={null}>
      <Player
        key={story.slug + (scene ?? '')}
        story={story}
        initial={initial}
        quality={quality ? oneOf<Quality>(['low', 'medium', 'high'], quality, 'high') : undefined}
        bare={params.get('bare') === '1'}
        muted={params.get('muted') === '1'}
        onStore={(store) => {
          ;(window as unknown as { __player?: unknown }).__player = store
        }}
      />
    </Suspense>
  )
}
