# API notes — Tripo3D v3, Gemini, Supabase

Read from the official docs on **2026-11-15**. Re-check before Phase 5 (live run).
Items marked **[VERIFY]** are not stated in the docs and must be confirmed with a real call.

Sources: <https://developers.tripo3d.ai/en/docs/introduction> (+ sibling pages, index at `/llms.txt`),
<https://developers.tripo3d.ai/en/pricing>, <https://aistudio.google.com/docs/models>,
<https://aistudio.google.com/docs/structured-output>, <https://supabase.com/docs/guides/api/api-keys>,
<https://supabase.com/docs/guides/database/connecting-to-postgres>.

---

## 1. Tripo3D API v3

### 1.1 Basics

| | |
|---|---|
| Base URL (international) | `https://openapi.tripo3d.ai/v3` |
| China | separate site/docs: `developers.tripo3d.com` (not used) |
| Old v2 base | `https://api.tripo3d.ai/v2/openapi/` — do not use; keys are shared between v2 and v3 |
| Auth | `Authorization: Bearer {TRIPO_API_KEY}` |
| Key console | <https://developers.tripo3d.ai/en/keys> — key is shown **once** |
| Success envelope | `{"code": 0, "data": {...}}` |
| Error envelope | `{"code": 2010, "status": "error", "message": "...", "suggestion": "...", "request_id": "req_..."}` |

Everything that generates is **async**: `POST` returns `{"code":0,"data":{"task_id":"<uuid>"}}`, then poll.
v3 has one endpoint per task type; there is no `type` field in request bodies (that was v2).
Model inputs for follow-up tasks are always a single `input` field: a previous `task_id`, a `file_token`, or a public URL.

### 1.2 Text to model — `POST /generation/text-to-model`

Same endpoint for both series; the `model` value picks the series. `model` is **required**.

| `model` | Series | Notes |
|---|---|---|
| `v3.1-20260211` | H3.1 | recommended, best quality |
| `v3.0-20250812` | H3.0 | previous stable |
| `v2.5-20250123` | H2.5 | legacy |
| `P1-20260311` | P1 | low-poly focus, 50–20,000 faces |
| `P2-20260801` | P2 | native quad topology, 48–50,000 tris / 48–25,000 quads |

| Param | Type | Default | Notes |
|---|---|---|---|
| `prompt` | string | **required** | ≤ 1024 chars |
| `model` | string | **required** | see table above |
| `negative_prompt` | string | – | ≤ 255 chars |
| `face_limit` | int | adaptive | H: web/mobile 10,000–50,000; with `smart_low_poly` 500–20,000 (tri). P1: 50–20,000 |
| `texture` | bool | `true` | `false` = bare geometry |
| `pbr` | bool | `true` | forces `texture=true`; adds metallic/roughness/normal maps |
| `texture_quality` | string | `standard` | `fast` \| `standard` \| `detailed` \| `extreme` (8K). `fast` needs `texture_version=v3.5-20260815` else error 1004 |
| `texture_version` | string | from `model` | `v3.5-20260815`, `v3.0-20250812`, `v2.5-20250123` |
| `delight` | bool | `true` | only read by texture v3.5 |
| `geometry_quality` | string | `standard` | `detailed` = Ultra, H ≥ v3.0 only |
| `smart_low_poly` | bool | `false` | H ≥ v3.0. Clean low-poly topology; complex prompts may fail |
| `quad` | bool | `false` | forces **FBX** output — never use (we need GLB) |
| `generate_parts` | bool | `false` | needs `texture=false`, `pbr=false` — not used |
| `auto_size` | bool | `false` | real-world meters; we normalize ourselves |
| `compress` | string | – | `geometry` = meshopt compression (H ≥ v3.0). Needs MeshoptDecoder in the player |
| `export_orientation` | string | `+x` | `+x` \| `-x` \| `-y` \| `+y`. Can be wrong with no error → player must not trust facing |
| `export_uv` | bool | `true` | |
| `model_seed`, `image_seed`, `texture_seed` | int | random | reproducibility |

Result (`GET /tasks/{id}` → `data`): `type: "text_to_model"`, `output.model_url` (GLB), `output.rendered_image_url` (PNG preview — use as gallery thumbnail).

**Planned request for this project** (Phase 2, confirm look in Phase 5):

