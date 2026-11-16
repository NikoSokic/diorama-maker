// Web Audio side of the soundscape. Everything is synthesised (filtered noise, oscillators), so there are no
// sound files to download or license. One engine per player; nothing is created before `unlock()`, which the
// player calls right after the viewer pressed Play (browsers only allow audio after a user gesture).

import { SILENT, type MixLevels } from './mix'
import type { CueKind, Critter, Soundscape, Surface } from './soundscape'

type Ctx = BaseAudioContext & {
  resume(): Promise<void>
  suspend(): Promise<void>
  close(): Promise<void>
  state: AudioContextState
  createMediaStreamDestination?: () => MediaStreamAudioDestinationNode
}

const CROSSFADE = 1.6
/** Fast duck when the narrator starts, slower release when it stops. */
const DUCK_TC = 0.12
const RELEASE_TC = 0.45

export interface AudioSnapshot {
  state: AudioContextState | 'locked'
  scene: string | null
  levels: MixLevels
  layers: number
  /** How many of each one-shot sound were played; for checks in tests and Playwright. */
  played: Record<string, number>
  /** The generated narrator voice, when one is routed through the engine. */
  voice: { playing: boolean; time: number } | null
}

interface Layer {
  id: string
  gain: GainNode
  stoppers: (() => void)[]
  spec: Soundscape
}

const midiToHz = (n: number) => 440 * 2 ** ((n - 69) / 12)

export class SoundEngine {
  private ctx: Ctx | null = null
  private master!: GainNode
  private bedBus!: GainNode
  private sfxBus!: GainNode
  /** The narrator's voice: straight to the output (not ducked, not faded with the ambience). */
  private voice!: GainNode
  private voiceElement: HTMLAudioElement | null = null
  private noise!: AudioBuffer
  private layer: Layer | null = null
  private pending: Soundscape | null = null
  private levels: MixLevels = SILENT
  private timer: ReturnType<typeof setInterval> | null = null
  private nextEvent: Record<string, number> = {}
  private stream: MediaStreamAudioDestinationNode | null = null
  private readonly played: Record<string, number> = {}

  private readonly factory: () => Ctx

  constructor(factory: () => Ctx = () => new AudioContext() as Ctx) {
    this.factory = factory
  }

  get unlocked(): boolean {
    return this.ctx !== null
  }

  /** Call from (or right after) a user gesture. Safe to call again; resumes a suspended context. */
  unlock(): void {
    if (!this.ctx) {
      let ctx: Ctx
      try {
        ctx = this.factory()
      } catch {
        return // no Web Audio: the player simply stays silent
      }
      this.ctx = ctx
      this.master = ctx.createGain()
      this.master.gain.value = 0
      this.master.connect(ctx.destination)
      this.bedBus = ctx.createGain()
      this.sfxBus = ctx.createGain()
      this.bedBus.gain.value = 0
      this.sfxBus.gain.value = 0
      this.bedBus.connect(this.master)
      this.sfxBus.connect(this.master)
      this.voice = ctx.createGain()
      this.voice.connect(ctx.destination)
      this.noise = this.makeNoise()
      this.timer = setInterval(() => this.scheduleEvents(), 250)
      if (this.pending) this.setScene(this.pending)
      this.setLevels(this.levels, true)
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {})
  }

  /** A stream of everything the engine plays (for recording the story as a video). */
  captureStream(): MediaStream | null {
    if (!this.ctx?.createMediaStreamDestination) return null
    if (!this.stream) {
      this.stream = this.ctx.createMediaStreamDestination()
      this.master.connect(this.stream)
      this.voice.connect(this.stream)
    }
    return this.stream.stream
  }

  /** Plays an <audio> element (the generated narrator voice) through the engine, so a recording includes it. */
  route(element: HTMLAudioElement): boolean {
    const ctx = this.ctx as (Ctx & { createMediaElementSource?: (el: HTMLMediaElement) => AudioNode }) | null
    if (!ctx?.createMediaElementSource) return false
    try {
      ctx.createMediaElementSource(element).connect(this.voice)
      this.voiceElement = element
      return true
    } catch {
      return false
    }
  }

  get context(): BaseAudioContext | null {
    return this.ctx
  }

