import { describe, expect, it, vi } from 'vitest'
import type { PlanScene } from '../../api/types'
import { MOCK_STORIES } from '../../mock/stories'
import { compileStory } from '../engine/timeline'
import { SoundEngine } from './engine'
import { BETWEEN_SCENES, DUCK, mixLevels, SILENT } from './mix'
import { cuesBetween, soundscapeFor, stepInterval } from './soundscape'

const base = MOCK_STORIES[0].plan!.scenes[0]
const scene = (patch: Partial<PlanScene>): PlanScene => ({ ...base, ...patch })

describe('soundscape', () => {
  it('gives each place its own bed and critters', () => {
    expect(soundscapeFor(scene({ environment: 'meadow', timeOfDay: 'day', weather: 'clear' }), 'cozy').critters).toBe('birds')
    expect(soundscapeFor(scene({ environment: 'meadow', timeOfDay: 'night', weather: 'clear' }), 'cozy').critters).toBe('crickets')
    expect(soundscapeFor(scene({ environment: 'beach', timeOfDay: 'day', weather: 'clear' }), 'cozy').critters).toBe('gulls')
    expect(soundscapeFor(scene({ environment: 'underwater', timeOfDay: 'day', weather: 'clear' }), 'cozy').critters).toBe('bubbles')
    expect(soundscapeFor(scene({ environment: 'cave', timeOfDay: 'day', weather: 'clear' }), 'cozy').critters).toBe('drips')
    expect(soundscapeFor(scene({ environment: 'space', timeOfDay: 'night', weather: 'stars' }), 'magical').critters).toBe('none')
    const beach = soundscapeFor(scene({ environment: 'beach' }), 'cozy').bed
    const castle = soundscapeFor(scene({ environment: 'castle' }), 'cozy').bed
    expect(beach.level).toBeGreaterThan(castle.level)
    expect(beach.swell.depth).toBeGreaterThan(castle.swell.depth)
  })

  it('adds rain, wind and thunder only where the plan has the weather', () => {
    const rainyDay = soundscapeFor(scene({ environment: 'forest', timeOfDay: 'day', weather: 'rain' }), 'cozy')
    expect(rainyDay.rain).toBe(1)
    expect(rainyDay.thunder).toBe(false)
    expect(rainyDay.critters).toBe('none')
    expect(soundscapeFor(scene({ environment: 'forest', timeOfDay: 'night', weather: 'rain' }), 'cozy').thunder).toBe(true)
    expect(soundscapeFor(scene({ environment: 'forest', timeOfDay: 'day', weather: 'rain' }), 'mysterious').thunder).toBe(true)
    expect(soundscapeFor(scene({ environment: 'cave', timeOfDay: 'night', weather: 'rain' }), 'mysterious').rain).toBe(0)
    expect(soundscapeFor(scene({ environment: 'village', weather: 'snow' }), 'cozy').wind).toBeGreaterThan(0.5)
    expect(soundscapeFor(scene({ environment: 'meadow', weather: 'clear' }), 'cozy').wind).toBe(0)
  })

  it('changes identity only when what you hear changes', () => {
    const a = soundscapeFor(scene({ environment: 'meadow', timeOfDay: 'day', weather: 'clear', narration: 'one' }), 'cozy')
    const b = soundscapeFor(scene({ environment: 'meadow', timeOfDay: 'day', weather: 'clear', narration: 'two' }), 'cozy')
    const c = soundscapeFor(scene({ environment: 'meadow', timeOfDay: 'night', weather: 'clear' }), 'cozy')
    expect(a.id).toBe(b.id)
    expect(a.id).not.toBe(c.id)
  })

  it('walks on the right surface', () => {
    expect(soundscapeFor(scene({ environment: 'castle' }), 'cozy').surface).toBe('stone')
    expect(soundscapeFor(scene({ environment: 'beach' }), 'cozy').surface).toBe('soft')
    expect(soundscapeFor(scene({ environment: 'meadow' }), 'cozy').surface).toBe('grass')
  })
})

describe('action cues', () => {
  const compiled = compileStory(MOCK_STORIES[0].plan!)
  const all = compiled.flatMap((s) => cuesBetween(s, -1, s.duration))

  it('plays each action sound once, when the scene time crosses its start', () => {
    const first = compiled.find((s) => cuesBetween(s, -1, s.duration).length > 0)!
    const cues = cuesBetween(first, -1, first.duration)
    const at = cues[0].at
    expect(cuesBetween(first, at - 0.05, at).map((c) => c.at)).toContain(at)
    expect(cuesBetween(first, at, at + 0.01).filter((c) => c.at === at)).toHaveLength(0)
    expect(cuesBetween(first, 5, 5)).toEqual([])
  })

  it('maps actions to sounds', () => {
    expect(all.length).toBeGreaterThan(0)
    for (const cue of all) expect(['hop', 'pop', 'chime', 'whoosh']).toContain(cue.kind)
  })

  it('steps only while moving', () => {
    expect(stepInterval('walk', 1)).toBe(0.4)
    expect(stepInterval('run', 2)).toBeLessThan(0.4)
    expect(stepInterval('walk', 0)).toBeNull()
    expect(stepInterval('idle', 1)).toBeNull()
  })
})

