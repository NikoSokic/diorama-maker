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

**Default: `GEMINI_MODEL=gemini-3.8-flash`** (current stable Flash). Fallback if its free quota is too small: `gemini-3.5-flash-lite`.

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
- Response: `id`, `status`, and a `steps[]` array; the answer is the text content of the final `model_output` step
  (SDK shortcut: `output_text`). **[VERIFY]** exact raw JSON keys and usage fields — `npm run verify:gemini` prints the response keys and step types.
- The older `POST /v1beta/models/{model}:generateContent` (`generationConfig.responseMimeType` + `responseSchema`) is "legacy but fully supported" — kept as the fallback in the verify script.
- Model metadata / existence check: `GET /v1beta/models/{model}`.

### 2.3 Structured output (JSON Schema)

Supported and **enforced**: `type` (`string, number, integer, boolean, object, array, null`), `properties`, `required`, `enum`,
`items`, `prefixItems`, `minItems` / `maxItems`, `minimum` / `maximum`, `additionalProperties`, `format`, `title`, `description`.
Nullable = `{"type": ["string", "null"]}`.

**Silently stripped (not enforced):** `minLength`, `maxLength`, `minProperties`, `maxProperties`, `uniqueItems`, `contains`.
→ narration ≤ 160 chars, hex colour format, unique character keys, `targetKey` referencing a real character etc. **must be validated and clamped in Java**.
Very large / deeply nested schemas can be rejected with `400 INVALID_ARGUMENT` — keep the StoryPlan schema flat.

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

Object layout: `models/{promptHash}/base.glb`, `models/{promptHash}/rigged.glb`, `models/{promptHash}/anim-{name}.glb`, `models/{promptHash}/thumb.png`.

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
