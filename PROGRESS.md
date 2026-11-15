# Progress

## Status

| Phase | State |
|---|---|
| 1. Setup & verification | **done** (2026-11-15) — waiting on the owner for accounts + `.env` |
| 2. Backend pipeline | next |
| 3. 3D player | – |
| 4. Product UX | – |
| 5. Live run & finish | – |

## Next step

Owner: finish the Supabase + `.env` checklist, then `npm run verify` must print "All checks passed".
Then start Phase 2 in a fresh session (spec §3–4): Flyway schema, StoryPlan + validation, Gemini client, Tripo client (mock + live), Storage client, async pipeline, credit guard, tests.

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
| 9 | Gemini via the Interactions API, model `gemini-3.8-flash`, `store=false` | Current stable free Flash; `generateContent` is now legacy |
| 10 | Two-layer moderation: Gemini safety settings + `safeForKids` field in the plan | Default safety threshold is `off` on current models |
| 11 | Backend tests without Docker (web slices now, embedded Postgres in Phase 2) | Docker is not installed and not needed with Supabase |
| 12 | Extra env vars: `SUPABASE_BUCKET`, `FRONTEND_ORIGIN`, `IP_HASH_SALT` | Needed for storage, CORS and IP hashing; all have safe defaults except the salt |

## Deviations from the spec

- Spec says "use low-poly / face-limit options": `quad` is avoided because it forces FBX output; `smart_low_poly` (+10 credits) kept as an option only.
- Spec's animation list "walk, run, idle, jump/celebrate" exists fully only for bipeds; see decision 7.
- Spec's Gemini "response schema" is now `response_format.schema` on the Interactions API; `maxLength` is not enforced by Gemini, so Java clamps lengths.

## Open questions / risks

1. **Tripo API credits.** The docs promise no free API grant, and API credits are separate from the Studio web credits. `npm run verify:tripo` shows the real balance. A fully rigged 3-biped story costs up to 285 credits; unrigged 60. If the balance is small, Phase 5 runs one small live story and rigging is limited by the credit guard.
2. **Gemini free-tier limits** are only visible at aistudio.google.com/rate-limit. If `gemini-3.8-flash` is too tight, switch `GEMINI_MODEL` to `gemini-3.5-flash-lite`.
3. **[VERIFY] items in API_NOTES** (Interactions raw response keys, multi-clip retarget output, P1 pricing) — resolved by the verify script output and the Phase 5 live run.
4. Supabase free projects pause after about a week of inactivity — un-pause before a demo.

## Additions beyond the spec

- `npm run verify` one-command health check with actionable error messages.
- Tripo `rendered_image_url` will be stored as the gallery thumbnail (free, no extra render).
