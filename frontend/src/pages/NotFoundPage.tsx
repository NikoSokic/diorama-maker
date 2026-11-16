import { Link } from 'react-router'
import { BTN, Layout } from '../components/Layout'
import { useI18n, useTitle } from '../i18n/I18n'

export function NotFoundPage() {
  const { t } = useI18n()
  useTitle(t.notFound.title)
  return (
    <Layout>
      <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
        <p className="dm-bob text-7xl" aria-hidden="true">🧭</p>
        <h1 className="font-display text-3xl font-bold">{t.notFound.title}</h1>
        <p className="text-lg font-semibold opacity-80">{t.notFound.text}</p>
        <Link to="/" className={BTN}>
          {t.notFound.back}
        </Link>
      </div>
    </Layout>
  )
}
