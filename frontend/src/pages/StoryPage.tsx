import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiFailure, getStory } from '../api/client'
import type { StoryView } from '../api/types'

const Player = lazy(() => import('../player/Player'))

const POLL_MS = 2000

type Loaded = { slug: string; story?: StoryView; error?: string }

/**
 * /s/:slug — polls the story until it is ready, then plays it.
 * The waiting screen here is deliberately plain; the playful progress screen is Phase 4.
 */
export function StoryPage() {
  const { slug = '' } = useParams()
  const [loaded, setLoaded] = useState<Loaded>({ slug })

  useEffect(() => {
    const controller = new AbortController()
    const poll: { timer?: ReturnType<typeof setTimeout> } = {}
    const load = async () => {
      try {
        const next = await getStory(slug, controller.signal)
        if (controller.signal.aborted) return
        setLoaded({ slug, story: next })
        if (next.status !== 'READY' && next.status !== 'FAILED') poll.timer = setTimeout(() => void load(), POLL_MS)
      } catch (cause) {
        if (controller.signal.aborted) return
        // The story may simply not be reachable for a moment; keep trying unless it does not exist.
        if (cause instanceof ApiFailure && cause.status !== 404) poll.timer = setTimeout(() => void load(), POLL_MS * 2)
        setLoaded({ slug, error: cause instanceof Error ? cause.message : 'Error' })
      }
    }
    void load()
    return () => {
      controller.abort()
      clearTimeout(poll.timer)
    }
  }, [slug])

  // Answers for a previous slug are ignored until the new story arrives.
  const { story, error } = loaded.slug === slug ? loaded : ({ slug } as Loaded)

  if (story?.status === 'READY' && story.plan) {
    return (
      <Suspense fallback={<Waiting text="…" />}>
        <Player story={story} />
      </Suspense>
    )
  }
  if (story?.status === 'FAILED') return <Waiting text={story.error ?? 'Ova priča nije uspjela. / This story did not work out.'} failed />
  if (error && !story) return <Waiting text={error} failed />
  return <Waiting text={`${story?.progress ?? 0} %`} />
}

function Waiting({ text, failed }: { text: string; failed?: boolean }) {
  return (
    <main className="grid h-full place-items-center bg-[#1d1533] p-6 text-center text-[#fff7e8]">
      <div className="flex flex-col items-center gap-4">
        {!failed && <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/25 border-t-[#ffcb52]" />}
        <p className="font-display text-2xl font-semibold">{text}</p>
        {failed && (
          <Link to="/" className="rounded-full bg-[#ff7a59] px-6 py-3 font-bold text-white">
            ← Diorama Maker
          </Link>
        )}
      </div>
    </main>
  )
}