```json
{
  "prompt": "cute stylized low-poly toy fox, full body, standing neutral pose, arms slightly away from body, single object, no base, no background, soft pastel colors",
  "model": "v3.1-20260211",
  "negative_prompt": "base, pedestal, ground, background, multiple objects, text",
  "face_limit": 10000,
  "texture": true,
  "pbr": false,
  "texture_quality": "standard"
}
```

Why H3.1 and not P1: H3.1 + standard texture is 20 credits and a `face_limit` keeps it light; P1 is listed at 30/40 all-in on its
model page **[VERIFY against the pricing page, which shows one base table for all series]**. `smart_low_poly` (+10) is an option if H3.1 meshes rig badly.

### 1.3 Task query — `GET /tasks/{task_id}`

`data` fields: `task_id`, `type`, `status`, `progress` (0–100), `output` (only on success), `error_code`, `error_message`
(only on failure; task `error_code` is a different number space from the envelope `code`), `credits_consumed`, `created_at`, `completed_at`.

| `status` | Terminal? | Action |
|---|---|---|
| `queued`, `running` | no | keep polling |
| `success` | yes | read `output` |
| `failed`, `cancelled` | yes | credits are returned |
| `banned`, `expired` | yes (legacy) | treat as failed |
| `unknown` / anything else | no | keep polling until our timeout, never assume success |

- Poll every **2 s** (docs: 1–2 s); docs suggest a ~5 min overall cap. Typical generation 10–120 s.
- Batch alternative: `POST /tasks/list`.
- **Output URLs expire after 5 minutes** → download the GLB the moment a task succeeds and re-host it in Supabase Storage.
- Webhooks exist but need a public URL — not used.

### 1.4 Rig check — `POST /animations/rig-check` (free)

Body: `{"input": "<model task_id>"}`. Task type `animate_prerigcheck`.
Output: `riggable` (bool), `rig_type` ∈ `biped | quadruped | hexapod | octopod | avian | serpentine | aquatic`.

### 1.5 Auto rig — `POST /animations/rig` (25 credits)

| Param | Default | Values |
|---|---|---|
| `input` | **required** | model `task_id` / `file_token` / URL (GLB, FBX, OBJ, STL ≤ 150 MB) |
| `model` | `v1.0-20240301` | `v1.0-20240301` (biped only, 90+ presets) · `v2.5-20260210` (non-humanoid creatures) · `v3.0-20260909` (recommended for humanoids) |
| `rig_type` | `biped` | `biped | quadruped | hexapod | octopod | avian | serpentine | aquatic | others` — use the value from rig-check |
| `spec` | `tripo` | biped only: `tripo | mixamo | actorcore | unity | unreal | vrm` |
| `out_format` | `glb` | `glb | fbx` |

Task type `animate_rig`, output `model_url` (rigged GLB). The body field is `model`, not `model_version`.
A biped rigged with `v2.5-20260210` (or without `rig_type`) is rigged as v3.0.

### 1.6 Retarget — `POST /animations/retarget` (10 credits per animation)

| Param | Default | Notes |
|---|---|---|
| `input` | **required** | `task_id` of the **rig** task (or a later task on that rigged model) |
| `animation` | – | one preset id; mutually exclusive with `animations` |
| `animations` | – | array, **max 5** presets per request |
| `out_format` | `glb` | `glb | fbx` |
| `export_with_geometry` | `true` | `false` could give skeleton-only clips **[VERIFY]** |
| `animate_in_place` | `false` | **set `true`** — the player moves characters itself; root motion would double the movement |
| `bake_animation` | – | deprecated, ignored |

Task type `animate_retarget`, output `model_url`.
**[VERIFY in Phase 5]** whether `animations: [...]` returns one GLB containing several clips (expected) and what the clip names are.

#### Preset names (exact)

**Rig `v3.0-20260909`, biped** — 11 presets, no `biped:` prefix:

```
preset:idle  preset:walk  preset:run  preset:jump  preset:dive  preset:climb
preset:slash preset:shoot preset:hurt preset:fall  preset:turn
```

**Rig `v2.5-20260210` / `v3.0-20260909`, non-biped** — one preset each (there is no avian preset):

```
preset:quadruped:walk   preset:hexapod:walk   preset:octopod:walk
preset:serpentine:march preset:aquatic:march
```

