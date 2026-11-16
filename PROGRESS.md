# Progress

## Status

| Phase | State |
|---|---|
| 1. Setup & verification | **done** (2026-11-16) — all keys verified (`npm run verify` green) |
| 2. Backend pipeline | **done** (2026-11-16) — 103 backend tests green, verified end to end with live Gemini + mock Tripo |
| 3. 3D player | **done** (2026-11-16) — 74 frontend tests green, played end to end in a real browser (mock stories and backend stories) |
| 4. Product UX | next |
| 5. Live run & finish | – |

PHASE 1 DONE

## Next step

Start Phase 4 in a fresh session (spec §5 "Pages"): home with the live mini-diorama, the playful progress screen,
gallery, how-it-works, i18n (HR/EN toggle), design polish.

What Phase 4 can build on:
- `<Player story={storyView} />` (`frontend/src/player/Player.tsx`, default export, lazy-load it) is the whole player.
  Props: `uiLang`, `quality`, `shareUrl`, `muted`, `initial`, `bare`, `onStore`. **`bare` = no buttons, muted, loops**
  — made for the hero backdrop on the home page.
- `src/pages/StoryPage.tsx` (`/s/:slug`) already polls the backend and shows the player when the story is `READY`; its
  waiting screen is a plain spinner + percentage and is the thing to replace with the progress screen.
- `src/App.tsx` has a placeholder home that only links to the bundled stories; replace it.
- `src/api/client.ts` (`getStory`, `ApiFailure`) and `src/api/types.ts` are the typed API; add `createStory` / `listStories`.
- Player button texts live in `src/player/ui/strings.ts` (HR + EN); fold them into the app-wide i18n or leave them.
- Design language already in the player (`src/player/player.css`): cream `#fff7e8`, plum ink `#3a2a4d`, coral
  `#ff7a59`, sun `#ffcb52`, night `#1d1533`; Fredoka (display) + Nunito (body); round buttons with a chunky bottom edge.
- Bundled stories `mock-robot` (HR) and `mock-star` (EN) work at `/s/mock-robot` with no backend.
- Visual checks: `npm run dev`, then `npm run shots` (screenshots + contact sheets in `test-results/shots`) and
  `npm run playthrough` (title → end in a real browser). `node scripts/story-check.mjs <slug>` plays backend stories.

## Phase 3 — done

Branch `phase-3-player` (pushed; not merged into `main`).

- **Timeline engine** (`player/engine`): pure functions. `compileStory` turns the plan into per-character tracks
  (enter from the rim, spacing between characters, look_at resolved against real positions, state carried between
  scenes); `samplePose` gives any moment of any scene, so the story can be scrubbed and tested. `store.ts` is the
  playback state (title → playing → ended, play/pause, previous/next/restart/seek, curtain, mute, quality).
- **Environments**: all 12, procedural, one merged mesh each (vertex colours, wind sway in the vertex shader) on a
  floating island with a rocky underside; water slab with moving light flecks and a foam line for beach and sea;
  26 plan props; scenes in the same place share one layout. Sky gradient + sun/moon disc + twinkling stars + clouds.
- **Time of day and weather**: 4 times × 6 weathers change sky, key/fill/rim light, fog, lit windows and lamps;
  rain, snow, mist, fireflies and ambient pollen / dust / bubbles / leaves as GPU particles (one draw call each).
- **Characters**: every GLB normalised (height from `relativeSize`, feet on the ground, facing the audience);
  skeletal clips through `AnimationMixer` with 0.28 s crossfades and walk speed matched to ground speed; procedural
  layer for everything else (hop-walk, squash and stretch, jump arcs, spin, wave, dance, celebrate, seven emotion
  poses, emotion bubbles); stand-in blob for `PLACEHOLDER` characters, while loading and on load errors.
- **Camera**: wide, closeup, orbit, follow, dolly_in, over_shoulder as pure shot functions; damped transitions through
  drei `CameraControls`, hand-held sway, snap on cuts, free orbit while paused, portrait-aware framing.
