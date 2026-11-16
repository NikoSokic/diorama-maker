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
| 6 Polish (branch `phase-6-polish`) | all 7 milestones done: character library, sound, Gemini narrator voice, real thumbnails, retry/tweak, video export, CI + deploy prep (backend verify green, 104 frontend tests, 5 smoke tests, CI green on GitHub); deploy itself is the owner's step |

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
- Docker setup (compose, Dockerfiles, nginx) and the Render/Netlify deploy never built or run: no Docker here, no accounts.
- Dev DB has Phase 2 smoke stories and Phase 6 check stories (listed in NEEDS_OWNER.md §7); clean before a public demo.
- No-key Docker runs always use the offline planner (simpler stories; the waiting screen says so).
- Sound and voice were verified through player state and a Gemini transcription, never listened to. Video export checked in Chromium only (not Safari/iOS).
- Gemini free-tier limits for speech are unpublished; heavy use falls back to the browser voice.
- `TRUSTED_PROXY_HOPS=2` for Netlify -> Render is reasoned, not measured; check after the first deploy.

## Next step
All six phases are finished. Left for the owner (NEEDS_OWNER.md): deploy (docs/DEPLOY.md), top up Tripo for a live run if wanted, clean the dev database, decide how `phase-6-polish` reaches main.

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

## Phase 6 log

- 6.1 Character library: 55 CC0 Quaternius models (14.9 MB, `backend/src/main/resources/mock-models/library`, built by `frontend/scripts/build-mock-library.mjs`: mapped clips renamed to idle/walk/run/jump/celebrate, resample + quantize). `MockLibrary` matches EN words on the Tripo prompt subject, then EN words + HR stems on the display name; object vs living ranks first; old 4 samples are the fallback. Pre-animated models skip rigging (`TripoClient.preAnimated`, mock only). Mock cache key includes the manifest hash and the match.
- 6.2 Sound: synthesised Web Audio (no files): bed per environment, rain/wind/thunder, critters, mood chord, footsteps and action cues; unlock on Play, mute/pause silence, duck 0.3 under the narrator, crossfade between scenes. `window.__dioramaAudio` + `scripts/audio-check.mjs`.
- 6.3 Narrator voice: Gemini `gemini-3.8-flash-tts` (free tier, voice Kore, style annotation naming the language; flash-lite-tts drifted to Serbian pronunciation in tests). Clips cached in `narration_clips`, one per scene in `stories.narration`, all or nothing; the player plays them through the sound engine with a watchdog and falls back to speechSynthesis.
- 6.4 Thumbnails: creator's player captures one settled frame; `PUT /api/stories/{slug}/thumbnail` with a single-use upload token (not IP), 200 KB, sniffed + size-checked before decoding, redrawn as 480x270 JPEG, Gemini vision check (fail closed). CORS gained PUT and a comma-separated `FRONTEND_ORIGIN`.
- 6.5 Retry/tweak: `POST /api/stories/{slug}/variants`; tweak edits the plan (no LLM, cached models and voice, own limit 20/day), retry re-plans (counts as a story); variants never public. Player shortcuts no longer fire in form fields.
- 6.6 Video: end card records a replay (2D compositor copies each frame + subtitle + curtain fade, engine audio stream), MP4/WebM, cancel on hidden tab, clear unsupported message.
- 6.7 CI (`.github/workflows/ci.yml`, green) and deploy prep: `render.yaml`, `netlify.toml` + `write-redirects.mjs` (Netlify proxies /api: one origin), `server.port` from `PORT`, `docs/DEPLOY.md`.
- Decisions: the library lives in the backend (the browser gets models via /api/files, so a frontend copy would only bloat the build); advisor reviews changed four designs (HR stems only on display names, upload token instead of IP hash, Gemini vision gate, recorder ordering and mute handling).
- Process: an advisor model reviewed plans for milestones 1, 3, 4 and 6; cheaper models did searches and docs.

PHASE 6 DONE