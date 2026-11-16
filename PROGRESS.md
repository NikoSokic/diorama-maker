# Progress

## Status

| Phase | State |
|---|---|
| 1. Setup & verification | **done** (2026-11-16) — all keys verified (`npm run verify` green) |
| 2. Backend pipeline | **done** (2026-11-16) — 103 backend tests green, verified end to end with live Gemini + mock Tripo |
| 3. 3D player | next |
| 4. Product UX | – |
| 5. Live run & finish | – |

PHASE 1 DONE

## Next step

Start Phase 3 in a fresh session (spec §5 "Player"): the React Three Fiber player working against the mock backend.
Read `docs/API_NOTES.md` §4 first — it is the exact JSON the player consumes (story view, model/animation URLs,
placeholder characters, enums). Run the backend with `TRIPO_MODE=mock`; a story takes ~25 s and returns the bundled
GLBs (`biped.glb` has clips Walking / Idle / Running / Jump / Dance, `quadruped.glb` has Walk, the other two are static).
The Supabase database already holds a few ready sample stories from the Phase 2 smoke run (`GET /api/stories`).

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

## Deviations from the spec

- Spec says "use low-poly / face-limit options": `quad` is avoided because it forces FBX output; `smart_low_poly` (+10 credits) kept as an option only.
- Spec's animation list "walk, run, idle, jump/celebrate" exists fully only for bipeds; see decision 7.
- Spec's Gemini "response schema" is now `response_format.schema` on the Interactions API; `maxLength` is not enforced by Gemini, so Java clamps lengths.
- Spec's "JSON schema enforced by Gemini" holds for structure and enums only; array sizes and numeric ranges are enforced in Java (decision 16).
- Spec §4 tables have extra columns: `models.source / thumbnail_url / rig_type / rig_task_id / rigged_glb_url`, `stories.error_code / updated_at`, `story_characters.updated_at`.
- Spec's `@Async` is replaced by explicit executors (decision 23).
- Spec's WebClient is replaced by the JDK `HttpClient` behind one small helper (`http/Http.java`: timeouts, retries with backoff); the WebFlux dependency added in Phase 1 is gone. The pipeline is blocking code on worker threads, so a reactive client added nothing.
- Character status has an extra value `PLACEHOLDER` (spec only describes the behaviour), and the story view carries `plan.source`.

## Open questions / risks

1. **Tripo API credits: balance is 0** (verified 2026-11-15, key works). Phases 2–4 run fully in mock mode, so this blocks nothing yet. Phase 5 needs credits: minimum top-up is $1 = 100 credits (enough for ~5 static or 1 rigged biped), which conflicts with the 0 € budget — owner decides before Phase 5 (also in `NEEDS_OWNER.md`). A fully rigged 3-biped story costs up to 285 credits; unrigged 60. If the balance is small, Phase 5 runs one small live story and rigging is limited by the credit guard.
2. **Gemini free-tier limits** are only visible at aistudio.google.com/rate-limit. One story = one request (two when the plan needs a retry). Measured 2026-11-16: ~3.5 s per plan.
3. **The live Tripo path has only run against a local stub.** Request/response shapes follow API_NOTES; the remaining [VERIFY] items (multi-clip retarget output, `export_with_geometry`, P1 pricing) and `SupabaseModelStorage` uploads are confirmed in the Phase 5 live run. The Gemini bug found in this phase is the reminder that stubs do not prove a live integration.
4. Supabase free projects pause after about a week of inactivity — un-pause before a demo.
5. **Development data in the Supabase database.** The Phase 2 smoke run left five stories (two public Gemini ones, two offline ones, one rejected as unsafe) whose models point to local `/api/files/...` URLs. Useful for Phases 3–4; before the public demo in Phase 5 clear them (`TRUNCATE stories, story_characters, models CASCADE`) so the gallery only shows live models.
6. When Gemini is unavailable the app degrades to offline plans without telling the user; visible only as `plan.source = offline` and a WARN in the log. Consider a small "simple mode" hint in the UI (Phase 4).
7. Deployment is not decided. Behind a proxy set `TRUST_PROXY=true` and `TRUSTED_PROXY_HOPS`; local file storage does not survive redeploys, so a deployed instance needs `STORAGE_MODE=supabase`.

## Additions beyond the spec

- `npm run verify` one-command health check with actionable error messages.
- Tripo `rendered_image_url` will be stored as the gallery thumbnail (free, no extra render).
- `npm run try:plan`: sends the backend's exact Gemini request to both endpoints and prints the resulting plan.
- Offline planner, so the whole app (and all tests) run with no network and no keys.
- Kid-friendly error messages in HR and EN with stable error codes (`docs/API_NOTES.md` §4.1).
- Per-clip credit degradation and in-memory reservations in the credit guard.
- `docs/API_NOTES.md` §4: the backend API contract with a real response example.

PHASE 2 DONE