- **Narration**: large subtitles with word-by-word reveal; Web Speech API voice picked per language (hr-HR, en-US,
  close relatives for Croatian), scenes wait for the narrator (up to 9 s), silent fallback everywhere.
- **Cards and controls**: title card with cast and loading state, "Kraj / The End" card with replay, Web Share, copy
  link and save picture (canvas → PNG); play/pause, previous/next, restart, mute, full screen, scene progress bar,
  keyboard shortcuts (space, arrows, M, R, F); iris wipe between places, fade inside a place.
- **Post-processing and performance**: bloom, ACES, saturation, vignette; soft shadows; DPR clamp; three quality
  levels with automatic step-down (`PerformanceMonitor`); the player is its own lazy chunk (352 kB gzip).
- **Mock data**: two bundled stories (`src/mock/stories.ts`, one with a placeholder character) + a generator for
  "one environment" stories; `/dev/player?...` steers the player by query string (see `DevPlayerPage.tsx`).
- **Tests** (74, Vitest, no browser): timeline, camera shots, store with fake timers, atmosphere for all
  combinations, scenery for all 12 environments and all 26 props, island, voice picking, procedural animation.
- **Verified in a real browser** (Playwright, 2026-11-16): screenshots of all 12 environments, story moments, both
  cards, phone portrait and landscape, three quality levels; both bundled stories play from the title card to the end
  by themselves at 60 fps with no console errors; two Gemini-planned stories from the Phase 2 database, served by the
  backend in mock mode (`/s/t77rnmvrz`, `/s/48jbxdw9x`), load their models through `/api/files` and start playing; the no-WebGL fallback shows the story as text.

### Visual iterations (screenshots → critique → fix)

1. Round 1: paused frames had no camera placement (the rig skipped while "free"); sky was washed out because the
   camera looks below the horizon; fog hid the characters; sunsets were one flat orange; characters kept facing their
   walking direction; subtitles covered the characters. Fixed: snap the camera on every cut, sky gradient painted in
   screen space, lighter fog and mist, softer sunset light, turn to the audience after arriving, subtitles move to the
   bottom edge when the buttons fade and the picture is lifted 6 % (view offset).
2. Round 2: on portrait phones the island was tiny; close-ups were too tight; the moon's halo greyed the night sky;
   water turned grey at sunset. Fixed: portrait frames the play area instead of the whole island, close-up distance,
   smaller night halo, water keeps some colour of its own.
3. Round 3 was a confirmation pass (phones, close-up, night, sea, low quality).

### Self-review — weaknesses found and fixed

1. **No loading feedback.** Play could be pressed before the models had arrived and the story opened with stand-in
   blobs. Fixed: the Play button shows "the cast is arriving… N %" until the GLBs are in (8 s cap).
2. **Blank screen without WebGL.** Fixed: an error boundary around the canvas shows the story as readable text.
3. **Phones.** Chrome on Android ignores `speechSynthesis.pause()`, so the narrator talked over a paused picture, and
   the screen could dim mid-story. Fixed: speech is cancelled when pause did not take; a screen wake lock is held
   while playing.

## Phase 2 — done

Branch `phase-2-backend` (pushed; not merged into `main`).

- **Schema** (Flyway `V2__schema.sql`): `models`, `stories`, `story_characters`, RLS enabled without policies. Applied to
  the Supabase database on 2026-11-16 by the first backend start.
- **StoryPlan**: records + enums, `PlanValidator` (defaults, clamping, reference repair, never throws), `PlanSchema`
  (instruction + JSON schema for Gemini).
- **Planning**: `GeminiClient` (Interactions API → legacy `generateContent`), `GeminiStoryPlanner` (one retry with the
  validation errors fed back), `OfflineStoryPlanner` (keyword-based stand-in), keyword pre-filter + Gemini safety
  settings + `safeForKids`.
