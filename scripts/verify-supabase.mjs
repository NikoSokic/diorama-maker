// Verifies Supabase: Storage bucket (exists, public, upload/read/delete round trip) and the Postgres connection.
import { fail, fetchJson, info, loadEnv, ok, requireEnv, run, warn, describeSecret } from './lib/env.mjs'

/** New sb_secret_ keys go in `apikey`; legacy service_role JWTs also need `Authorization`. Try both shapes. */
async function pickAuthHeaders(url, key) {
  const variants = [
    { label: 'apikey + Authorization', headers: { apikey: key, Authorization: `Bearer ${key}` } },
    { label: 'apikey only', headers: { apikey: key } },
  ]
  let last
  for (const v of variants) {
    last = await fetchJson(`${url}/storage/v1/bucket`, { headers: v.headers })
    if (last.ok) return { auth: v, buckets: Array.isArray(last.body) ? last.body : [] }
  }
  if (last.status === 401 || last.status === 403) {
    fail(`Storage rejected SUPABASE_SERVICE_KEY (HTTP ${last.status}). Use the secret key (sb_secret_...), not the publishable one.`)
  }
  fail(`Storage API error HTTP ${last.status}: ${last.text.slice(0, 200)}`)
}

await run('Supabase Storage', async () => {
  loadEnv()
  const [rawUrl, key] = requireEnv('SUPABASE_URL', 'SUPABASE_SERVICE_KEY')
  const url = rawUrl.replace(/\/+$/, '')
  const bucket = process.env.SUPABASE_BUCKET?.trim() || 'models'
  if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/.test(url)) warn('SUPABASE_URL should look like https://<project-ref>.supabase.co')
  if (key.startsWith('sb_publishable_')) fail('SUPABASE_SERVICE_KEY holds a publishable key — the backend needs the secret key (sb_secret_...)')
  info(`url: ${url}, key: ${describeSecret(key)}, bucket: ${bucket}`)

  const { auth, buckets } = await pickAuthHeaders(url, key)
  ok(`service key accepted (headers: ${auth.label})`)

  const names = buckets.map((b) => b.name)
  if (!names.includes(bucket)) {
    const close = names.find((n) => n.trim().toLowerCase() === bucket.toLowerCase())
    if (close !== undefined) fail(`bucket is named "${close}" but must be exactly "${bucket}" (lowercase, no spaces) — delete it and create "${bucket}"`)
    fail(`bucket "${bucket}" not found. Existing buckets: ${names.length ? names.map((n) => `"${n}"`).join(', ') : 'none'} — create "${bucket}" in Storage (public bucket)`)
  }
  const meta = await fetchJson(`${url}/storage/v1/bucket/${bucket}`, { headers: auth.headers })
  if (!meta.ok) fail(`could not read bucket "${bucket}", HTTP ${meta.status}: ${meta.text.slice(0, 200)}`)
  if (meta.body?.public !== true) fail(`bucket "${bucket}" exists but is not public — enable "Public bucket" in its settings`)
  ok(`bucket "${bucket}" exists and is public`)

  const path = `_verify/ping-${Date.now()}.txt`
  const objectUrl = `${url}/storage/v1/object/${bucket}/${path}`
  const upload = await fetchJson(objectUrl, {
    method: 'POST',
    headers: { ...auth.headers, 'Content-Type': 'text/plain', 'x-upsert': 'true' },
    body: 'diorama-maker verify',
  })
  if (!upload.ok) fail(`upload failed, HTTP ${upload.status}: ${upload.text.slice(0, 200)}`)
  ok('upload works')

  try {
    const pub = await fetchJson(`${url}/storage/v1/object/public/${bucket}/${path}`)
    if (!pub.ok || pub.text !== 'diorama-maker verify') fail(`public read failed, HTTP ${pub.status}`)
    ok('public read works without a key (this is how the browser will load GLBs)')
  } finally {
    const del = await fetchJson(objectUrl, { method: 'DELETE', headers: auth.headers })
    if (del.ok) ok('cleanup works (test object deleted)')
    else warn(`could not delete ${path} (HTTP ${del.status}) — remove it by hand`)
  }
})

await run('Supabase Postgres', async () => {
  loadEnv()
  const [jdbcUrl, user, password] = requireEnv('SUPABASE_DB_URL', 'SUPABASE_DB_USER', 'SUPABASE_DB_PASSWORD')
  if (!jdbcUrl.startsWith('jdbc:postgresql://')) fail('SUPABASE_DB_URL must start with jdbc:postgresql://')

  let target
  try {
    target = new URL(jdbcUrl.slice('jdbc:'.length))
  } catch {
    fail('SUPABASE_DB_URL is not a valid URL')
  }
  if (target.username || target.password) {
    fail(
      `SUPABASE_DB_URL contains "user:password@" — remove that part. It must be exactly ` +
        `jdbc:postgresql://${target.hostname}:${target.port || 5432}/postgres?sslmode=require ` +
        `(user and password go in SUPABASE_DB_USER and SUPABASE_DB_PASSWORD)`,
    )
  }
  const port = Number(target.port || 5432)
  const database = target.pathname.replace(/^\//, '') || 'postgres'
  info(`host: ${target.hostname}, port: ${port}, db: ${database}, user: ${user}, password: ${describeSecret(password)}`)

  if (!target.hostname.includes('pooler.supabase.com')) {
    warn('host is not the shared pooler — the direct host (db.<ref>.supabase.co) is IPv6-only on the free plan')
  }
  if (port === 6543) warn('port 6543 is the TRANSACTION pooler — use the session pooler (port 5432)')
  if (target.hostname.includes('pooler.supabase.com') && !/^postgres\.[a-z0-9]+$/.test(user)) {
    warn('pooler username should be postgres.<project-ref>')
  }
  if (target.searchParams.get('sslmode') !== 'require') warn('add ?sslmode=require to SUPABASE_DB_URL')

  let pg
  try {
    pg = (await import('pg')).default
  } catch {
    fail('the "pg" package is missing — run "npm install" in the repo root first')
  }

  const client = new pg.Client({
    host: target.hostname,
    port,
    database,
    user,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 15_000,
  })
  try {
    await client.connect()
  } catch (e) {
    if (/password authentication failed/i.test(e.message)) fail('password authentication failed — check SUPABASE_DB_USER / SUPABASE_DB_PASSWORD')
    if (/Tenant or user not found/i.test(e.message)) fail('pooler does not know this project — check the pooler host (region/index) and the postgres.<project-ref> username')
    if (/ENOTFOUND|EAI_AGAIN/.test(e.message)) fail(`cannot resolve host ${target.hostname}`)
    fail(`connection failed: ${e.message}`)
  }
  try {
    const { rows } = await client.query(
      "select split_part(version(), ' ', 2) as version, current_user as usr, has_schema_privilege(current_user, 'public', 'CREATE') as can_create",
    )
    const { version, usr, can_create: canCreate } = rows[0]
    ok(`connected: PostgreSQL ${version} as ${usr}`)
    if (!canCreate) fail('this user cannot create tables in schema "public" — Flyway migrations would fail')
    ok('user can create tables in schema "public" (Flyway will work)')
  } finally {
    await client.end()
  }
})
