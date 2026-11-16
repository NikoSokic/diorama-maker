import { BrowserRouter, Link, Route, Routes } from 'react-router'
import { MOCK_STORIES } from './mock/stories'
import { DevPlayerPage } from './pages/DevPlayerPage'
import { StoryPage } from './pages/StoryPage'

/** Placeholder home: the real pages (hero, gallery, how it works) are built in Phase 4. */
function Home() {
  return (
    <main className="grid min-h-full place-items-center bg-[#fff7e8] p-6 text-[#3a2a4d]">
      <div className="flex max-w-xl flex-col items-center gap-6 text-center">
        <h1 className="font-display text-5xl font-bold">Diorama Maker</h1>
        <p className="text-lg font-semibold">Priče koje ožive u 3D. / Stories that come alive in 3D.</p>
        <ul className="flex flex-col gap-3">
          {MOCK_STORIES.map((story) => (
            <li key={story.slug}>
              <Link
                to={`/s/${story.slug}`}
                className="block rounded-full bg-[#ff7a59] px-7 py-3 text-lg font-bold text-white shadow-[0_5px_0_#d9532f] transition-transform hover:-translate-y-0.5"
              >
                ▶ {story.title}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/s/:slug" element={<StoryPage />} />
        <Route path="/dev/player" element={<DevPlayerPage />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
