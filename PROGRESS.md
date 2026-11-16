# Progress

(Full history: `docs/PROGRESS_ARCHIVE.md` - do not read it.)

## Status
| Phase | State |
|---|---|
| 1 Setup & keys | done |
| 2 Backend pipeline | done (103 backend tests, live Gemini + mock Tripo) |
| 3 3D player | done (74 frontend tests, browser-verified) |
| 4 Product UX (pages, progress screen, gallery, i18n, sharing) | done (79 frontend tests, screenshots checked), branch `phase-4-ux` |
| 5 Live run & finish | - (Tripo balance 0: see NEEDS_OWNER.md) |

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
- Live Tripo path only tested against a stub; verify in Phase 5.
- Dev DB has Phase 2 smoke stories; truncate before public demo.
- Offline-plan fallback is silent to the user (hint planned in Phase 4).

## Next step
Phase 5: live run (needs Tripo credits, see NEEDS_OWNER.md), performance pass, Croatian README, docker-compose. Optional: merge phase-4-ux into main.

## Phase 4 log

- Pages: `/` (hero with looping `bare` player backdrop, textarea + counter, 3 example chips per UI language, story-language auto-detect with HR/EN override, recent cards), `/s/:slug` (ProgressScreen -> Player, friendly failed / not-found / offline pages), `/gallery` (this device's stories, public stories, bundled samples; offline fallback), `/how-it-works`, 404.
- i18n: `src/i18n` (strings HR+EN with type-checked parity, browser detection, `?lang=` override, localStorage); header toggle.
- Decisions: "Your stories" shelf lives in localStorage (no accounts); gallery cards without a thumbnail are painted from environment + palette; backdrop skipped under prefers-reduced-motion; sharing = player's end card + copy link on progress screen.
- Known gaps: player's own button language follows the story language, not the UI toggle; thumbnails need live Tripo renders (Phase 5).

PHASE 4 DONE