describe('mix', () => {
  const playing = { muted: false, playing: true, phase: 'playing' as const, speaking: false, covering: false }

  it('is silent when muted, paused, before Play and after the end', () => {
    expect(mixLevels({ ...playing, muted: true })).toEqual(SILENT)
    expect(mixLevels({ ...playing, playing: false })).toEqual(SILENT)
    expect(mixLevels({ ...playing, phase: 'title' })).toEqual(SILENT)
    expect(mixLevels({ ...playing, phase: 'ended' })).toEqual(SILENT)
  })

  it('ducks the ambience under the narrator and dips it between scenes', () => {
    expect(mixLevels(playing).bed).toBe(1)
    expect(mixLevels({ ...playing, speaking: true }).bed).toBe(DUCK)
    expect(mixLevels({ ...playing, covering: true }).bed).toBe(BETWEEN_SCENES)
    expect(mixLevels({ ...playing, speaking: true }).sfx).toBeLessThan(1)
  })
})

// ---- engine against a recording fake AudioContext ------------------------------------------------------------

function fakeParam(initial = 0) {
  return {
    value: initial,
    targets: [] as number[],
    setValueAtTime(v: number) {
      this.value = v
      return this
    },
    linearRampToValueAtTime() {
      return this
    },
    exponentialRampToValueAtTime() {
      return this
    },
    setTargetAtTime(v: number) {
      this.targets.push(v)
      return this
    },
    cancelScheduledValues() {
      return this
    },
  }
}

function fakeNode(extra: object = {}) {
  return {
    connect(next: unknown) {
      return next
    },
    disconnect() {},
    start() {},
    stop() {},
    gain: fakeParam(1),
    frequency: fakeParam(),
    detune: fakeParam(),
    Q: fakeParam(),
    ...extra,
  }
}

function fakeContext() {
  const created: string[] = []
  const ctx = {
    state: 'running',
    currentTime: 0,
    sampleRate: 8000,
    destination: fakeNode(),
    resume: vi.fn(async () => {}),
    suspend: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
    createGain: () => (created.push('gain'), fakeNode()),
    createBiquadFilter: () => (created.push('filter'), fakeNode()),
    createOscillator: () => (created.push('osc'), fakeNode()),
    createBufferSource: () => (created.push('source'), fakeNode()),
    createBuffer: (_c: number, length: number) => ({ getChannelData: () => new Float32Array(length) }),
  }
  return { ctx, created }
}

describe('sound engine', () => {
  it('creates nothing before the Play gesture unlocks it', () => {
    const factory = vi.fn(() => fakeContext().ctx)
    const engine = new SoundEngine(factory as never)
    engine.setScene(soundscapeFor(scene({ environment: 'meadow' }), 'cozy'))
    engine.cue('chime')
    expect(factory).not.toHaveBeenCalled()
    expect(engine.snapshot().state).toBe('locked')
    expect(engine.snapshot().scene).toContain('meadow')
  })

  it('builds the pending scene on unlock, follows the mix and counts cues', () => {
    vi.useFakeTimers()
    const { ctx, created } = fakeContext()
    const engine = new SoundEngine(() => ctx as never)
    engine.setScene(soundscapeFor(scene({ environment: 'forest', weather: 'rain', timeOfDay: 'night' }), 'mysterious'))
    engine.unlock()
    expect(engine.snapshot()).toMatchObject({ state: 'running', layers: 1 })
    expect(created.filter((c) => c === 'source').length).toBeGreaterThanOrEqual(3) // bed, rain, wind

    engine.cue('hop')
    expect(engine.snapshot().played.hop).toBeUndefined() // still silent: no sound, no count

    engine.setLevels(mixLevels({ muted: false, playing: true, phase: 'playing', speaking: true, covering: false }))
    expect(engine.snapshot().levels.bed).toBe(DUCK)
    engine.cue('hop')
    engine.cue('step', 'stone')
    expect(engine.snapshot().played).toMatchObject({ hop: 1, step: 1 })

    // a different scene crossfades to a new layer; the same one does nothing
    const before = created.length
    engine.setScene(soundscapeFor(scene({ environment: 'forest', weather: 'rain', timeOfDay: 'night' }), 'mysterious'))
    expect(created.length).toBe(before)
    engine.setScene(soundscapeFor(scene({ environment: 'beach', weather: 'clear', timeOfDay: 'day' }), 'cozy'))
    expect(created.length).toBeGreaterThan(before)
    expect(engine.snapshot().scene).toContain('beach')

    engine.dispose()
    expect(ctx.close).toHaveBeenCalled()
    vi.useRealTimers()
  })

  it('stays silent without Web Audio', () => {
    const engine = new SoundEngine(() => {
      throw new Error('no audio')
    })
    engine.unlock()
    expect(engine.unlocked).toBe(false)
  })
})
