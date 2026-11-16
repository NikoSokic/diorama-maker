import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { ApiFailure, createStory, listStories, SAMPLE_GALLERY } from '../api/client'
import type { GalleryItem, Lang } from '../api/types'
import { CanvasErrorBoundary } from '../components/CanvasErrorBoundary'
import { BTN, BTN_GHOST, Layout } from '../components/Layout'
import { StoryCard } from '../components/StoryCard'
import { detectStoryLang } from '../i18n/detect'
import { useI18n, useTitle } from '../i18n/I18n'
import { MAX_STORY_CHARS } from '../i18n/strings'
import { rememberStory } from '../lib/myStories'
import { MOCK_STORIES } from '../mock/stories'

const Player = lazy(() => import('../player/Player'))

/** The hero backdrop: a small looping scene. Skipped when the visitor asks for less motion or has no WebGL. */
function Backdrop() {
  const [show] = useState(() => !window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  const { t, lang } = useI18n()
  const story = MOCK_STORIES.find((s) => s.lang === lang) ?? MOCK_STORIES[0]
  return (
    <div className="absolute inset-0 -z-0" role="img" aria-label={t.home.backdrop}>
      <div className="absolute inset-0 bg-[linear-gradient(#ffe9c2,#fff7e8)]" />
      {show && (
        <CanvasErrorBoundary fallback={null}>
          <Suspense fallback={null}>
            <div className="absolute inset-0 opacity-90">
              <Player key={story.slug} story={story} bare muted quality="low" />
            </div>
          </Suspense>
        </CanvasErrorBoundary>
      )}
      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,247,232,0.88),rgba(255,247,232,0.55)_55%,#fff7e8)]" />
    </div>
  )
}

export function HomePage() {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const draft = (useLocation().state as { draft?: string } | null)?.draft
  useTitle()
  const [text, setText] = useState(draft ?? '')
  const [storyLang, setStoryLang] = useState<Lang | null>(null) // null = follow detection
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recent, setRecent] = useState<GalleryItem[]>([])

  const detected = useMemo(() => detectStoryLang(text), [text])
  const effectiveLang: Lang = storyLang ?? detected ?? lang
  const used = text.length
  const over = used > MAX_STORY_CHARS

  useEffect(() => {
    const controller = new AbortController()
    listStories(3, controller.signal)
      .then((items) => setRecent(items))
      .catch(() => setRecent([]))
    return () => controller.abort()
  }, [])

  const submit = async (event: { preventDefault: () => void }) => {
    event.preventDefault()
    if (busy) return
    if (!text.trim()) return setError(t.home.empty)
    if (over) return setError(t.home.tooLong)
    setBusy(true)
    setError(null)
    try {
      const created = await createStory(text, effectiveLang)
      rememberStory({ slug: created.slug, title: text.trim().slice(0, 48), lang: effectiveLang })
      void navigate(`/s/${created.slug}`)
    } catch (cause) {
      const code = cause instanceof ApiFailure ? cause.code : 'NETWORK'
      setError((t.errors as Record<string, string>)[code] ?? t.errors.INTERNAL)
      setBusy(false)
    }
  }

  const cards = recent.length > 0 ? recent : SAMPLE_GALLERY
  return (
    <Layout overlayHeader>
      <section className="relative isolate overflow-hidden px-4 pb-10 pt-32 sm:px-8 sm:pt-28">
        <Backdrop />
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-4 text-center">
          <h1 className="font-display text-4xl font-bold leading-tight sm:text-6xl">{t.home.title}</h1>
          <p className="max-w-xl text-lg font-semibold sm:text-xl">{t.home.lead}</p>

          <form onSubmit={submit} className="mt-2 flex w-full flex-col gap-3 rounded-[2rem] bg-white/90 p-4 text-left shadow-[0_8px_0_#e6d6b8] ring-2 ring-[#3a2a4d]/10 backdrop-blur sm:p-5">
            <label htmlFor="story" className="font-display text-lg font-semibold">
              {t.home.label}
            </label>
            <textarea
              id="story"
              value={text}
              onChange={(e) => {
                setText(e.target.value)
                setError(null)
              }}
              rows={5}
              placeholder={t.home.placeholder}
              aria-describedby="story-count story-error"
              className="w-full resize-none rounded-2xl border-2 border-[#3a2a4d]/20 bg-[#fffdf8] p-3 text-lg leading-snug outline-none focus:border-[#ff7a59]"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
              <span id="story-count" className={over ? 'text-[#c0392b]' : 'opacity-70'}>
                {t.home.counter(used, MAX_STORY_CHARS)}
              </span>
              <div role="group" aria-label={t.home.storyLang} className="flex items-center gap-1">
                <span className="opacity-70">{t.home.storyLang}:</span>
                {(['hr', 'en'] as const).map((code) => (
                  <button
                    key={code}
                    type="button"
                    aria-pressed={effectiveLang === code}
                    onClick={() => setStoryLang(code)}
                    className={`min-h-9 rounded-full px-3 font-extrabold uppercase ${effectiveLang === code ? 'bg-[#3a2a4d] text-[#fff7e8]' : 'bg-[#3a2a4d]/10'}`}
                  >
                    {code}
                  </button>
                ))}
              </div>
            </div>
            <p id="story-error" role="alert" className="min-h-6 font-bold text-[#c0392b]">
              {error}
            </p>
            <button type="submit" disabled={busy} className={`${BTN} w-full sm:w-auto sm:self-center`}>
              {busy ? t.home.creating : `✨ ${t.home.create}`}
            </button>
            <p className="text-center text-sm font-semibold opacity-70">{t.home.hint}</p>
          </form>

          <div className="mt-2 flex flex-col items-center gap-2">
            <p className="font-bold">{t.home.examples}</p>
            <div className="flex flex-wrap justify-center gap-2">
              {t.examples.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  className={BTN_GHOST}
                  onClick={() => {
                    setText(example.text)
                    setStoryLang(lang)
                    setError(null)
                  }}
                >
                  {example.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-4 py-8 sm:px-8">
        <ol className="grid gap-4 sm:grid-cols-3">
          {t.home.steps.map((step, i) => (
            <li key={step.title} className="rounded-3xl bg-white p-5 shadow-[0_6px_0_#e6d6b8] ring-2 ring-[#3a2a4d]/10">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-[#ffcb52] font-display text-xl font-bold">{i + 1}</span>
              <h2 className="mt-3 font-display text-xl font-semibold">{step.title}</h2>
              <p className="font-semibold opacity-80">{step.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-10 sm:px-8">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl font-semibold">{t.home.recent}</h2>
          <Link to="/gallery" className={BTN_GHOST}>
            {t.home.allStories}
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((item) => (
            <StoryCard key={item.slug} item={item} sample={recent.length === 0} />
          ))}
        </div>
      </section>
    </Layout>
  )
}