**Rig `v1.0-20240301`, biped only** — 90+ presets, `preset:biped:` prefix. The ones that map to our story actions:

| Story action | Preset |
|---|---|
| idle | `preset:biped:idle` (also `wait`, `standing_relax`, `look_around`) |
| walk_to | `preset:biped:walk` (also `swagger`) |
| run_to | `preset:biped:run` (also `flee_01`, `flee_02`) |
| jump | `preset:biped:jump` (also `jump_down`, `flip`) |
| wave | `preset:biped:wave_goodbye_01`, `wave_goodbye_02`, `greet_01`…`greet_04` |
| dance | `preset:biped:dance_01` … `dance_06` |
| celebrate | `preset:biped:victory_celebration`, `cheer`, `clap` |
| emotions | `laugh_01/02`, `cry`, `sob`, `depressed`, `afraid`, `frightened`, `scared_01/02`, `angry_01..03`, `agree`, `bow`, `hug`, `heart_pose` |

Full v1.0 list: `afraid, agree, angry_01, angry_02, angry_03, basketball_shot, bow, box_01, box_02, box_03, cast_a_spell, cheer, chop, clap,
climb, complain_01, complain_02, cross_body_crunch, crossover_dribble, cry, dance_01..dance_06, defeat_02, defeat_03, depressed, dig, dive,
dribble, fall, fire, flee_01, flee_02, flip, fold_arms, football_catch, football_save, football_pass, freaky, frightened, front_kick_01,
front_kick_02, frustrated_01, frustrated_02, golf, greet_01..greet_04, heart_pose, hit_to_body_01, hit_to_body_02, hit_to_head, hit_to_side,
hit_to_stomach, hug, hurt, idle, jump_down, jump, jump_rope_01, jump_rope_02, laugh_01, laugh_02, lift_heavy, look_around, make_a_call_01,
make_a_call_02, pitch_baseball, play_mobile_game, play_video_game, press-up, run_upstairs, run, scared_01, scared_02, scratch, shoot, shovel,
sing_01..sing_04, sit, slash, sob, standing_relax, surf, swagger, swim, turn, victory_celebration, volleyball, wait, walk, warm_up,
wave_goodbye_01, wave_goodbye_02` (each prefixed `preset:biped:`).

#### Rigging plan for this project

| Character kind | Rig | Clips requested (one retarget call) | Rest |
|---|---|---|---|
| biped | `v1.0-20240301`, `rig_type=biped` | `preset:biped:idle`, `walk`, `run`, `jump`, `victory_celebration` (5 = the per-request max) | wave/dance/emotions procedural on top |
| quadruped | `v2.5-20260210`, `rig_type=quadruped` | `preset:quadruped:walk` | idle/run/jump procedural |
| creature / object, or `riggable=false` | none | – | fully procedural |

The v1.0 rig is chosen for bipeds because it is the only one with celebrate/wave/dance-style presets; the v3.0 set has only
idle/walk/run/jump plus combat moves. If v1.0 rigs look poor on toy-proportioned characters in Phase 5, fall back to `v3.0-20260909`
with `preset:idle, preset:walk, preset:run, preset:jump`. Always follow `rig_type` from rig-check, not the LLM's `kind`.

### 1.7 Account — balance and usage

- `GET /account/balance` → `{"code":0,"data":{"balance":10000.00,"frozen":200.00}}` (credits; `frozen` = reserved by running tasks)
- `GET /account/usage` → `data: [{task_id, type, credits_consumed, created_at}]`

Billing model: credits are **frozen at task creation**, deducted on success, **returned on failure/cancel**.
So the spendable amount for the credit guard is `balance` (already net of `frozen`).

### 1.8 Credit costs (API pricing page, 1 credit = $0.01)

| Task | Credits |
|---|---|
| Text to 3D, no texture | 10 |
| Text to 3D, standard texture (`fast` costs the same) | **20** |
| + HD texture (`detailed`) | +10 |
| + Ultra texture 8K (`extreme`) | +20 |
| + HD geometry (`geometry_quality=detailed`) | +20 |
| + Quad mesh | +5 |
| + Smart low-poly | +10 |
| + Generate parts | +20 |
| P1 text to 3D (model page; all-in) | 30 no texture / 40 textured **[VERIFY]** |
| Rig check | **0** |
| Auto rig | **25** |
| Animation retarget | **10 per animation** |
| Format convert basic / advanced | 5 / 10 |
| Retopology v3.0 tri / quad | 35 / 40 |
| Standalone texture fast/standard / HD / 8K | 10 / 20 / 30 |

