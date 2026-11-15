# Diorama Maker — working rules

Story (≤500 chars, HR/EN) → Gemini StoryPlan → Tripo3D models → animated Three.js storybook. Free tiers only (0 €).

## Read first, every session
1. `PROGRESS.md` — current phase, decisions, open questions. Start there, not from the code.
2. `docs/DIORAMA_SPEC.md` — full spec (only the section for the current phase).
3. `docs/API_NOTES.md` — exact Tripo v3 / Gemini / Supabase endpoints, params, preset names, credit costs. Never guess an API shape; if the notes are missing something, read the official docs and update the notes.

## Hard rules
- **Mock mode by default.** `TRIPO_MODE=mock` for all development and all tests. Live Tripo calls (real credits) only in Phase 5 or when the owner explicitly asks; check the balance first and stay inside it. Tests must never call a real external API.
- **Never print or commit secrets.** Do not `cat`/read `.env`, do not echo env values, do not log request headers. Scripts report secrets as `set (N chars)` only. `.env` stays git-ignored; only `.env.example` is committed.
- **Free services only.** No paid tiers, no card-required services.
- **No destructive git.** No force push, no history rewrite, no `reset --hard` on shared work.
- **Keys stay on the backend.** Nothing secret in `frontend/` or in any `VITE_*` variable.

## Working style
- Decide technical questions yourself; log each non-obvious choice in `PROGRESS.md` → Decisions. Ask the owner only for accounts, keys, payments.
- Keep `PROGRESS.md` updated as you go (not only at the end): done items, decisions, additions, open questions, next step.
- Commit after each milestone with a clear message; one logical change per commit. Push only when the owner asks.
- End of phase: builds + tests green, self-review (3 biggest weaknesses, fix them), update `PROGRESS.md`, commit, short summary.
- Token economy: short chat output, no code echo. Read line ranges / grep instead of whole files. Never dump build logs, lockfiles or `node_modules`; pipe long output through a tail (`| Select-Object -Last 15`). Targeted edits over rewrites. Subagents only for broad searches.

## Layout
```
backend/    Spring Boot 3.5, Java 21 target, Maven wrapper, Flyway   (package hr.fesb.diorama)
frontend/   Vite + React 19 + TS, R3F/drei/postprocessing, Tailwind 4, motion, react-router, Vitest
scripts/    Node key-verification scripts (no secrets printed)
docs/       DIORAMA_SPEC.md, API_NOTES.md
bruno/      manual Tripo API collection (secret var lives in Bruno, not in git)
```

## Commands (Windows PowerShell; keep output short)
| What | Command |
|---|---|
| Verify keys | `npm run verify` (or `verify:tripo`, `verify:gemini`, `verify:supabase`) from the repo root |
| Backend build + tests | `cd backend; .\mvnw.cmd -q -B verify` |
| Backend run | `cd backend; .\mvnw.cmd spring-boot:run` → http://localhost:8080 (loads `../.env` itself) |
| Frontend dev | `cd frontend; npm run dev` → http://localhost:5173 (proxies `/api` to 8080) |
| Frontend checks | `cd frontend; npm run build; npm run lint; npm test` |

## Environment notes
- JDK on this machine is 25; the build targets Java 21 (`java.version` in `pom.xml`). Maven comes from the wrapper — no global Maven.
- No Docker here. The database is Supabase; backend tests must not need Docker (use web slices / embedded Postgres, not Testcontainers).
- `.env` is parsed by Node **and** by Spring as a properties file: comments on their own line only, no quotes, no backslashes.
- The repo lives in a OneDrive folder: if a build fails with a file-lock error, retry once before investigating.
- Code comments and identifiers in English; user-facing UI text in HR + EN; the final README is in Croatian.
