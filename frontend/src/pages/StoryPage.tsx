import { lazy, Suspense, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ApiFailure, getStory, SAMPLE_GALLERY } from '../api/client'
import type { StoryView } from '../api/types'
import { BTN, BTN_GHOST } from '../components/Layout'
import { StoryCard } from '../components/StoryCard'
import { useI18n, useTitle } from '../i18n/I18n'
import { rememberStory } from '../lib/myStories'
import { ProgressScreen } from './ProgressScreen'

const Player = lazy(() => import('../player/Player'))

const POLL_MS = 2000

type Loaded = { slug: string; story?: StoryView; error?: ApiFailure | Error }

/** /s/:slug: progress screen while the story is made, the player when it is ready, a friendly page when it failed. */
export function StoryPage() {
  const { slug = '' } = useParams()
  const { t } = useI18n()
  const [loaded, setLoaded] = useState<Loaded>({ slug })

  useEffect(() => {
    const controller = new AbortController()
    const poll: { timer?: ReturnType<typeof setTimeout> } = {}
    const load = async () => {
      try {
        const next = await getStory(slug, controller.signal)
        if (controller.signal.aborted) return
        setLoaded({ slug, story: next })
        if (next.title && next.status !== 'FAILED') rememberStory({ slug, title: next.title, lang: next.lang })
        if (next.status !== 'READY' && next.status !== 'FAILED') poll.timer = setTimeout(() => void load(), POLL_MS)
      } catch (cause) {
        if (controller.signal.aborted) return
        const failure = cause instanceof Error ? cause : new Error('Error')
        // The backend may be unreachable for a moment; keep trying unless the story does not exist.
        if (!(cause instanceof ApiFailure && cause.status === 404)) poll.timer = setTimeout(() => void load(), POLL_MS * 2)
        setLoaded((prev) => ({ slug, story: prev.slug === slug ? prev.story : undefined, error: failure }))
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
  const code = error instanceof ApiFailure ? error.code : error ? 'NETWORK' : undefined

  if (story?.status === 'READY' && story.plan) {
    return (
      <Suspense fallback={<Notice title={t.player.raising} spinner />}>
        <div className="relative h-full">
          <Player story={story} uiLang={undefined} shareUrl={window.location.href} />
          <Link
            to="/"
            className="absolute left-3 top-3 z-30 rounded-full bg-black/35 px-3 py-1.5 text-sm font-bold text-white backdrop-blur hover:bg-black/55"
          >
            ← {t.player.home}
          </Link>
        </div>
      </Suspense>
    )
  }
  if (story?.status === 'FAILED') {
    const unsafe = story.errorCode === 'UNSAFE_CONTENT'
    const text = unsafe ? t.failed.unsafe : story.errorCode === 'INTERRUPTED' ? t.failed.interrupted : t.failed.generic
    return <Notice title={unsafe ? t.failed.unsafeTitle : t.failed.title} text={text} editText={story.text} />
  }
  if (!story && code === 'NOT_FOUND') return <Notice title={t.failed.notFoundTitle} text={t.failed.notFound} samples />
  if (!story && error && code === 'NETWORK') return <Notice title={t.failed.offline} text={t.failed.offlineText} samples />
  return <ProgressScreen story={story} lost={!!error} />
}

function Notice({ title, text, spinner, samples, editText }: { title: string; text?: string; spinner?: boolean; samples?: boolean; editText?: string }) {
  const { t } = useI18n()
  useTitle(title)
  return (
    <main className="min-h-full bg-[#1d1533] p-6 text-[#fff7e8]">
      <div className="mx-auto flex max-w-3xl flex-col items-center gap-4 pt-[12vh] text-center">
        {spinner && <div className="h-12 w-12 animate-spin rounded-full border-4 border-white/25 border-t-[#ffcb52]" />}
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        {text && <p className="max-w-md text-lg font-semibold opacity-90">{text}</p>}
        {!spinner && (
          <div className="flex flex-wrap justify-center gap-3">
            <Link to="/" state={editText ? { draft: editText } : undefined} className={BTN}>
              {editText ? t.failed.edit : t.player.makeYourOwn}
            </Link>
            <Link to="/gallery" className={BTN_GHOST}>
              {t.nav.gallery}
            </Link>
          </div>
        )}
        {samples && (
          <ul className="mt-4 grid w-full gap-4 text-left text-[#3a2a4d] sm:grid-cols-2">
            {SAMPLE_GALLERY.map((item) => (
              <li key={item.slug}>
                <StoryCard item={item} sample />
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  )
}
