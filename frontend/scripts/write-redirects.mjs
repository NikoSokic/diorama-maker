// Netlify build step: writes dist/_redirects so the static site and the API share one origin.
//   API_ORIGIN=https://diorama-api.onrender.com node scripts/write-redirects.mjs
// /api/* is proxied to the backend (no CORS, and /api/files/... model URLs work as they are); every other path
// falls back to index.html so client-side routes such as /s/<slug> load on a refresh or from a shared link.
import { writeFileSync } from 'node:fs'
import path from 'node:path'

const origin = (process.env.API_ORIGIN ?? '').trim().replace(/\/+$/, '')
if (!/^https:\/\/[^\s/]+$/.test(origin)) {
  console.error('API_ORIGIN must be the backend origin, e.g. https://diorama-api.onrender.com (https, no path)')
  process.exit(1)
}
const rules = [`/api/*  ${origin}/api/:splat  200`, '/*  /index.html  200', '']
writeFileSync(path.resolve('dist/_redirects'), rules.join('\n'))
console.log(`dist/_redirects: /api/* -> ${origin}/api/`)
