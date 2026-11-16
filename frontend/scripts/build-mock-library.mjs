// Builds the mock-mode character library (backend/src/main/resources/mock-models/library) from scripts/mock-library.sources.json.
//
//   node scripts/build-mock-library.mjs [cacheDir]
//
// For every source model: download the original GLB from poly.pizza (cached in cacheDir, default the OS temp
// folder), keep only the clips named in "clips" and rename them to our names (idle, walk, run, jump, celebrate),
// then prune, dedupe, resample and quantize so the file stays small. Writes <id>.glb and manifest.json; the backend
// (MockLibrary) is the only reader: mock models reach the browser through /api/files like real Tripo output.
// Every source was listed as CC0 1.0 on poly.pizza when it was chosen (2026-11-16); check that again before adding one.
import { Logger, NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { dedup, prune, quantize, resample } from '@gltf-transform/functions'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const sources = JSON.parse(readFileSync(join(here, 'mock-library.sources.json'), 'utf8')).models
const outDir = join(here, '..', '..', 'backend', 'src', 'main', 'resources', 'mock-models', 'library')
const cacheDir = process.argv[2] ?? join(tmpdir(), 'diorama-mock-library-cache')
mkdirSync(outDir, { recursive: true })
mkdirSync(cacheDir, { recursive: true })

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).setLogger(new Logger(Logger.Verbosity.WARN))
const lastSegment = (name) => name.split('|').filter(Boolean).pop() ?? ''

async function original(model) {
  const file = join(cacheDir, `${model.pid}.glb`)
  if (!existsSync(file)) {
    const res = await fetch(`https://static.poly.pizza/${model.uuid}.glb`)
    if (!res.ok) throw new Error(`${model.id}: download failed (${res.status})`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    await new Promise((r) => setTimeout(r, 700)) // be gentle with the CDN
  }
  return file
}

/** A second animation that plays the same keyframes under another name (e.g. a flying loop as idle and walk). */
function copyAnimation(doc, source, name) {
  const copy = doc.createAnimation(name)
  const samplers = new Map()
  for (const channel of source.listChannels()) {
    const s = channel.getSampler()
    if (!samplers.has(s)) {
      samplers.set(s, doc.createAnimationSampler().setInput(s.getInput()).setOutput(s.getOutput()).setInterpolation(s.getInterpolation()))
      copy.addSampler(samplers.get(s))
    }
    copy.addChannel(doc.createAnimationChannel().setTargetNode(channel.getTargetNode()).setTargetPath(channel.getTargetPath()).setSampler(samplers.get(s)))
  }
  return copy
}

const manifest = []
let total = 0
for (const model of sources) {
  const doc = await io.read(await original(model))
  const root = doc.getRoot()
  const animations = root.listAnimations()
  const kept = new Set()
  const picked = new Map()
  const clips = []
  for (const [ours, theirs] of Object.entries(model.clips)) {
    // Some exports carry the same clip twice under prefixed names: take the fullest one.
    const candidates = animations.filter((a) => lastSegment(a.getName()).toLowerCase() === theirs.toLowerCase())
    const best = picked.get(theirs) ?? candidates.sort((a, b) => b.listChannels().length - a.listChannels().length)[0]
    picked.set(theirs, best)
    if (!best) throw new Error(`${model.id}: clip "${theirs}" not found`)
    if (kept.has(best)) {
      kept.add(copyAnimation(doc, best, ours))
    } else {
      best.setName(ours)
      kept.add(best)
    }
    clips.push(ours)
  }
  for (const a of animations) if (!kept.has(a)) a.dispose()
  await doc.transform(resample(), dedup(), prune(), quantize())
  const file = `${model.id}.glb`
  await io.write(join(outDir, file), doc)
  const bytes = statSync(join(outDir, file)).size
  total += bytes
  manifest.push({
    id: model.id,
    file,
    kind: model.kind,
    clips,
    en: model.en,
    hr: model.hr,
    title: model.title,
    author: 'Quaternius',
    source: `https://poly.pizza/m/${model.pid}`,
    licence: 'CC0 1.0',
  })
  console.log(`${model.id.padEnd(12)} ${String(Math.round(bytes / 1024)).padStart(5)} KB  ${clips.join(',')}`)
}
writeFileSync(join(outDir, 'manifest.json'), JSON.stringify({ version: 1, models: manifest }, null, 1) + '\n')
console.log(`${manifest.length} models, ${(total / 1024 / 1024).toFixed(1)} MB`)
