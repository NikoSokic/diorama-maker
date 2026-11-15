// Runs every key check and prints a one-line summary per service.
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { repoRoot } from './lib/env.mjs'

const checks = ['verify-tripo.mjs', 'verify-gemini.mjs', 'verify-supabase.mjs']
const failed = []

for (const script of checks) {
  const { status } = spawnSync(process.execPath, [resolve(repoRoot, 'scripts', script)], { stdio: 'inherit' })
  if (status !== 0) failed.push(script)
}

console.log(failed.length ? `\nFAILED: ${failed.join(', ')}` : '\nAll checks passed — ready for Phase 2.')
process.exitCode = failed.length ? 1 : 0
