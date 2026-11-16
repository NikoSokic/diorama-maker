# Needs the owner

Things only Niko can do. Nothing here blocked the work: everything except the live Tripo run was finished in mock mode.

## 1. Tripo credits for Phase 5 (payment decision)

- Balance is **0 credits, 0 frozen** (checked again at the start of Phase 5, 2026-11-16, with `npm run verify:tripo`;
  the key itself works). **The live run was therefore not done**; Phase 5 was finished in mock mode.
- Estimated cost of the planned live story (one rigged biped + one static prop character): **115 credits ≈ $1.15**.
  Cheapest meaningful run (one fully rigged biped): 95 credits. Worst case (3 bipeds): 285 credits.
- When credits exist, the live run is: set `TRIPO_MODE=live` in `.env`, start backend + frontend, then
  `cd frontend; node scripts/story-check.mjs --new "A little robot waves at a star." en` (creates one story and plays
  it in a real browser). Set `TRIPO_MODE=mock` back afterwards.
- Phase 5 ("one real story end-to-end with live Tripo + rigging") cannot run without credits. The smallest top-up is
  **$1 = 100 credits**, which is outside the 0 € budget, so it is your call.
- What credits buy: static model 20, rigged quadruped 55 (rig 25 + 1 clip 10), fully rigged biped 95 (rig 25 + 5 clips).
  A 2-character story with one biped and one static character ≈ 115 credits; 100 credits ≈ one rigged biped, or five
  static models.
- If you do not top up: Phase 5 is finished in mock mode (bundled sample models) and the README says so. The credit
  guard already refuses to spend more than the balance.

## 2. Claude Code sign-in for the overnight runner

`overnight.log` shows on every attempt: *"this sign-in can end at any time from now until 2026-11-19 … Run `claude auth
login` now, or use `claude setup-token` for unattended jobs."* If the sign-in expires, `run_overnight.ps1` will loop
without doing any work. Run one of the two commands before the next unattended night.

(The last attempts in the log, 13–15, only hit the 5-hour usage limit; that resolves by itself.)

## 3. Before a public demo (Phase 5, not urgent)

- Un-pause the Supabase project if it has been idle for a week.
- Decide how the work reaches `main`: `main` is still at the initial commit. `phase-2-backend` (which contains all of
  Phase 1) is pushed but not merged and has no PR; `phase-1-setup` exists only on this machine. Phase 5 is on `phase-5-finish` (pushed, contains phases 1-5). Phase 6 is on `phase-6-polish` (pushed, cut from
  `phase-5-finish`, one commit per milestone, CI green on GitHub). No PR was opened and nothing was merged.
- The dev database still holds the Phase 2 smoke-test stories, and the ones with a Gemini plan can show in the public gallery (not checked). Deleting rows is
  your call (Supabase SQL editor: `truncate` the story tables), so it was left alone.

## 4. Docker was never run (no Docker on this machine)

`docker-compose.yml`, both Dockerfiles and `frontend/nginx.conf` were written and reviewed by reading only. On a machine
with Docker Desktop: `docker compose up --build`, open http://localhost:5173, create one story. If the build fails,
the most likely places are the Maven cache mount in `backend/Dockerfile` (needs BuildKit) and `npm ci` in
`frontend/Dockerfile` (lockfile was generated on Windows).

## 5. Publish the app (accounts: Render and Netlify, both free, no card)

Everything is prepared (`render.yaml`, `netlify.toml`, `docs/DEPLOY.md`), but creating hosting accounts and
deploying is yours. Follow `docs/DEPLOY.md`; in short: Render > New > Blueprint (fill the secrets it asks for, use
Supabase's *session pooler* connection string), then Netlify > Import from Git with `API_ORIGIN` set to the Render
address, then put the Netlify address into `FRONTEND_ORIGIN` on Render. After the first deploy, check that two
devices on different networks get separate daily limits (step 6 of DEPLOY.md: `TRUSTED_PROXY_HOPS`). The Docker build
was never run here (no Docker), so expect a fix or two on the first deploy.

## 6. Gemini free-tier quotas (nothing to pay; worth a look)

Phase 6 uses the free tier for three things: planning (as before), the narrator voice (`gemini-3.8-flash-tts`, one
request per scene, cached) and a yes/no check of gallery pictures. Google does not publish the free-tier limits for
the speech model; your project's limits are at https://aistudio.google.com/rate-limit. The app caps speech at 150
requests a day (`GEMINI_TTS_DAILY_LIMIT`) and pauses it for 30 minutes after a quota answer; stories then use the
browser voice. `GEMINI_TTS=off` turns the generated voice off entirely, `THUMBNAIL_UPLOADS=false` the gallery pictures.

## 7. What this session left in the dev database (nothing was deleted)

- Migrations V3 (narration), V4 (thumbnails, upload tokens) and V5 (story variants) were applied to the Supabase dev
  database. All are additive (new columns and one new table, `narration_clips`).
- Test stories created by the checks, all public in the gallery: `hwvw2zks6`, `n3855v5k8`, `9v7wx9fjw`, `g8mmxh726`,
  `cj27zwfcp`, `5wbkpdk29`, `9mbt5xkm3` ("Playing in the Park" three times), `3wf89t9qc`, plus non-public variants of
  them (tweaks and retries). Remove them with the earlier test stories if you clean up before a demo.
- Generated files (mock models, narration WAVs, thumbnails) are in `backend/data/files` (git-ignored).

## 8. Small things noticed on this machine

- A backend on port 8080 (started 17:11) and a Vite server on port 5173 were already running when this session
  began. They were left alone; this session used ports 8081 and 5174 (`API_PROXY` in `vite.config.ts` and
  `FRONTEND_ORIGIN` make that possible). They run the old code: restart them to see Phase 6.
- The commit message of `50e534d` (milestone 3) starts with an invisible byte-order mark. Harmless; fixing it would
  need a force push, which was not done.