- **Models**: `TripoClient` with `LiveTripoClient` (text-to-model, rig-check, rig, retarget, balance, download; retries
  with backoff) and `MockTripoClient` (bundled CC0 GLBs, fake progressive delay, simulated wallet); `ModelService`
  (cache by prompt hash, in-flight dedup, one retry, re-hosting, rig fallback to static); `CreditGuard`.
- **Storage**: `SupabaseModelStorage` and `LocalModelStorage` (served at `/api/files`).
- **API**: `POST /api/stories`, `GET /api/stories/{slug}`, `GET /api/stories?limit=`, `GET /api/health`,
  `GET /api/credits`; one JSON error shape with HR/EN kid-friendly messages; per-IP-hash daily limit; CORS for the
  frontend origin; 16 KB body cap.
- **Pipeline**: async on two thread pools (stories, models), characters in parallel, per-character progress that never
  goes backwards, placeholder characters instead of failed stories, unfinished stories marked failed on restart.
- **Tests** (103, all offline): validator, planners, Gemini and Tripo clients against a local stub server, credit guard,
  rig plan, storage, client IP, request size filter, and two full-application suites on embedded Postgres
  (`StoryApiIntegrationTest`, `PipelineFallbackIntegrationTest`).
- **Verified by running the app** (2026-11-16, `TRIPO_MODE=mock`, real Gemini, real Supabase Postgres): HR and EN
  stories reach `READY` in ~25 s with `plan.source = gemini`, GLB files are served, the gallery lists them, an unsafe
  story fails with `UNSAFE_CONTENT` and stays out of the gallery, validation errors return the documented codes.
- Frontend untouched in this phase; `npm run build` / `lint` / `typecheck` / `test` still pass.

### Self-review — weaknesses found and fixed

1. **Live Gemini never worked.** The StoryPlan schema was rejected with HTTP 400 ("too many states for serving")
   because of its array length limits, and the fallback hid it: every story was planned offline. Only a real run showed
   it (tests use a stub). Fixed: schema reduced to structure + enums, Gemini's error text is now logged,
   `PlanSchemaTest` guards the keywords, `npm run try:plan` sends the real request to both endpoints.
2. **Client IP could be forged behind a proxy.** With `TRUST_PROXY=true` the leftmost `X-Forwarded-For` entry was used,
   which the client controls: sending `127.0.0.1` skipped the rate limit and opened `/api/credits`. Fixed: the entry is
   counted from the right (`TRUSTED_PROXY_HOPS`, default 1).
3. **Same model could be paid for twice.** Between a cache miss and taking the in-flight slot another story could
   finish the same prompt; the second story then generated it again. Fixed: second cache lookup inside the slot.
   Also added: request bodies over 16 KB are refused (413) before they are parsed.

## Phase 1 — done

- Toolchain checked: Node 24, npm 11, Git, JDK 25 (builds with Java 21 target), Maven via wrapper. Nothing required is missing.
- Built on the existing `diorama-maker` skeleton repo (Spring Boot 3.5 + Vite/R3F) instead of starting over.
- Env contract moved to the spec's names (`SUPABASE_*`, `TRIPO_MODE`, …); backend loads the repo-root `.env` by itself.
- Backend: WebFlux (WebClient) added, CORS origin from config, DB-free web-slice test so `mvnw verify` passes before Supabase exists.
- Frontend: Tailwind 4, motion, react-router, postprocessing, Vitest installed; `typecheck` / `test` scripts added.
- `scripts/verify-*.mjs`: Tripo balance, Gemini structured-output ping, Supabase Storage round trip + Postgres connection. Secrets are never printed.
- `docs/API_NOTES.md` written from the official docs; `CLAUDE.md` working rules; Bruno collection fixed (wrong host and model id).
- Verified: `mvnw verify` green, `npm run build` / `lint` / `test` green, verify scripts fail cleanly without `.env`.

## Decisions