Per-character estimate with the plan above:

| Character | Calculation | Credits |
|---|---|---|
| static (creature/object, or rigging skipped) | 20 | **20** |
| quadruped | 20 + 25 + 1×10 | **55** |
| biped | 20 + 25 + 5×10 | **95** |
| cached (same prompt hash) | – | **0** |

Worst-case story (3 bipeds) = 285 credits; without rigging = 60. The credit guard (Phase 2) uses these constants and
degrades in this order: fewer clips → no rigging → refuse new stories. Always trust `credits_consumed` from the task over these numbers.

**Free credits:** the API docs do **not** promise a free grant. API credits are a separate wallet from the Studio web app's
monthly free credits. The real balance is whatever `npm run verify:tripo` reports — see PROGRESS.md "Open questions".

### 1.9 Limits and errors

Concurrency (per account, per category; HTTP 429 + code `2000`, `Retry-After` header): 3D generation H = 10, P = 5, animation = 10.
Rate limit per key: HTTP 429 + code `1007`; headers `X-RateLimit-Limit/Remaining/Reset`. Numeric limits are not published.

| Code | HTTP | Meaning | Retry? |
|---|---|---|---|
| 2 / 1002 | 401 | auth missing/invalid | no |
| 1000 / 1001 | 500 | server error | yes, backoff |
| 1003 | 400 | malformed body | no |
| 1004 | 400 | invalid/missing parameter | no |
| 1007 | 429 | rate limit | yes, exponential backoff |
| 2000 | 429 | concurrency limit | yes, after `Retry-After` |
| 2001 | 404 | task not found | no |
| 2002 | 400 | unsupported task type | no |
| 2008 | 400 | **content policy violation** | no → placeholder character |
| 2010 | 403 | **insufficient credits** | no → skip rigging / refuse story |
| 2015 | 400 | model version deprecated | no → update `model` id |
| 2018 | 400 | model too complex (rigging) | no → procedural fallback |
| 4001 | 404 | endpoint not found | no |

Docs' backoff: 1 s, 2 s, 4 s, max 5 retries. A create request may have succeeded even if the response was lost —
don't blindly resubmit (it would double-spend).

---

## 2. Google Gemini API

### 2.1 Model

Text models with a **free tier** (pricing page): `gemini-4-hydrogen`, `gemini-3.8-flash`, `gemini-3.6-flash`,
`gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-2.5-flash-lite` (legacy). `gemini-4-argon` has no free tier.
`gemini-2.5-flash` is deprecated and reroutes on 2026-12-01 — do not use.

**Default: `GEMINI_MODEL=gemini-3.5-flash-lite`.** Measured on 2026-11-15 with the owner's free key:

| Model | Interactions API | Legacy generateContent |
|---|---|---|
| `gemini-3.5-flash-lite` | **1.0 s**, valid JSON | – |
| `gemini-3.8-flash` | no answer within 90 s | 31.7 s, valid JSON |

`gemini-3.8-flash` is too slow on the free tier for a live progress screen. If flash-lite plans turn out too weak in Phase 2,
retry with `gemini-3.6-flash` and measure again.

Free-tier RPM/RPD are **not published in the docs**; they are shown per project at <https://aistudio.google.com/rate-limit>.
On the free tier, prompts and outputs may be used by Google to improve products — fine for children's stories, never send personal data.

### 2.2 Endpoint — Interactions API (current)

```
POST https://generativelanguage.googleapis.com/v1beta/interactions
x-goog-api-key: {GEMINI_API_KEY}
Content-Type: application/json
Api-Revision: 2026-05-20
```

```json
{
  "model": "gemini-3.8-flash",
  "system_instruction": "You turn children's stories into a StoryPlan...",
  "input": "<story text>",
  "store": false,
  "generation_config": { "thinking_level": "low", "max_output_tokens": 4000 },
  "response_format": { "type": "text", "mime_type": "application/json", "schema": { "type": "object", "properties": {}, "required": [] } }
}
```

