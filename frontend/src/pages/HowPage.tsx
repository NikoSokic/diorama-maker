import { useState } from 'react'
import { Link } from 'react-router'
import { BTN, Layout } from '../components/Layout'
import { useI18n, useTitle } from '../i18n/I18n'

const ICONS = ['✍️', '🧠', '🧸', '🎭']

export function HowPage() {
  const { t } = useI18n()
  useTitle(t.how.title)
  const [open, setOpen] = useState(0)
  const station = t.how.stations[open]
  return (
    <Layout>
      <div className="mx-auto flex max-w-4xl flex-col gap-10 px-4 pb-12 pt-4 sm:px-8">
        <header>
          <h1 className="font-display text-4xl font-bold">{t.how.title}</h1>
          <p className="mt-1 text-lg font-semibold opacity-80">{t.how.lead}</p>
        </header>

        <section aria-label={t.how.title}>
          <ol className="grid gap-2 sm:grid-cols-4 sm:gap-0">
            {t.how.stations.map((s, i) => (
              <li key={s.name} className="relative flex sm:block">
                <button
                  type="button"
                  aria-pressed={open === i}
                  onClick={() => setOpen(i)}
                  className={`flex w-full items-center gap-3 rounded-3xl p-4 text-left transition-transform sm:mx-1 sm:flex-col sm:text-center ${open === i ? 'bg-[#ffcb52] shadow-[0_5px_0_#d9a62f]' : 'bg-white shadow-[0_5px_0_#e6d6b8] hover:-translate-y-0.5'}`}
                >
                  <span className="text-4xl" aria-hidden="true">{ICONS[i]}</span>
                  <span>
                    <span className="block font-display text-lg font-semibold">{i + 1}. {s.name}</span>
                    <span className="block text-sm font-bold opacity-70">{s.who}</span>
                  </span>
                </button>
                {i < t.how.stations.length - 1 && (
                  <span aria-hidden="true" className="absolute -right-3 top-1/2 z-10 hidden -translate-y-1/2 font-display text-2xl font-bold text-[#ff7a59] sm:block">
                    →
                  </span>
                )}
              </li>
            ))}
          </ol>
          <div className="mt-4 rounded-3xl bg-white p-5 shadow-[0_5px_0_#e6d6b8]" aria-live="polite">
            <p className="text-lg font-bold">{station.text}</p>
            <p className="mt-2 font-semibold opacity-75">{station.detail}</p>
          </div>
        </section>

        <section>
          <h2 className="font-display text-2xl font-semibold">{t.how.planTitle}</h2>
          <p className="mb-3 font-semibold opacity-75">{t.how.planLead}</p>
          <dl className="grid gap-2 rounded-3xl bg-[#3a2a4d] p-4 text-[#fff7e8] sm:grid-cols-2">
            {t.how.planFields.map((f) => (
              <div key={f.key} className="rounded-2xl bg-white/10 p-3">
                <dt className="font-mono text-sm font-bold text-[#ffcb52]">{f.key}</dt>
                <dd className="font-semibold">{f.text}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl font-semibold">{t.how.safetyTitle}</h2>
          <ul className="grid gap-3 sm:grid-cols-2">
            {t.how.safety.map((s) => (
              <li key={s.title} className="rounded-2xl bg-white p-4 shadow-[0_4px_0_#e6d6b8]">
                <p className="font-display text-lg font-semibold">{s.title}</p>
                <p className="font-semibold opacity-80">→ {s.text}</p>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <h2 className="mb-3 font-display text-2xl font-semibold">{t.how.stackTitle}</h2>
          <ul className="flex flex-wrap gap-2">
            {t.how.stack.map((s) => (
              <li key={s.name} className="rounded-full bg-white px-4 py-2 shadow-[0_3px_0_#e6d6b8]">
                <b>{s.name}</b> <span className="opacity-75">{s.text}</span>
              </li>
            ))}
          </ul>
          <ul className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {t.how.numbers.map((n) => (
              <li key={n.text} className="rounded-2xl bg-[#ff7a59] p-3 text-center text-white">
                <span className="block font-display text-3xl font-bold">{n.value}</span>
                <span className="text-sm font-bold">{n.text}</span>
              </li>
            ))}
          </ul>
        </section>

        <div className="text-center">
          <Link to="/" className={BTN}>
            {t.how.cta}
          </Link>
        </div>
      </div>
    </Layout>
  )
}
