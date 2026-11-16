import { useState } from 'react'
import { useNavigate } from 'react-router'
import { ApiFailure, createVariant, type VariantRequest } from '../api/client'
import { ENVIRONMENTS, TIMES_OF_DAY, WEATHERS, type EnvironmentId, type StoryView, type TimeOfDay, type Weather } from '../api/types'
import { useI18n } from '../i18n/I18n'
import { rememberStory } from '../lib/myStories'

/** Weather that only fits the evening (the planner's own rule; the backend clears it otherwise). */
const EVENING_ONLY: ReadonlySet<Weather> = new Set(['stars', 'fireflies'])

/** Weathers offered for a time of day ('' = keep the story's own). */
export function weathersFor(time: TimeOfDay | ''): Weather[] {
  return WEATHERS.filter((w) => !EVENING_ONLY.has(w) || time === '' || time === 'night' || time === 'sunset')
}

/**
 * On the end card of a finished story: the same story in another place, time or weather (an edited copy of the
 * plan, quick and free), or the text planned again. Either way a new story opens; the original stays as it was.
 */
export function TweakPanel({ story }: { story: StoryView }) {
  const { t, lang } = useI18n()
  const navigate = useNavigate()
  const [environment, setEnvironment] = useState<EnvironmentId | ''>('')
  const [time, setTime] = useState<TimeOfDay | ''>('')
  const [weather, setWeather] = useState<Weather | ''>('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const changed = environment !== '' || time !== '' || weather !== ''

  const go = async (body: VariantRequest) => {
    setBusy(true)
    setError(null)
    try {
      const created = await createVariant(story.slug, body, lang)
      rememberStory({ slug: created.slug, title: story.title ?? story.text.slice(0, 48), lang: story.lang, uploadToken: created.uploadToken })
      void navigate(`/s/${created.slug}`)
    } catch (cause) {
      setError(cause instanceof ApiFailure ? cause.message : t.tweak.working)
      setBusy(false)
    }
  }

  const select = 'min-w-0 rounded-xl bg-white px-2 py-2 font-semibold ring-2 ring-[#3a2a4d]/15 focus:outline-none focus:ring-[#ff7a59]'
  return (
    <section className="w-full max-w-xl rounded-3xl bg-[#fff7e8]/95 p-4 text-left text-[#3a2a4d] shadow-[0_6px_0_rgb(0_0_0/0.15)]" aria-labelledby="tweak-title">
      <h3 id="tweak-title" className="font-display text-xl font-semibold">
        {t.tweak.title}
      </h3>
      <p className="mb-3 text-sm font-semibold opacity-75">{t.tweak.lead}</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide opacity-90">
          {t.tweak.place}
          <select className={select} value={environment} onChange={(e) => setEnvironment(e.target.value as EnvironmentId | '')} disabled={busy}>
            <option value="">{t.tweak.same}</option>
            {ENVIRONMENTS.map((env) => (
              <option key={env} value={env}>
                {t.gallery.environments[env]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide opacity-90">
          {t.tweak.time}
          <select
            className={select}
            value={time}
            onChange={(e) => {
              const next = e.target.value as TimeOfDay | ''
              setTime(next)
              if (weather && !weathersFor(next).includes(weather)) setWeather('')
            }}
            disabled={busy}
          >
            <option value="">{t.tweak.same}</option>
            {TIMES_OF_DAY.map((tod) => (
              <option key={tod} value={tod}>
                {t.tweak.times[tod]}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-xs font-bold uppercase tracking-wide opacity-90">
          {t.tweak.weather}
          <select className={select} value={weather} onChange={(e) => setWeather(e.target.value as Weather | '')} disabled={busy}>
            <option value="">{t.tweak.same}</option>
            {weathersFor(time).map((w) => (
              <option key={w} value={w}>
                {t.tweak.weathers[w]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="rounded-full bg-[#ff7a59] px-5 py-2 font-display text-lg font-semibold text-white shadow-[0_4px_0_#c95a3d] disabled:opacity-50"
          disabled={!changed || busy}
          onClick={() => void go({ mode: 'tweak', ...(environment && { environment }), ...(time && { timeOfDay: time }), ...(weather && { weather }) })}
        >
          {busy ? t.tweak.working : t.tweak.show}
        </button>
        <button
          type="button"
          className="rounded-full px-4 py-2 font-bold ring-2 ring-[#3a2a4d]/20 hover:bg-[#3a2a4d]/10 disabled:opacity-50"
          disabled={busy}
          onClick={() => void go({ mode: 'retry' })}
        >
          ↻ {t.tweak.again}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm font-bold text-[#c0392b]">
          {error}
        </p>
      )}
    </section>
  )
}