- `store: false` — interactions are stored server-side by default; we don't need that.
- Gemini 3.6+ and 4 **ignore `temperature`, `top_p`, `top_k`** — don't send them.
- `system_instruction` and `generation_config` are per-request.
- Response (**verified** 2026-11-15, `store: false`): top-level keys `status` (`completed`), `usage`, `created`, `updated`,
  `service_tier`, `steps`, `object`, `model` — **no `id`** when not stored. `steps[]` = `thought` step(s), then `model_output`;
  the answer is the `text` in the `model_output` step's `content[]`. Skip `thought` steps.
- Thinking: `generation_config.thinking_level: "low"` is accepted.
- Always set a client timeout (the Java client: 30 s) and fall back to legacy `generateContent` on timeout.
- The older `POST /v1beta/models/{model}:generateContent` (`generationConfig.responseMimeType` + `responseSchema`) is "legacy but fully supported" — kept as the fallback in the verify script.
- Model metadata / existence check: `GET /v1beta/models/{model}`.

### 2.3 Structured output (JSON Schema)

Supported and **enforced**: `type` (`string, number, integer, boolean, object, array, null`), `properties`, `required`, `enum`,
`items`, `prefixItems`, `minItems` / `maxItems`, `minimum` / `maximum`, `additionalProperties`, `format`, `title`, `description`.
Nullable = `{"type": ["string", "null"]}`.

**Silently stripped (not enforced):** `minLength`, `maxLength`, `minProperties`, `maxProperties`, `uniqueItems`, `contains`.
→ narration ≤ 160 chars, hex colour format, unique character keys, `targetKey` referencing a real character etc. **must be validated and clamped in Java**.
**Schema complexity limit (measured 2026-11-16, `gemini-3.5-flash-lite`, both endpoints).** Gemini compiles the schema into a
grammar. The StoryPlan schema with `minItems`/`maxItems` on its arrays (scenes → actions / props) was rejected:
Interactions `400 invalid_request: "The specified schema produces a constraint that has too many states for serving"`,
legacy `400 INVALID_ARGUMENT` with no detail. Removing only the numeric `minimum`/`maximum` did not help; removing the
**array length limits** did. `PlanSchema` therefore sends structure + enums only (no array limits, no numeric bounds);
counts and ranges are stated in the instruction and enforced by `PlanValidator`. With that schema both endpoints answer
in ~3.5 s with a complete plan.

- The backend falls back to the offline planner when Gemini rejects a request, so this failure is **silent** in the UI:
  look for `plan.source` (`gemini` | `offline`) in `GET /api/stories/{slug}` and for the `GeminiClient` WARN line, which
  now includes Gemini's error message.
- After any change to `PlanSchema.java` run `npm run try:plan` (sends the exact instruction + schema to both endpoints;
  free tier, no Tripo credits). `PlanSchemaTest` keeps the forbidden keywords out.

### 2.4 Safety

Request: `"safety_settings": [{"type": "harassment", "threshold": "block_low_and_above"}]`.
Categories: `harassment`, `hate_speech`, `sexually_explicit`, `dangerous_content`, `jailbreak`.
Thresholds: `off`, `block_only_high`, `block_medium_and_above`, `block_low_and_above`. **Default is `off`** on current models.

A blocked request fails with **HTTP 400** and error `code` ∈ `safety | jailbreak | prohibited_content | blocklist`
(message starts with `Input blocked:`) → map to the friendly "let's try a different story" message.
We set `block_low_and_above` on all categories **and** ask the model for an explicit `safeForKids` + `reason` field in the plan (two layers).

### 2.5 Errors

`400` invalid argument / blocked, `403` key lacks permission, `404` unknown model, `429` quota exhausted (free tier — back off and
retry once, then fail the story with a friendly "busy, try again in a minute"), `500/503` transient → retry with backoff.

## 2b. Gemini speech (narrator voice)

- Endpoint: `POST {GEMINI base}/interactions`, header `x-goog-api-key`, header `Api-Revision: 2026-05-20` (same as the planner).
- Body:
  ```json
  {
    "model": "gemini-3.8-flash-tts", "store": false,
    "input": [{ "type": "user_input", "content": [{ "type": "text", "text": "<scene narration>",
      "annotations": [{ "type": "speech_metadata", "style": "<delivery>" }] }] }],
    "response_format": { "type": "audio" },
    "generation_config": { "speech_config": [{ "voice": "Kore" }] }
  }
  ```