| # | Decision | Why |
|---|---|---|
| 1 | Keep the existing repo and its `hr.fesb.diorama` package | Already has remote, wrapper, working skeleton |
| 2 | JDK 25 installed, compile target stays Java 21 | Matches the spec; no need to install another JDK |
| 3 | `.env` loaded by Spring via `spring.config.import` | No shell tricks to start the backend; one file for Node and Java |
| 4 | Verify scripts in Node (built-in `fetch`, `pg` for Postgres) | Zero build step, runs before the backend exists |
| 5 | Tripo text-to-model: `v3.1-20260211`, `face_limit` 10000, standard texture, `pbr=false` | 20 credits, light enough for phones; see API_NOTES §1.2 |
| 6 | Biped rig `v1.0-20240301` with 5 clips (idle, walk, run, jump, victory_celebration) | Only rig version with celebrate/wave/dance presets; 5 = per-request max. Fallback: v3.0 rig |
| 7 | Quadrupeds get only `preset:quadruped:walk`; everything else procedural | That is the only quadruped preset Tripo offers |
| 8 | Retarget with `animate_in_place=true` | The timeline engine moves characters; root motion would double it |
| 9 | Gemini via the Interactions API, model `gemini-3.5-flash-lite`, `store=false`, fallback to `generateContent` | Measured: flash-lite 1 s; `gemini-3.8-flash` >90 s on Interactions and 32 s on generateContent (free tier) |
| 10 | Two-layer moderation: Gemini safety settings + `safeForKids` field in the plan | Default safety threshold is `off` on current models |
| 11 | Backend tests without Docker (web slices now, embedded Postgres in Phase 2) | Docker is not installed and not needed with Supabase |
| 12 | Extra env vars: `SUPABASE_BUCKET`, `FRONTEND_ORIGIN`, `IP_HASH_SALT` | Needed for storage, CORS and IP hashing; all have safe defaults except the salt |
| 13 | Plain SQL through Spring `JdbcClient`, no JPA | Three tables and a jsonb column; explicit SQL is shorter and the rate-limit insert must be one statement |
| 14 | Integration tests on embedded Postgres (zonky), one fresh database per suite | Real Postgres behaviour (jsonb, `ON CONFLICT`) without Docker |
| 15 | Offline planner as the last fallback; its stories are playable by link but not public | "Every story always plays", but the gallery only shows plans the LLM moderated |
| 16 | Gemini schema = structure + enums only; counts and ranges live in the instruction and `PlanValidator` | Array length limits made Gemini reject the schema (API_NOTES §2.3) |
| 17 | Third moderation layer: a small keyword pre-filter before any LLM call | Works when Gemini is down and costs nothing |
| 18 | `STORAGE_MODE=auto`: local files in mock mode, Supabase Storage only when Tripo is live | Mock samples are not worth Supabase quota; frontend work needs no network |
| 19 | Model cache key = source + model version + face limit + texture + normalized prompt | Mock and live models never mix; changing settings regenerates instead of serving stale models |
| 20 | Credit guard reserves credits per story in memory and degrades in steps: fewer clips → no rig → placeholder | Concurrent stories cannot count on the same credits; a story still plays with any balance |
| 21 | Rig type comes from Tripo's rig-check, not from the planner's `kind` | The planner guesses; Tripo sees the mesh |
| 22 | All retargeted clips are kept in one `anim.glb`; clip names are read from the GLB and mapped to `walk/idle/run/jump/celebrate` | One download for the player; Tripo's clip names are not guaranteed |
| 23 | Thread pools started directly (`storyExecutor`, `modelExecutor`) instead of `@Async` | Rejections (queue full) can be answered with a friendly `BUSY` instead of a lost task |
| 24 | Rate limit = one `INSERT … SELECT … WHERE count < max` on the salted IP hash; loopback exempt unless `RATE_LIMIT_LOOPBACK=true` | Atomic under parallel requests; local development is not throttled |
| 25 | Stories still running when the backend stops are marked `FAILED (INTERRUPTED)` at the next start | Pipelines live in memory; clients must not poll forever. Assumes a single backend instance |
| 26 | Behind a proxy the client IP is the `X-Forwarded-For` entry `TRUSTED_PROXY_HOPS` from the right | The left side of that header is client-controlled |
| 27 | Slugs: 9 characters from an alphabet without vowels and look-alikes | Easy to read aloud, never spell a word, ~10^13 combinations |
| 28 | Environments and props are generated in code, not loaded from Kenney / Quaternius packs | One consistent toy style for all 12 places, one draw call per scene, no downloads or licences to track, recolourable by time of day and story palette |
| 29 | Timeline engine is pure (`compileStory` + `samplePose(t)`), React only renders the sampled pose | Seek, restart, scrubbing and unit tests for free; no drift between animation and story clock |
| 30 | Discrete player state in a zustand store, per-frame values in a mutable `clock` read inside `useFrame` | React re-renders only on real state changes, never 60 times a second |
| 31 | All scenes of a story with the same environment share one scenery layout and all their props | A fade inside a place must not reshuffle the trees; coming back shows the same place |
| 32 | Sky gradient is painted in screen space (only leaning on view direction) | The camera always looks down at the island; a physical sky showed only its pale bottom band |
| 33 | Camera shots are pure functions; the rig damps towards them and uses `CameraControls` only for the viewer's orbit while paused | Shots are testable and scrubbable; one camera library for both modes |
| 34 | The picture is lifted 6 % with a view offset | Subtitles and buttons own the bottom of the screen; characters stay clear of them in every shot |
| 35 | Tone mapping and grading in the effect composer on every quality level; renderer tone mapping off | One colour pipeline; "low" just drops bloom, vignette, MSAA and shadows |
| 36 | Scene length = max(planned duration, reading time), and a speaking narrator can extend it by up to 9 s | Nobody loses the end of a sentence; a stuck speech engine cannot freeze the story |
| 37 | `react/immutability` lint rule is off for `src/player/**` | three.js objects are mutated by design (uniforms, cameras, refs in `useFrame`) |

