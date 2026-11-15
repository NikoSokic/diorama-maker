Diorama Maker — Project Spec

A child (or parent) writes a short story (≤500 chars, Croatian or English). The app turns it into an animated 3D storybook: an LLM breaks the story into characters + scenes, Tripo3D generates a 3D model for each character, and a cinematic Three.js player performs the story with narration and subtitles. Stories are saved and shared via a link (no accounts).

Quality bar: this must feel like a polished product, not a student demo. Warm storybook look, smooth cinematic camera, characters that actually move, zero dead ends (every story always plays, even if a generation fails). Budget: 0 € (free tiers only).

0. Autonomy — you have full approval

The owner (Niko) gives you full approval to work autonomously on this project:

Work independently. Don't stop to ask for confirmation on technical decisions — make the best call, note it in PROGRESS.md under "Decisions", and keep going. Ask the owner only for things only he can do (accounts, API keys, payments).
Add what you think is valuable. This spec is the minimum, not the ceiling. If a feature, library, visual effect, UX detail or architectural change would make the product clearly better, add it — as long as it fits the budget (0 €) and doesn't put the core flow at risk. Log additions in PROGRESS.md.
Fix and improve anything that's weak. If something in this spec is wrong, outdated (e.g. the real API differs from what's written here) or a worse idea than an alternative you know, change it and document why. If code you wrote earlier looks mediocre, refactor it.
Be your own reviewer. After each phase, critically review the result like a demanding senior engineer and product designer, list the 3 biggest weaknesses, and fix them before moving on.
Use your judgment on scope. If you run low on budget/tokens, prioritise: a working end-to-end story > looks great > extra features.
Token economy (important — usage is limited)
At the start of every session, check the available skills (/skills) and use any installed token-saving / concise-output skill for the whole session.
Keep chat output short: no long explanations, no repeating code back, summaries in a few bullets.
Don't re-read files you already have in context; read only the parts you need (line ranges, grep).
Pipe long command output through tail/grep; never dump full build logs, node_modules or lockfiles.
Prefer targeted edits over rewriting whole files.
Use subagents only when they clearly save main-context tokens (e.g. a broad codebase search).
When context gets large mid-phase, update PROGRESS.md first, then suggest /compact to the owner.

Only hard limits: never commit or print secrets, never use paid services, spend real Tripo credits only in Phase 5 (or when a live test is truly needed) and stay within the available balance, and no destructive git operations (force push, rewriting history on main).

1. Stack
Layer	Choice
Repo	Monorepo: /backend, /frontend, /docs
Backend	Spring Boot 3, Java 21, Maven, Flyway, Spring Web + WebClient, Jackson
DB + files	Supabase (Postgres via JDBC, Storage bucket models with public read)
LLM	Google Gemini free tier, structured JSON output (response schema). Model name from env GEMINI_MODEL; check the current free "flash" model in the Gemini docs.
3D generation	Tripo3D API (current version is v3 — read the official docs at developers.tripo3d.ai before writing any client code)
Frontend	Vite + React + TypeScript, React Three Fiber, @react-three/drei, @react-three/postprocessing, Tailwind CSS, Framer Motion, react-router
Tests	JUnit 5 + Mockito (backend), Vitest (frontend), Playwright smoke test (mock mode)
2. Environment variables (.env, never committed; provide .env.example)
TRIPO_API_KEY=
TRIPO_BASE_URL=            # verify in docs (international vs. CN endpoint)
TRIPO_MODE=mock            # mock | live  (mock is the default during development!)
ENABLE_RIGGING=true        # rig + retarget animations for bipeds/quadrupeds
GEMINI_API_KEY=
GEMINI_MODEL=
SUPABASE_URL=
SUPABASE_SERVICE_KEY=      # backend only, never sent to the browser
SUPABASE_DB_URL=           # jdbc:postgresql://...  (use the session pooler URL)
SUPABASE_DB_USER=
SUPABASE_DB_PASSWORD=
MAX_STORIES_PER_IP_PER_DAY=5
3. Generation pipeline (backend)
POST /api/stories {text, lang} → validate (1–500 chars), hash IP, rate-limit, create story (status ANALYZING), return {slug} immediately. Rest runs async (@Async + thread pool).
Moderation + analysis (one Gemini call). Reject content unsafe for kids with a friendly message. Otherwise return a StoryPlan (JSON schema enforced by Gemini, then validated + clamped in Java):
title, language, mood (cozy | adventurous | funny | mysterious | magical), palette (3 hex colors)
characters[1..3]: key, displayName, kind (biped | quadruped | creature | object), relativeSize (0.3–3), tripoPrompt — English, always in this style: "cute stylized low-poly toy {subject}, full body, standing neutral pose, arms slightly away from body, single object, no base, no background, soft pastel colors"
scenes[3..6]: environment (enum, see §5), timeOfDay (morning | day | sunset | night), weather (clear | rain | snow | fog | stars | fireflies), narration (story language, ≤160 chars, kid-friendly), durationSec (5–12), camera (wide | closeup | orbit | follow | dolly_in | over_shoulder, + targetKey), actions[]: {characterKey, type, to:{x,z}, startAt, duration, emotion} where type ∈ enter | exit | walk_to | run_to | jump | spin | wave | dance | idle | look_at | grow | shrink | hide | appear | celebrate, positions on a grid x,z ∈ [-5, 5]; optional props[] from the prop library.
Invalid/missing fields → sensible defaults. Never fail because of a sloppy LLM answer (one automatic retry with the validation errors fed back, then defaults).
Models (status GENERATING_MODELS, per-character progress %):
Cache by normalized prompt hash in models table → reuse, costs 0 credits.
Otherwise Tripo text-to-model (use low-poly / face-limit / texture options if the API offers them). Poll with backoff. Download the GLB immediately (Tripo output URLs expire after a few minutes) and upload it to Supabase Storage.
If ENABLE_RIGGING and kind is biped/quadruped: rig-check → rig → retarget the preset animations the player needs (walk, run, idle, jump/celebrate — use the exact preset names from the docs). Store each animated GLB. If rigging is not possible → fall back to procedural animation (§5).
Credit guard: check account balance first, estimate the cost of the plan, skip rigging if credits are short, refuse new stories with a friendly message if credits are exhausted.
Characters generate in parallel. One retry per failure, then a procedural placeholder character (cute rounded blob with eyes, tinted with the palette) so the story always plays.
Status READY (or FAILED with a human-readable reason). GET /api/stories/{slug} returns plan, model URLs, animation URLs, per-character progress. Frontend polls every 2 s (SSE optional).
GET /api/stories?limit=12 → recent public stories for the gallery. GET /api/health, GET /api/credits (admin/dev only).

