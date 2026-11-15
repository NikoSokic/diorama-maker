// Shared helpers for the verify scripts. Never prints secret values.
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

export const ok = (msg) => console.log(`  OK    ${msg}`)
export const warn = (msg) => console.log(`  WARN  ${msg}`)
export const info = (msg) => console.log(`        ${msg}`)

export class VerifyError extends Error {}

/** Abort the current check with a human-readable reason. */
export function fail(msg) {
  throw new VerifyError(msg)
}

export function loadEnv() {
  const path = resolve(repoRoot, '.env')
  if (!existsSync(path)) {
    fail('.env not found in the repo root. Copy .env.example to .env and fill it in.')
  }
  process.loadEnvFile(path)
}

/** Returns the trimmed value of a required variable, or aborts naming what is missing. */
export function requireEnv(...names) {
  const missing = names.filter((n) => !process.env[n]?.trim())
  if (missing.length) fail(`missing in .env: ${missing.join(', ')}`)
  return names.map((n) => process.env[n].trim())
}

/** Safe description of a secret: length only. */
export const describeSecret = (value) => `set (${value.length} chars)`

/** Removes every known secret from a string before it is printed. */
export function redact(text) {
  let out = String(text)
  for (const name of ['TRIPO_API_KEY', 'GEMINI_API_KEY', 'SUPABASE_SERVICE_KEY', 'SUPABASE_DB_PASSWORD']) {
    const value = process.env[name]?.trim()
    if (value) out = out.split(value).join(`<${name}>`)
  }
  return out
}

export async function fetchJson(url, init = {}, timeoutMs = 20_000) {
  let res
  try {
    res = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) })
  } catch (e) {
    fail(`network error calling ${new URL(url).host}: ${redact(e.cause?.message ?? e.message)}`)
  }
  const text = await res.text()
  let body = null
  try {
    body = text ? JSON.parse(text) : null
  } catch {
    body = null
  }
  return { status: res.status, ok: res.ok, body, text, headers: res.headers }
}

/** Runs one named check; prints the outcome and sets the exit code on failure. */
export async function run(name, check) {
  console.log(`\n${name}`)
  try {
    await check()
    console.log(`  => ${name}: PASS`)
  } catch (e) {
    const msg = e instanceof VerifyError ? e.message : `unexpected error: ${e.message}`
    console.log(`  FAIL  ${redact(msg)}`)
    console.log(`  => ${name}: FAIL`)
    process.exitCode = 1
  }
}