- Style used: `warm, calm storyteller reading a picture book for children aloud in standard Croatian` (HR) / `... in clear English` (EN). The style is followed but not spoken.
- Answer: base64 WAV in `steps[].content[]` where `step.type == "model_output"` and `content.type == "audio"` (field `data`, `mime_type` `audio/wav`). 24 kHz mono 16-bit PCM, about 48 KB per second.
- `response_format.sample_rate` (e.g. 16000) is rejected with HTTP 400 `invalid_request` (checked 2026-11-16), so the default 24 kHz is used.
- Free tier: `gemini-3.8-flash-tts` and `gemini-3.8-flash-lite-tts` are "Free of charge" on the pricing page (checked 2026-11-16). Free-tier RPM/RPD are not published (AI Studio shows them per project). The app caps itself with `GEMINI_TTS_DAILY_LIMIT` (default 150 requests per UTC day) and pauses 30 minutes after an HTTP 429.
- Croatian check (2026-11-16): clips were transcribed back by `gemini-3.5-flash-lite` without the source text. `flash-lite-tts` was heard twice with an ekavian/Serbian "devojčica" for "djevojčica". `flash-tts` with voice Kore was judged native Croatian. Hence the default `gemini-3.8-flash-tts` + `Kore`.

---

## 3. Supabase

### 3.1 Keys

| Key | Prefix | Use |
|---|---|---|
| Secret key | `sb_secret_...` | **backend only** → `SUPABASE_SERVICE_KEY`. Bypasses RLS. Rejected by browsers (401). |
| Publishable key | `sb_publishable_...` | not needed — the browser only loads public GLB URLs |
| Legacy `service_role` / `anon` | `eyJ...` (JWT) | still valid, being deprecated by end of 2026 — prefer the secret key |

Location: Dashboard → **Settings → API Keys**. Send new keys in the `apikey` header; the verify script tries
`apikey` + `Authorization: Bearer` first and then `apikey` only, and prints which one the Storage API accepted — use that in the backend client.

### 3.2 Storage REST (bucket `models`, public)

| Action | Request |
|---|---|
| Bucket info | `GET {SUPABASE_URL}/storage/v1/bucket/models` → `{ "public": true, ... }` |
| Upload | `POST {SUPABASE_URL}/storage/v1/object/models/{path}` — body = bytes, `Content-Type: model/gltf-binary`, `x-upsert: true`, optional `cache-control: 31536000` |
| Public URL | `{SUPABASE_URL}/storage/v1/object/public/models/{path}` — no auth, CORS-enabled |
| Delete | `DELETE {SUPABASE_URL}/storage/v1/object/models/{path}` |

Free plan: 1 GB storage, 50 MB max file size, and projects **pause after ~1 week without activity** (un-pause in the dashboard).
A 10k-face textured GLB is ~1–4 MB, so ≈ 250+ models fit.

Object layout: `models/{promptHash}/base.glb`, `models/{promptHash}/rigged.glb`, `models/{promptHash}/anim.glb`
(one GLB with all retargeted clips), `models/{promptHash}/thumb.png|jpg|webp`. `promptHash` = sha256 of
source (mock/live) + model version + face limit + texture quality + normalized prompt.

### 3.3 Postgres

Use the **shared pooler in session mode** (IPv4, port **5432**). The direct host `db.<ref>.supabase.co` is IPv6-only on the free plan.

```
SUPABASE_DB_URL=jdbc:postgresql://aws-<index>-<region>.pooler.supabase.com:5432/postgres?sslmode=require
SUPABASE_DB_USER=postgres.<project-ref>
SUPABASE_DB_PASSWORD=<database password>
```

- Copy the pooler host from Dashboard → **Connect** → "Session pooler" (it cannot be derived from the region).
- Port 6543 = transaction pooler (no prepared statements; would need `prepareThreshold=0`) — not used.
- Session pooler has a small client limit on the free plan → Hikari `maximum-pool-size: 5`.
- Flyway runs against the `public` schema as the `postgres` role. The tables are only touched by the backend via JDBC,
  so migrations will `ENABLE ROW LEVEL SECURITY` with no policies (blocks the auto-generated REST API for anon keys).

---

## 4. Our backend API (contract for the frontend)

Base: `http://localhost:8080` (Vite proxies `/api`). JSON, UTF-8, `null` fields are omitted. Checked against a running
backend on 2026-11-16 (live Gemini, mock Tripo).