## Deviations from the spec

- Spec says "use low-poly / face-limit options": `quad` is avoided because it forces FBX output; `smart_low_poly` (+10 credits) kept as an option only.
- Spec's animation list "walk, run, idle, jump/celebrate" exists fully only for bipeds; see decision 7.
- Spec's Gemini "response schema" is now `response_format.schema` on the Interactions API; `maxLength` is not enforced by Gemini, so Java clamps lengths.
- Spec's "JSON schema enforced by Gemini" holds for structure and enums only; array sizes and numeric ranges are enforced in Java (decision 16).
- Spec §4 tables have extra columns: `models.source / thumbnail_url / rig_type / rig_task_id / rigged_glb_url`, `stories.error_code / updated_at`, `story_characters.updated_at`.
- Spec's `@Async` is replaced by explicit executors (decision 23).
- Spec's WebClient is replaced by the JDK `HttpClient` behind one small helper (`http/Http.java`: timeouts, retries with backoff); the WebFlux dependency added in Phase 1 is gone. The pipeline is blocking code on worker threads, so a reactive client added nothing.
- Character status has an extra value `PLACEHOLDER` (spec only describes the behaviour), and the story view carries `plan.source`.
- Spec says "build environments from CC0 low-poly packs … in `frontend/public/assets` with a CREDITS.md": they are
  procedural instead (decision 28). The only third-party assets are the four sample GLBs in `frontend/public/mock`
  (with `CREDITS.md`) and the two fonts.
- Spec's "share" on the end card is three buttons (Web Share where the browser has it, copy link, save picture); the
  picture is the 3D canvas only, without the HTML overlay.

## Open questions / risks

