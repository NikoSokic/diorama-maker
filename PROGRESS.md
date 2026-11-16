# Progress

(Full history: `docs/PROGRESS_ARCHIVE.md` - do not read it.)

## Status
| Phase | State |
|---|---|
| 1 Setup & keys | done |
| 2 Backend pipeline | done (103 backend tests, live Gemini + mock Tripo) |
| 3 3D player | done (74 frontend tests, browser-verified) |
| 4 Product UX (pages, progress screen, gallery, i18n, sharing) | done (79 frontend tests, screenshots checked), branch `phase-4-ux` |
| 5 Live run & finish | done in mock mode (103 backend + 79 frontend tests, 5 Playwright smoke tests); **live Tripo run NOT done**: balance 0, see NEEDS_OWNER.md |

PHASE 1 DONE

PHASE 2 DONE

PHASE 3 DONE

## Key facts
- `<Player story uiLang quality shareUrl muted initial bare onStore />` (`frontend/src/player/Player.tsx`, lazy). `bare` = looping hero backdrop.
- `StoryPage` (`/s/:slug`) polls backend, plays when READY. Bundled stories `mock-robot` (HR), `mock-star` (EN) need no backend.
- Backend API contract: `docs/API_NOTES.md` section 4. Design tokens in `src/player/player.css` (cream #fff7e8, plum #3a2a4d, coral #ff7a59, sun #ffcb52, night #1d1533; Fredoka + Nunito).
- Mock mode everywhere (`TRIPO_MODE=mock`); live Tripo only Phase 5.

## Key decisions
- Gemini `gemini-3.5-flash-lite` via Interactions API; 3-layer moderation; offline planner fallback (playable, not public).
- Tripo v3.1 text-to-model, face_limit 10000; biped rig v1.0 with 5 clips; quadrupeds walk only; credit guard degrades clips -> no rig -> placeholder.
- Plain SQL (JdbcClient), embedded Postgres tests, no Docker. Slugs 9 chars.
- Player: environments/props procedural; pure timeline engine; zustand store; 3 quality levels.

## Open risks
- Live Tripo path only tested against a stub: never run against the real API (0 credits).
- Docker setup (compose, Dockerfiles, nginx) never built or run: no Docker on this machine.
- Dev DB has Phase 2 smoke stories; truncate before public demo.
- No-key Docker runs always use the offline planner (simpler stories; the waiting screen says so).

## Next step
All five phases are finished. Left for the owner (NEEDS_OWNER.md): top up Tripo and do the live run, try `docker compose up --build` on a machine with Docker, clean the dev database, merge `phase-5-finish` into main.

## Phase 4 log

- Pages: `/` (hero with looping `bare` player backdrop, textarea + counter, 3 example chips per UI language, story-language auto-detect with HR/EN override, recent cards), `/s/:slug` (ProgressScreen -> Player, friendly failed / not-found / offline pages), `/gallery` (this device's stories, public stories, bundled samples; offline fallback), `/how-it-works`, 404.
- i18n: `src/i18n` (strings HR+EN with type-checked parity, browser detection, `?lang=` override, localStorage); header toggle.
- Decisions: "Your stories" shelf lives in localStorage (no accounts); gallery cards without a thumbnail are painted from environment + palette; backdrop skipped under prefers-reduced-motion; sharing = player's end card + copy link on progress screen.
- Known gaps: player's own button language follows the story language, not the UI toggle; thumbnails need live Tripo renders (Phase 5).

PHASE 4 DONE

## Phase 5 log

- Live run: not done. Tripo balance is 0 credits (checked 2026-11-16, twice) and a top-up is a payment, so the phase was finished in mock mode as the owner instructed. Cost estimate and exact steps are in NEEDS_OWNER.md section 1.
- Performance pass and Playwright smoke test (`npm run smoke`, 5 tests, builds and serves the app itself, backend stubbed).
- `docker compose up --build`: Postgres + backend (Maven build, JRE image, non-root) + nginx frontend that proxies `/api`. Works with no keys (mock Tripo, offline planner, local files). Written without being run.
- README in Croatian: what it is, 3 screenshots (`frontend/scripts/readme-shots.mjs`), mermaid architecture diagram, Docker and dev run, mock/live, checks, API table, known limits.
- Decisions: Docker build skips tests (they need the embedded Postgres; `mvnw verify` stays the gate); Maven cache mount instead of `dependency:go-offline`; compose always uses its own Postgres even when `.env` has Supabase values; screenshots stub the backend by URL path (a `**/api/**` glob also caught Vite's `/src/api/*.ts` modules).
- Self-review, 3 weaknesses fixed: (1) in Docker every visitor shares the bridge address and loses the loopback exemption, so 5 stories/day ran out at once: compose sets 200; (2) player buttons ignored the HR/EN toggle: `StoryPage` now passes `uiLang`; (3) docs were stale: CLAUDE.md commands, open risks and NEEDS_OWNER.md updated.
- Still open: gallery thumbnails are painted, not rendered (needs live models).

PHASE 5 DONE
