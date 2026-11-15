// Verifies TRIPO_API_KEY by reading the account balance. Costs 0 credits.
import { fail, fetchJson, info, loadEnv, ok, requireEnv, run, warn, describeSecret } from './lib/env.mjs'

// docs/API_NOTES.md §1.8 — H3.1 text-to-model with standard texture, auto rig, 4 preset clips.
const COST_MODEL = 20
const COST_RIG = 25
const COST_ANIMATION = 10

await run('Tripo3D', async () => {
  loadEnv()
  const [key] = requireEnv('TRIPO_API_KEY')
  const base = (process.env.TRIPO_BASE_URL?.trim() || 'https://openapi.tripo3d.ai/v3').replace(/\/+$/, '')
  info(`key: ${describeSecret(key)}, base: ${base}, mode: ${process.env.TRIPO_MODE?.trim() || 'mock'}`)
  if (!base.endsWith('/v3')) warn('TRIPO_BASE_URL does not end with /v3 — the project targets API v3')

  const res = await fetchJson(`${base}/account/balance`, { headers: { Authorization: `Bearer ${key}` } })
  if (res.status === 401) fail('401 — the API key is invalid or revoked. Create a new one in the Tripo console.')
  if (!res.ok || res.body?.code !== 0) {
    fail(`HTTP ${res.status}, code ${res.body?.code ?? '?'}: ${res.body?.message ?? res.text.slice(0, 200)}`)
  }

  const { balance, frozen } = res.body.data
  ok(`authenticated. balance: ${balance} credits, frozen: ${frozen}`)

  const plain = Math.floor(balance / COST_MODEL)
  const rigged = Math.floor(balance / (COST_MODEL + COST_RIG + 4 * COST_ANIMATION))
  info(`≈ ${plain} static characters, or ≈ ${rigged} fully rigged bipeds (estimate, see docs/API_NOTES.md)`)
  if (balance < COST_MODEL) warn('balance is too low for even one live model — stay in TRIPO_MODE=mock')
})