| Method | Path | Answer |
|---|---|---|
| `POST` | `/api/stories` | body `{"text": "...", "lang": "hr" \| "en"}` → **202** `{"slug": "t77rnmvrz", "status": "ANALYZING"}` |
| `GET` | `/api/stories/{slug}` | story view (below), `Cache-Control: no-store` — poll every 2 s until `READY` / `FAILED` |
| `GET` | `/api/stories?limit=12` | gallery items, newest first (`limit` 1–48) |
| `GET` | `/api/health` | `{"status": "ok", "tripoMode": "mock" \| "live", "plannerMode": "mock" \| "live"}` |
| `GET` | `/api/credits` | Tripo balance + costs; loopback callers or `X-Admin-Token` only |
| `GET` | `/api/files/**` | model files in local-storage mode (`model/gltf-binary`, cached 1 h) |

`lang` is optional (falls back to `Accept-Language`, then `hr`). Text is 1–500 characters after trimming.

### 4.1 Errors

Every error is `{"code": "...", "message": "..."}`; `message` is kid-friendly and already in the request language
(`lang` of the story, else `Accept-Language`). Translate by `code` if the UI wants its own wording.

| Code | HTTP | When |
|---|---|---|
| `INVALID_TEXT` | 400 | empty or longer than 500 characters |
| `INVALID_REQUEST` | 400 | unreadable JSON, wrong content type, bad parameter |
| `TOO_LARGE` | 413 | request body over 16 KB |
| `RATE_LIMITED` | 429 | more than `MAX_STORIES_PER_IP_PER_DAY` stories in 24 h (loopback is exempt in development) |
| `CREDITS_EXHAUSTED` | 503 | Tripo balance cannot pay for even one model |
| `BUSY` | 503 | pipeline queue is full |
| `NOT_FOUND` | 404 | unknown slug or path |
| `FORBIDDEN` | 403 | `/api/credits` from outside without the admin token |
| `INTERNAL` | 500 | anything unexpected |

A story that fails **after** it was accepted is reported in the story view instead: `status: "FAILED"`, `errorCode`
(`UNSAFE_CONTENT`, `INTERRUPTED` = backend restarted mid-generation, `INTERNAL`) and `error` (message in the story language).

### 4.2 Story view — `GET /api/stories/{slug}`

```json
{
  "slug": "t77rnmvrz",
  "status": "READY",
  "progress": 100,
  "lang": "en",
  "text": "A brave little penguin wanted to see the desert. ...",
  "title": "Penguin In The Desert",
  "createdAt": "2026-11-16T04:45:35.940958Z",
  "plan": {
    "title": "Penguin In The Desert",
    "language": "en",
    "mood": "adventurous",
    "palette": ["#F4A261", "#E76F51", "#2A9D8F"],
    "source": "gemini",
    "characters": [
      { "key": "penguin", "displayName": "Penguin", "kind": "biped", "relativeSize": 0.8, "tripoPrompt": "cute stylized low-poly toy penguin, ..." }
    ],
    "scenes": [
      {
        "environment": "desert", "timeOfDay": "day", "weather": "clear",
        "narration": "A friendly camel offered to carry her across the golden dunes.",
        "durationSec": 8.0,
        "camera": { "type": "follow", "targetKey": "camel" },
        "actions": [
          { "characterKey": "camel", "type": "enter", "to": { "x": 2.0, "z": 0.0 }, "startAt": 0.0, "duration": 2.0, "emotion": "happy" },
          { "characterKey": "penguin", "type": "walk_to", "to": { "x": -1.5, "z": 0.0 }, "startAt": 2.5, "duration": 4.0, "emotion": "excited" }
        ],
        "props": [ { "type": "cactus", "x": -4.0, "z": 3.0, "scale": 1.2 } ]
      }
    ]
  },
  "characters": [
    {
      "key": "penguin", "displayName": "Penguin", "kind": "biped",
      "status": "READY", "progress": 100,
      "model": {
        "glbUrl": "/api/files/df65.../base.glb",
        "riggedGlbUrl": "/api/files/df65.../rigged.glb",
        "rigged": true, "rigType": "biped",
        "animations": [
          { "name": "walk", "clip": "Walking", "url": "/api/files/df65.../anim.glb" },
          { "name": "idle", "clip": "Idle", "url": "/api/files/df65.../anim.glb" }
        ]
      }
    }
  ]
}
```