Mock mode (TRIPO_MODE=mock): returns bundled CC0 sample GLBs (rigged + unrigged) after a fake progressive delay, so the whole app can be built and tested without spending credits. Also a Gemini fixture for unit tests.

4. Data model (Flyway migrations)
stories(id uuid pk, slug unique, text, lang, plan jsonb, status, error, ip_hash, is_public bool, created_at)
story_characters(id, story_id fk, char_key, model_id fk null, status, progress, error)
models(id, prompt_hash unique, prompt, tripo_task_id, glb_url, rigged bool, animations jsonb, created_at)
5. Frontend

Design direction: storybook / toy-diorama. Warm pastel palette, rounded shapes, soft shadows, playful display font (self-hosted, e.g. Fredoka or Baloo 2) + readable body font, big touch-friendly buttons, delightful micro-animations. Fully responsive (phone first). UI in HR + EN (toggle, auto-detect).

Pages

/ — hero with a live mini-diorama in the background, story textarea with char counter, example story chips (3 HR, 3 EN), "Create my story" button.
/s/:slug while generating — playful progress screen: pipeline steps (reading story → characters → building 3D models → setting the stage), a card per character with its name and live %, rotating fun facts.
/s/:slug when ready — the Player.
/gallery — grid of recent stories with thumbnails.
/how-it-works — explains the pipeline with a diagram (useful for presenting the project).

Player (React Three Fiber)

Environments (enum): meadow, forest, beach, sea, castle, village, snowy_mountain, space, underwater, cave, desert, city_park. Build them from CC0 low-poly packs (Kenney, Quaternius) stored in frontend/public/assets with a CREDITS.md; if a pack can't be downloaded, build that environment procedurally. Each preset defines ground, prop layout, sky gradient, fog, lighting rig.
Time of day changes sky + light color + shadows; weather = particle systems (rain, snow, fog, stars, fireflies).
Timeline engine: plays scenes in order, schedules actions, smooth easing. Skeletal clips via AnimationMixer with crossfades when rigged animations exist; otherwise procedural animation: hop-walk with bobbing, squash & stretch, turn toward movement direction, idle breathing, jump arcs, emotion poses (happy bounce, sad droop, scared shake).
Auto-normalize every model: compute bounding box, scale by relativeSize, put feet on the ground, face camera.
Cinematic camera: shot presets with damped transitions (drei CameraControls), subtle handheld sway, free orbit when paused.
Narration: large subtitles + Web Speech API TTS (pick hr-HR / en-US voice, fallback to subtitles only), controls: play/pause, previous/next scene, restart, scene progress bar, mute.
Scene transitions (fade / iris wipe), title card at start, "The End" card with replay + share.
Post-processing: ACES tone mapping, soft shadows, subtle bloom, vignette. Performance: clamp DPR, adaptive quality on phones, lazy-load GLBs, 60 fps target on a mid-range laptop.
Share: copy link, Web Share API, "save screenshot" (canvas to PNG).
6. Security & robustness
API keys only on the backend. .env in .gitignore. Never print secrets in logs or chat.
CORS restricted to the frontend origin. Rate limit per IP hash. Input length limits.
All external calls have timeouts, retries with backoff, and clear error states in the UI.
7. Phases (one Claude Code session each; /clear between phases)
Setup & verification — check toolchain, scaffold monorepo, CLAUDE.md, PROGRESS.md, .env.example, .gitignore. Read Tripo + Gemini docs and write exact endpoints, params, preset animation names and credit costs to docs/API_NOTES.md. Small scripts that verify each key (Tripo balance, Gemini ping, Supabase connection). Tell the user exactly what to set up in Supabase.
Backend pipeline — everything in §3–4, mock mode, tests.
3D player — everything under "Player" in §5, working against mock data.
Product UX — pages, generation screen, gallery, i18n, design polish, share.
Live run & finish — one real story end-to-end with live Tripo + rigging, fix issues, performance pass, Playwright smoke test, README in Croatian (architecture mermaid diagram, screenshots, how to run), docker-compose.yml for local run.

Definition of done for every phase: builds pass (mvn verify, npm run build, typecheck, lint), tests pass, visual check via Playwright screenshots for UI phases, PROGRESS.md updated, git commit with a clear message, short summary to the user of what works and what's next.