  setScene(spec: Soundscape): void {
    if (!this.ctx) {
      this.pending = spec
      return
    }
    if (this.layer?.id === spec.id) return
    const ctx = this.ctx
    const now = ctx.currentTime
    const old = this.layer
    if (old) {
      old.gain.gain.cancelScheduledValues(now)
      old.gain.gain.setValueAtTime(old.gain.gain.value, now)
      old.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE)
      setTimeout(() => old.stoppers.forEach((stop) => stop()), (CROSSFADE + 0.2) * 1000)
    }
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + CROSSFADE)
    gain.connect(this.bedBus)
    const layer: Layer = { id: spec.id, gain, stoppers: [], spec }
    this.buildBed(layer)
    this.layer = layer
    this.pending = spec
    this.nextEvent = {}
  }

  /** Moves the buses towards these levels; ducking is quick, recovering is gentle. */
  setLevels(levels: MixLevels, immediate = false): void {
    const previous = this.levels
    this.levels = levels
    if (!this.ctx) return
    const now = this.ctx.currentTime
    const apply = (param: AudioParam, from: number, to: number) => {
      if (from === to && !immediate) return
      param.cancelScheduledValues(now)
      param.setTargetAtTime(to, now, to < from ? DUCK_TC : RELEASE_TC)
    }
    apply(this.master.gain, previous.master, levels.master)
    apply(this.bedBus.gain, previous.bed, levels.bed)
    apply(this.sfxBus.gain, previous.sfx, levels.sfx)
  }

  /** One-shot action sound. Silent (and not counted) while the sound effects bus is off. */
  cue(kind: CueKind | 'step', surface: Surface = 'grass', magical = false): void {
    if (!this.ctx || this.levels.sfx === 0 || this.levels.master === 0) return
    this.count(kind)
    const ctx = this.ctx
    const t = ctx.currentTime + 0.01
    switch (kind) {
      case 'step':
        this.noiseBurst(t, surface === 'stone' ? 2200 : surface === 'soft' ? 700 : 1300, 0.045, 0.05 + Math.random() * 0.02, this.sfxBus)
        break
      case 'hop':
        this.sweep(t, 'sine', 260, 720, 0.16, 0.07, this.sfxBus)
        break
      case 'pop':
        this.sweep(t, 'sine', 600, 1300, 0.07, 0.06, this.sfxBus)
        break
      case 'whoosh':
        this.noiseBurst(t, 900, 0.5, 0.05, this.sfxBus, 2.5)
        break
      case 'chime': {
        const scale = [72, 74, 76, 79, 81, 84]
        const start = Math.floor(Math.random() * 3)
        const notes = magical ? 4 : 3
        for (let i = 0; i < notes; i++) this.bell(t + i * 0.08, midiToHz(scale[(start + i * 2) % scale.length]), 0.05, this.sfxBus)
        break
      }
    }
  }

  snapshot(): AudioSnapshot {
    return {
      state: this.ctx ? this.ctx.state : 'locked',
      scene: this.layer?.id ?? this.pending?.id ?? null,
      levels: { ...this.levels },
      layers: this.layer ? 1 : 0,
      played: { ...this.played },
      voice: this.voiceElement ? { playing: !this.voiceElement.paused, time: this.voiceElement.currentTime } : null,
    }
  }

  suspend(): void {
    if (this.ctx?.state === 'running') void this.ctx.suspend().catch(() => {})
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.layer?.stoppers.forEach((stop) => stop())
    this.layer = null
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }

  // ---- building blocks -----------------------------------------------------------------------------------

  private count(kind: string) {
    this.played[kind] = (this.played[kind] ?? 0) + 1
  }

  private makeNoise(): AudioBuffer {
    const ctx = this.ctx!
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1
    return buffer
  }

  private loopNoise(layer: Layer): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource()
    src.buffer = this.noise
    src.loop = true
    // Start at a random point so two layers never phase against each other.
    src.start(0, Math.random() * 2)
    layer.stoppers.push(() => {
      try {
        src.stop()
      } catch {
        /* already stopped */
      }
      src.disconnect()
    })
    return src
  }

  private lfo(layer: Layer, rate: number, depth: number, target: AudioParam) {
    const osc = this.ctx!.createOscillator()
    const amount = this.ctx!.createGain()
    osc.frequency.value = rate
    amount.gain.value = depth
    osc.connect(amount).connect(target)
    osc.start()
    layer.stoppers.push(() => {
      try {
        osc.stop()
      } catch {
        /* already stopped */
      }
      osc.disconnect()
    })
  }

  private buildBed(layer: Layer) {
    const ctx = this.ctx!
    const { bed, rain, wind, pad } = layer.spec

    // The environment's own noise, slowly swelling.
    const filter = ctx.createBiquadFilter()
    filter.type = bed.filter
    filter.frequency.value = bed.freq
    filter.Q.value = bed.q
    const level = ctx.createGain()
    level.gain.value = bed.level
    this.loopNoise(layer).connect(filter).connect(level).connect(layer.gain)
    this.lfo(layer, bed.swell.rate, bed.level * bed.swell.depth * 0.5, level.gain)

    if (rain > 0) {
      const hp = ctx.createBiquadFilter()
      hp.type = 'highpass'
      hp.frequency.value = 1400
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 7000
      const g = ctx.createGain()
      g.gain.value = 0.07 * rain
      this.loopNoise(layer).connect(hp).connect(lp).connect(g).connect(layer.gain)
    }
    if (wind > 0) {
      const bp = ctx.createBiquadFilter()
      bp.type = 'bandpass'
      bp.frequency.value = 600
      bp.Q.value = 2
      const g = ctx.createGain()
      g.gain.value = 0.06 * wind
      this.loopNoise(layer).connect(bp).connect(g).connect(layer.gain)
      this.lfo(layer, 0.13, 320, bp.frequency) // the howl moves up and down
      this.lfo(layer, 0.07, 0.025 * wind, g.gain)
    }
    if (pad.notes.length > 0 && pad.level > 0) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 900
      const g = ctx.createGain()
      g.gain.value = pad.level / Math.sqrt(pad.notes.length)
      lp.connect(g).connect(layer.gain)
      this.lfo(layer, 0.09, (pad.level / Math.sqrt(pad.notes.length)) * 0.35, g.gain)
      for (const note of pad.notes) {
        for (const detune of [-5, 5]) {
          const osc = ctx.createOscillator()
          osc.type = 'triangle'
          osc.frequency.value = midiToHz(note)
          osc.detune.value = detune
          osc.connect(lp)
          osc.start()
          layer.stoppers.push(() => {
            try {
              osc.stop()
            } catch {
              /* already stopped */
            }
            osc.disconnect()
          })
        }
      }
    }
  }

  /** Occasional sounds of the place: birds, crickets, drips, distant thunder. */
  private scheduleEvents() {
    const ctx = this.ctx
    const layer = this.layer
    if (!ctx || !layer || this.levels.bed === 0 || this.levels.master === 0) return
    const now = ctx.currentTime
    const due = (key: string, min: number, max: number) => {
      const next = this.nextEvent[key]
      if (next === undefined) {
        this.nextEvent[key] = now + min * Math.random()
        return false
      }
      if (now < next) return false
      this.nextEvent[key] = now + min + Math.random() * (max - min)
      return true
    }
    const critter: Critter = layer.spec.critters
    const out = layer.gain
    if (critter === 'birds' && due('birds', 2, 6)) {
      this.count('birds')
      const notes = 2 + Math.floor(Math.random() * 3)
      const base = 2400 + Math.random() * 1400
      for (let i = 0; i < notes; i++) this.sweep(now + i * 0.11, 'sine', base, base * 1.45, 0.07, 0.022, out)
    }
    if (critter === 'crickets' && due('crickets', 1, 3)) {
      this.count('crickets')
      for (let i = 0; i < 6; i++) this.sweep(now + i * 0.045, 'square', 4300, 4400, 0.025, 0.004, out)
    }
    if (critter === 'gulls' && due('gulls', 6, 12)) {
      this.count('gulls')
      this.sweep(now, 'sawtooth', 1150, 700, 0.35, 0.008, out, 1600)
      this.sweep(now + 0.42, 'sawtooth', 1100, 760, 0.3, 0.006, out, 1600)
    }
    if (critter === 'bubbles' && due('bubbles', 1, 3)) {
      this.count('bubbles')
      for (let i = 0; i < 3; i++) this.sweep(now + i * 0.09, 'sine', 300 + Math.random() * 200, 900, 0.06, 0.02, out)
    }
    if (critter === 'drips' && due('drips', 2, 5)) {
      this.count('drips')
      this.sweep(now, 'sine', 1400, 600, 0.06, 0.03, out)
    }
    if (layer.spec.thunder && due('thunder', 9, 22)) {
      this.count('thunder')
      this.noiseBurst(now, 160, 3.2, 0.32, out, 0.7, 0.08)
    }
  }

  private sweep(t: number, type: OscillatorType, from: number, to: number, dur: number, peak: number, out: AudioNode, lowpass?: number) {
    const ctx = this.ctx!
    const osc = ctx.createOscillator()
    osc.type = type
    osc.frequency.setValueAtTime(from, t)
    osc.frequency.exponentialRampToValueAtTime(to, t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + Math.min(0.015, dur / 3))
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    let chain: AudioNode = osc.connect(g)
    if (lowpass) {
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = lowpass
      chain = chain.connect(lp)
    }
    chain.connect(out)
    osc.start(t)
    osc.stop(t + dur + 0.05)
    osc.onended = () => osc.disconnect()
  }

  private noiseBurst(t: number, freq: number, dur: number, peak: number, out: AudioNode, q = 1, attack = 0.005) {
    const ctx = this.ctx!
    const src = ctx.createBufferSource()
    src.buffer = this.noise
    const filter = ctx.createBiquadFilter()
    filter.type = q < 1 ? 'lowpass' : 'bandpass'
    filter.frequency.value = freq
    filter.Q.value = q
    const g = ctx.createGain()
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(peak, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(filter).connect(g).connect(out)
    src.start(t, Math.random() * 1.5)
    src.stop(t + dur + 0.05)
    src.onended = () => src.disconnect()
  }

  private bell(t: number, freq: number, peak: number, out: AudioNode) {
    // Inharmonic partials of a small bell.
    for (const [ratio, amp, decay] of [
      [1, 1, 1.4],
      [2.76, 0.4, 0.8],
      [5.4, 0.2, 0.4],
    ]) {
      const ctx = this.ctx!
      const osc = ctx.createOscillator()
      osc.frequency.value = freq * ratio
      const g = ctx.createGain()
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(peak * amp, t + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t + decay)
      osc.connect(g).connect(out)
      osc.start(t)
      osc.stop(t + decay + 0.05)
      osc.onended = () => osc.disconnect()
    }
  }
}