- `status`: `ANALYZING` (no `plan` yet, `characters` empty) → `GENERATING_MODELS` (plan present, per-character progress) →
  `READY` | `FAILED`. `progress` (0–100) is one number for the whole story and never goes backwards.
- `characters[]` is in plan order. Character `status`: `PENDING` → `GENERATING` → `RIGGING` → `READY`, or
  **`PLACEHOLDER`** (no `model`; `error` = `NO_CREDITS` | `CONTENT_POLICY` | `TIMEOUT` | `GENERATION_FAILED`): the player must
  draw the procedural blob character, tinted with the palette. A story with placeholders is still `READY`.
- `model.glbUrl` is always the static model. `model.animations[]` is empty for unrigged models → procedural animation.
  All clips of one model live in **one GLB** (`url` is the same for each); `clip` is the name of the clip inside that file,
  `name` is our stable name: `walk`, `idle`, `run`, `jump`, `celebrate` (bipeds) / `walk` only (quadrupeds). When
  `animations` is non-empty, load that GLB instead of `glbUrl`. `thumbnailUrl` is present only for live Tripo models.
- URLs are absolute (Supabase) in live mode and root-relative (`/api/files/...`) in mock mode — use them as they are.
- Plan details the player can rely on (repaired by `PlanValidator`): 1–3 characters, 3–6 scenes, `durationSec` 5–12,
  grid `x`/`z` ∈ [-5, 5], every action ends inside its scene, `characterKey` / `targetKey` always name a real character.
  Optional fields: `camera.targetKey` (absent for some `wide` shots), `action.to` (movement actions always have it),
  `action.targetKey` (`look_at`), `props` (may be empty), `prop.scale`.
- Enums: `mood` cozy | adventurous | funny | mysterious | magical · `kind` biped | quadruped | creature | object ·
  `environment` meadow | forest | beach | sea | castle | village | snowy_mountain | space | underwater | cave | desert | city_park ·
  `timeOfDay` morning | day | sunset | night · `weather` clear | rain | snow | fog | stars | fireflies ·
  `camera.type` wide | closeup | orbit | follow | dolly_in | over_shoulder ·
  `action.type` enter | exit | walk_to | run_to | jump | spin | wave | dance | idle | look_at | grow | shrink | hide | appear | celebrate ·
  `emotion` neutral | happy | sad | scared | surprised | angry | excited | sleepy ·
  `prop.type` tree | pine | bush | rock | flower | mushroom | house | tent | campfire | bench | fence | lantern | ball | balloon |
  gift | cake | treasure_chest | boat | bridge | signpost | star | crystal | snowman | cactus | shell | rocket.
- `plan.source`: `gemini` or `offline` (keyword-based stand-in used when Gemini is unreachable or `GEMINI_MODE=mock`).
  Offline plans are playable by link but never listed in the gallery (they were not moderated by the LLM).
- `narration`: array with one `{"url": string, "durationSec": number}` per scene. Present only when `status` is `READY` and the story has a generated voice; `null` otherwise (then the player uses the browser's `speechSynthesis`). Clips are served like model files (`/api/files/narration/<sha256>.wav` in local storage). All or nothing: either every scene has a clip or the field is `null`.

### 4.3 Gallery item — `GET /api/stories`

```json
[{ "slug": "t77rnmvrz", "title": "Penguin In The Desert", "mood": "adventurous", "palette": ["#F4A261", "#E76F51", "#2A9D8F"],
   "environment": "desert", "characters": ["Penguin", "Camel"], "createdAt": "2026-11-16T04:45:35.940958Z" }]
```

`thumbnailUrl` is added when a character has a live Tripo render; otherwise draw a card from `palette` + `environment`.

### 4.4 Mock mode for frontend work

`TRIPO_MODE=mock` (default) serves four bundled CC0 GLBs by `kind` after a fake delay (~6 s generate, ~3 s per rig step):
`biped.glb` (rigged, clips Walking / Idle / Running / Jump / Dance), `quadruped.glb` (rigged, clip Walk),
`creature.glb` and `object.glb` (static). A full story takes ~25 s, which is what the progress screen should be built against.
`GEMINI_MODE=mock` (or no key) switches the planner to the offline one, so the whole app runs with no network at all.
