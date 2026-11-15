// Verifies GEMINI_API_KEY + GEMINI_MODEL with one tiny structured-output request (free tier).
import { fail, fetchJson, info, loadEnv, ok, requireEnv, run, warn, describeSecret } from './lib/env.mjs'

const API = 'https://generativelanguage.googleapis.com/v1beta'
const API_REVISION = '2026-05-20'

const schema = {
  type: 'object',
  properties: {
    ok: { type: 'boolean' },
    greeting: { type: 'string', description: 'A three-word greeting in Croatian' },
    mood: { type: 'string', enum: ['cozy', 'adventurous', 'funny', 'mysterious', 'magical'] },
  },
  required: ['ok', 'greeting', 'mood'],
}
const prompt = 'Set ok to true, write a three-word greeting in Croatian, and pick a mood for a bedtime story.'

/** The Interactions API returns model text inside `steps[]` (type "model_output"). */
function extractText(body) {
  if (typeof body?.output_text === 'string') return body.output_text
  const steps = Array.isArray(body?.steps) ? body.steps : Array.isArray(body?.outputs) ? body.outputs : []
  const parts = steps.flatMap((s) => (Array.isArray(s?.content) ? s.content : [s]))
  return parts
    .filter((p) => typeof p?.text === 'string' && p.type !== 'thought')
    .map((p) => p.text)
    .join('')
}

function explain(res) {
  const err = res.body?.error
  const detail = err?.message ?? res.text.slice(0, 200)
  if (res.status === 400 && /API key not valid/i.test(detail)) return 'the API key is not valid'
  if (res.status === 403) return `403 — key lacks access (is the Gemini API enabled for this key?): ${detail}`
  if (res.status === 404) return `404 — model or endpoint not found: ${detail}`
  if (res.status === 429) return `429 — free-tier quota exhausted, try again later: ${detail}`
  return `HTTP ${res.status}: ${detail}`
}

await run('Gemini', async () => {
  loadEnv()
  const [key, model] = requireEnv('GEMINI_API_KEY', 'GEMINI_MODEL')
  const headers = { 'x-goog-api-key': key, 'Content-Type': 'application/json' }
  info(`key: ${describeSecret(key)}, model: ${model}`)

  const meta = await fetchJson(`${API}/models/${encodeURIComponent(model)}`, { headers })
  if (!meta.ok) fail(`GEMINI_MODEL "${model}" check failed — ${explain(meta)}`)
  ok(`model exists: ${meta.body?.displayName ?? model}`)

  let text = ''
  let interaction = null
  const started = Date.now()
  try {
    interaction = await fetchJson(
      `${API}/interactions`,
      {
        method: 'POST',
        headers: { ...headers, 'Api-Revision': API_REVISION },
        body: JSON.stringify({
          model,
          input: prompt,
          store: false,
          generation_config: { thinking_level: 'low' },
          response_format: { type: 'text', mime_type: 'application/json', schema },
        }),
      },
      90_000,
    )
  } catch (e) {
    warn(`Interactions API did not answer within ${Math.round((Date.now() - started) / 1000)} s (${e.message})`)
  }

  if (interaction?.ok) {
    text = extractText(interaction.body)
    ok(`Interactions API responded in ${((Date.now() - started) / 1000).toFixed(1)} s (status: ${interaction.body?.status ?? 'n/a'})`)
    info(`response keys: ${Object.keys(interaction.body ?? {}).join(', ')}`)
    const stepTypes = (interaction.body?.steps ?? []).map((s) => s?.type).join(', ')
    if (stepTypes) info(`step types: ${stepTypes}`)
  } else if (!interaction || interaction.status === 404 || interaction.status === 400) {
    if (interaction) warn(`Interactions API rejected the request (${explain(interaction)})`)
    info('trying legacy generateContent')
    const legacyStarted = Date.now()
    const legacy = await fetchJson(
      `${API}/models/${encodeURIComponent(model)}:generateContent`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: { responseMimeType: 'application/json', responseSchema: schema },
        }),
      },
      60_000,
    )
    if (!legacy.ok) fail(explain(legacy))
    text = (legacy.body?.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('')
    ok(`legacy generateContent responded in ${((Date.now() - legacyStarted) / 1000).toFixed(1)} s`)
  } else {
    fail(explain(interaction))
  }

  let parsed
  try {
    parsed = JSON.parse(text)
  } catch {
    fail(`the model did not return valid JSON (got ${text.length} chars)`)
  }
  if (parsed.ok !== true || typeof parsed.greeting !== 'string' || !schema.properties.mood.enum.includes(parsed.mood)) {
    fail(`structured output did not match the schema: ${JSON.stringify(parsed).slice(0, 200)}`)
  }
  ok(`structured JSON output works: ${JSON.stringify(parsed)}`)
})
