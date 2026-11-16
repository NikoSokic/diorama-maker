import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { listStories, SAMPLE_GALLERY } from '../api/client'
import type { GalleryItem } from '../api/types'
import { BTN, BTN_GHOST, Layout } from '../components/Layout'
import { StoryCard } from '../components/StoryCard'
import { useI18n, useTitle } from '../i18n/I18n'
import { forgetStory, readMyStories, type MyStory } from '../lib/myStories'

type State = { kind: 'loading' } | { kind: 'ok'; items: GalleryItem[] } | { kind: 'offline' }

export function GalleryPage() {
  const { t } = useI18n()
  useTitle(t.gallery.title)
  const [state, setState] = useState<State>({ kind: 'loading' })
  const [mine, setMine] = useState<MyStory[]>(() => readMyStories())
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    listStories(48, controller.signal)
      .then((items) => setState({ kind: 'ok', items }))
      .catch(() => !controller.signal.aborted && setState({ kind: 'offline' }))
    return () => controller.abort()
  }, [attempt])

  return (
    <Layout>
      <div className="mx-auto max-w-5xl px-4 pb-10 pt-4 sm:px-8">
        <h1 className="font-display text-4xl font-bold">{t.gallery.title}</h1>
        <p className="mt-1 text-lg font-semibold opacity-80">{t.gallery.lead}</p>

        {mine.length > 0 && (
          <section className="mt-6" aria-labelledby="mine">
            <h2 id="mine" className="font-display text-2xl font-semibold">
              {t.gallery.mine}
            </h2>
            <p className="mb-3 text-sm font-semibold opacity-70">{t.gallery.mineLead}</p>
            <ul className="grid gap-3 sm:grid-cols-2">
              {mine.map((story) => (
                <li key={story.slug} className="flex items-center gap-2 rounded-2xl bg-white p-2 pl-4 shadow-[0_4px_0_#e6d6b8] ring-2 ring-[#3a2a4d]/10">
                  <Link to={`/s/${story.slug}`} className="min-w-0 flex-1 truncate py-2 font-display text-lg font-semibold hover:underline">
                    ▶ {story.title}
                  </Link>
                  <button
                    type="button"
                    className="rounded-full px-3 py-2 text-sm font-bold opacity-70 hover:bg-[#3a2a4d]/10 hover:opacity-100"
                    onClick={() => {
                      forgetStory(story.slug)
                      setMine(readMyStories())
                    }}
                    aria-label={`${t.gallery.forget}: ${story.title}`}
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8" aria-labelledby="all">
          <h2 id="all" className="mb-3 font-display text-2xl font-semibold">
            {t.gallery.everyone}
          </h2>
          {state.kind === 'loading' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-56 animate-pulse rounded-3xl bg-[#3a2a4d]/10" />
              ))}
            </div>
          )}
          {state.kind === 'ok' && state.items.length === 0 && (
            <div className="rounded-3xl bg-white p-6 text-center shadow-[0_5px_0_#e6d6b8]">
              <p className="mb-3 text-lg font-bold">{t.gallery.empty}</p>
              <Link to="/" className={BTN}>
                {t.gallery.write}
              </Link>
            </div>
          )}
          {state.kind === 'ok' && state.items.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {state.items.map((item) => (
                <StoryCard key={item.slug} item={item} />
              ))}
            </div>
          )}
          {state.kind === 'offline' && (
            <div className="mb-4 flex flex-wrap items-center gap-3 rounded-2xl bg-[#ffcb52]/40 p-3 font-bold">
              <span className="flex-1">{t.gallery.offline}</span>
              <button type="button" className={BTN_GHOST} onClick={() => { setState({ kind: 'loading' }); setAttempt((n) => n + 1) }}>
                {t.gallery.retry}
              </button>
            </div>
          )}
        </section>

        <section className="mt-8" aria-labelledby="samples">
          <h2 id="samples" className="mb-3 font-display text-2xl font-semibold">
            {t.gallery.samples}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {SAMPLE_GALLERY.map((item) => (
              <StoryCard key={item.slug} item={item} sample />
            ))}
          </div>
        </section>
      </div>
    </Layout>
  )
}