1. **Tripo API credits: balance is 0** (verified 2026-11-15, key works). Phases 2–4 run fully in mock mode, so this blocks nothing yet. Phase 5 needs credits: minimum top-up is $1 = 100 credits (enough for ~5 static or 1 rigged biped), which conflicts with the 0 € budget — owner decides before Phase 5 (also in `NEEDS_OWNER.md`). A fully rigged 3-biped story costs up to 285 credits; unrigged 60. If the balance is small, Phase 5 runs one small live story and rigging is limited by the credit guard.
2. **Gemini free-tier limits** are only visible at aistudio.google.com/rate-limit. One story = one request (two when the plan needs a retry). Measured 2026-11-16: ~3.5 s per plan.
3. **The live Tripo path has only run against a local stub.** Request/response shapes follow API_NOTES; the remaining [VERIFY] items (multi-clip retarget output, `export_with_geometry`, P1 pricing) and `SupabaseModelStorage` uploads are confirmed in the Phase 5 live run. The Gemini bug found in this phase is the reminder that stubs do not prove a live integration.
4. Supabase free projects pause after about a week of inactivity — un-pause before a demo.
5. **Development data in the Supabase database.** The Phase 2 smoke run left five stories (two public Gemini ones, two offline ones, one rejected as unsafe) whose models point to local `/api/files/...` URLs. Useful for Phases 3–4; before the public demo in Phase 5 clear them (`TRUNCATE stories, story_characters, models CASCADE`) so the gallery only shows live models.
6. When Gemini is unavailable the app degrades to offline plans without telling the user; visible only as `plan.source = offline` and a WARN in the log. Consider a small "simple mode" hint in the UI (Phase 4).
7. Deployment is not decided. Behind a proxy set `TRUST_PROXY=true` and `TRUSTED_PROXY_HOPS`; local file storage does not survive redeploys, so a deployed instance needs `STORAGE_MODE=supabase`.
8. **The player has only seen the mock models.** Real Tripo output will differ: other proportions, pivots, facing
   direction (the player assumes models face +z), heavier meshes, other clip names and speeds. `normalize()` and the
   clip mapping in `Actor.tsx` are the places to adjust in Phase 5.
9. **Narration was not heard, only exercised.** Headless Chromium has no voices, so voice picking is unit-tested and
   the silent path is browser-tested; listen to a HR and an EN story on a real desktop and a phone (Phase 4/5).
   Windows usually has no Croatian voice installed — then HR stories are subtitles only, by design.
10. **No real phone was used.** Phone layouts were checked as viewports (390×780, 780×390) on a desktop GPU; the
    60 fps figure is from this machine. Adaptive quality exists but is untested on a slow device.
11. The player chunk is 1.27 MB (352 kB gzip): three.js, drei, postprocessing, camera-controls. Loaded lazily; a
    manual chunk split is a Phase 5 performance item if needed.
12. Live-mode model URLs are cross-origin (Supabase Storage). Loading them in the browser relies on the bucket's CORS
    headers; never exercised yet because mock mode serves same-origin /api/files. Confirm in Phase 5.

## Additions beyond the spec

- `npm run verify` one-command health check with actionable error messages.
- Tripo `rendered_image_url` will be stored as the gallery thumbnail (free, no extra render).
- `npm run try:plan`: sends the backend's exact Gemini request to both endpoints and prints the resulting plan.
- Offline planner, so the whole app (and all tests) run with no network and no keys.
- Kid-friendly error messages in HR and EN with stable error codes (`docs/API_NOTES.md` §4.1).
- Per-clip credit degradation and in-memory reservations in the credit guard.
- `docs/API_NOTES.md` §4: the backend API contract with a real response example.
- Player: emotion bubbles above characters, free orbit while paused, keyboard shortcuts, full screen, screen wake
  lock, `bare` mode (looping backdrop), text fallback without WebGL, loading state on the Play button.
- `/dev/player` route and the Playwright tools `npm run shots`, `npm run playthrough`, `scripts/story-check.mjs`.
- Bundled stories that play with no backend (`/s/mock-robot`, `/s/mock-star`).

PHASE 2 DONE
