# Progress

(Full history: `docs/PROGRESS_ARCHIVE.md` - do not read it.)

## Status
| Phase | State |
|---|---|
| 1 Setup & keys | done |
| 2 Backend pipeline | done (103 backend tests, live Gemini + mock Tripo) |
| 3 3D player | done (74 frontend tests, browser-verified) |
| 4 Product UX (pages, progress screen, gallery, i18n, sharing) | in progress, branch `phase-4-ux` |
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
Phase 4: see log below.

## Phase 4 log
