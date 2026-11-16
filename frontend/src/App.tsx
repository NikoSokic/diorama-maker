import { BrowserRouter, Route, Routes } from 'react-router'
import { I18nProvider } from './i18n/I18n'
import { DevPlayerPage } from './pages/DevPlayerPage'
import { GalleryPage } from './pages/GalleryPage'
import { HomePage } from './pages/HomePage'
import { HowPage } from './pages/HowPage'
import { NotFoundPage } from './pages/NotFoundPage'
import { StoryPage } from './pages/StoryPage'

function App() {
  return (
    <I18nProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/s/:slug" element={<StoryPage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/how-it-works" element={<HowPage />} />
          <Route path="/dev/player" element={<DevPlayerPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </BrowserRouter>
    </I18nProvider>
  )
}

export default App
