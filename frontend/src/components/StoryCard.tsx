import { Link } from 'react-router'
import type { GalleryItem } from '../api/types'
import { useI18n } from '../i18n/I18n'

/** Sky colours per environment: a card without a thumbnail is painted from these plus the story palette. */
const SKY: Record<string, [string, string]> = {
  meadow: ['#bfe6ff', '#9ad37a'],
  forest: ['#cfe8c4', '#4f8a4a'],
  beach: ['#a8def7', '#f3dfa2'],
  sea: ['#9fd3f0', '#3f87c4'],
  castle: ['#d9d2f2', '#9a8fc0'],
  village: ['#ffe2b8', '#c9a26a'],
  snowy_mountain: ['#dfeeff', '#ffffff'],
  space: ['#2b1d55', '#0f0a28'],
  underwater: ['#6cc4d8', '#1e6f93'],
  cave: ['#5a4a6e', '#2a2038'],
  desert: ['#ffd7a0', '#e8b26a'],
  city_park: ['#c7e7ff', '#8fcf8b'],
}

export function timeAgo(iso: string | undefined, t: ReturnType<typeof useI18n>['t']): string {
  if (!iso) return ''
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60000))
  if (Number.isNaN(minutes)) return ''
  if (minutes < 2) return t.time.now
  if (minutes < 60) return t.time.minutes(minutes)
  if (minutes < 1440) return t.time.hours(Math.round(minutes / 60))
  return t.time.days(Math.round(minutes / 1440))
}

export function StoryCard({ item, sample }: { item: GalleryItem; sample?: boolean }) {
  const { t } = useI18n()
  const [top, bottom] = SKY[item.environment] ?? SKY.meadow
  const dots = item.palette.slice(0, 3)
  return (
    <Link
      to={`/s/${item.slug}`}
      className="group flex flex-col overflow-hidden rounded-3xl bg-white shadow-[0_6px_0_#e6d6b8] ring-2 ring-[#3a2a4d]/10 transition-transform hover:-translate-y-1 focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#3a2a4d]"
    >
      <div
        className="relative h-32 overflow-hidden"
        style={item.thumbnailUrl ? undefined : { background: `linear-gradient(${top} 0 58%, ${bottom} 58% 100%)` }}
      >
        {item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />}
        {!item.thumbnailUrl && (
          <div className="absolute inset-x-0 bottom-[34%] flex justify-center gap-2" aria-hidden="true">
            {(dots.length ? dots : ['#ff7a59', '#ffcb52']).map((color, i) => (
              <span
                key={color + i}
                className="block rounded-full shadow-md transition-transform group-hover:-translate-y-2"
                style={{ background: color, width: 34 - i * 6, height: 34 - i * 6, transitionDelay: `${i * 60}ms` }}
              />
            ))}
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white/85 px-3 py-1 text-xs font-extrabold">
          {t.gallery.environments[item.environment]}
        </span>
        {sample && (
          <span className="absolute right-3 top-3 rounded-full bg-[#ffcb52] px-3 py-1 text-xs font-extrabold">{t.home.sample}</span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-4">
        <h3 className="font-display text-xl font-semibold leading-tight">{item.title}</h3>
        <p className="text-sm font-semibold opacity-75">
          {t.gallery.moods[item.mood]}
          {item.createdAt && !sample ? ` · ${timeAgo(item.createdAt, t)}` : ''}
        </p>
        {item.characters.length > 0 && (
          <p className="text-sm opacity-75">
            {t.gallery.with} {item.characters.slice(0, 3).join(', ')}
          </p>
        )}
      </div>
    </Link>
  )
}
