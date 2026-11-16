// Sky, light and fog for a scene: environment kind x time of day x weather.

import type { TimeOfDay, Weather } from '../../api/types'
import { mix } from './parts'

export type EnvKind = 'outdoor' | 'space' | 'underwater' | 'cave'
type Vec3 = [number, number, number]

export interface Atmosphere {
  skyTop: string
  skyHorizon: string
  skyBottom: string
  /** Key light (sun or moon). Position of the light; it always points at the stage centre. */
  keyColor: string
  keyIntensity: number
  keyPosition: Vec3
  hemiSky: string
  hemiGround: string
  hemiIntensity: number
  /** Back light that draws a bright edge around characters. */
  rimColor: string
  rimIntensity: number
  fogColor: string
  fogDensity: number
  /** Sun / moon disc painted on the sky; placed for the picture, not for physics. */
  discDirection: Vec3
  discColor: string
  discSize: number
  discGlow: number
  starOpacity: number
  cloudColor: string
  /** 0 = no clouds, 1 = normal, 2 = overcast. */
  cloudAmount: number
  /** Windows, lamps and fires glow. */
  lit: boolean
  /** Extra warm fill on the characters so night scenes stay readable. */
  fillIntensity: number
  bloom: number
}

const OUTDOOR: Record<TimeOfDay, Atmosphere> = {
  morning: {
    skyTop: '#5fb4f5',
    skyHorizon: '#ffe3c6',
    skyBottom: '#ffc7a6',
    keyColor: '#ffe0b2',
    keyIntensity: 2.7,
    keyPosition: [-8, 7, 6],
    hemiSky: '#d8edff',
    hemiGround: '#f3d2a8',
    hemiIntensity: 1.0,
    rimColor: '#ffc99a',
    rimIntensity: 0.9,
    fogColor: '#ffe6cf',
    fogDensity: 0.007,
    discDirection: [-0.5, 0.1, -1],
    discColor: '#fff2cf',
    discSize: 0.05,
    discGlow: 0.9,
    starOpacity: 0,
    cloudColor: '#fff4ea',
    cloudAmount: 1,
    lit: false,
    fillIntensity: 0,
    bloom: 0.55,
  },
  day: {
    skyTop: '#3492f0',
    skyHorizon: '#a9dcff',
    skyBottom: '#d9f1ff',
    keyColor: '#fff2d9',
    keyIntensity: 3.1,
    keyPosition: [-6, 11, 6],
    hemiSky: '#cfe8ff',
    hemiGround: '#eadbb8',
    hemiIntensity: 1.1,
    rimColor: '#ffffff',
    rimIntensity: 0.7,
    fogColor: '#d4eeff',
    fogDensity: 0.006,
    discDirection: [0.5, 0.11, -1],
    discColor: '#fffbe6',
    discSize: 0.04,
    discGlow: 0.6,
    starOpacity: 0,
    cloudColor: '#ffffff',
    cloudAmount: 1,
    lit: false,
    fillIntensity: 0,
    bloom: 0.45,
  },
  sunset: {
    skyTop: '#5a4db3',
    skyHorizon: '#ff9c6b',
    skyBottom: '#ffc58c',
    keyColor: '#ffb785',
    keyIntensity: 2.6,
    keyPosition: [-9, 4, 4],
    hemiSky: '#cdbdf7',
    hemiGround: '#f3bfa2',
    hemiIntensity: 1.05,
    rimColor: '#ff7b9c',
    rimIntensity: 1.2,
    fogColor: '#ffb089',
    fogDensity: 0.009,
    discDirection: [-0.3, 0.04, -1],
    discColor: '#ffd9a0',
    discSize: 0.085,
    discGlow: 1.3,
    starOpacity: 0.15,
    cloudColor: '#ffc2b0',
    cloudAmount: 1,
    lit: true,
    fillIntensity: 0.25,
    bloom: 0.7,
  },
  night: {
    skyTop: '#060c2a',
    skyHorizon: '#27357d',
    skyBottom: '#35468f',
    keyColor: '#a9c2ff',
    keyIntensity: 1.7,
    keyPosition: [6, 10, 5],
    hemiSky: '#4a60c0',
    hemiGround: '#272f5e',
    hemiIntensity: 1.15,
    rimColor: '#86a6ff',
    rimIntensity: 1.1,
    fogColor: '#1c2763',
    fogDensity: 0.01,
    discDirection: [0.46, 0.1, -1],
    discColor: '#fff7df',
    discSize: 0.055,
    discGlow: 0.32,
    starOpacity: 0.9,
    cloudColor: '#4d5ea8',
    cloudAmount: 0.6,
    lit: true,
    fillIntensity: 0.9,
    bloom: 0.85,
  },
}

/** Places that have their own sky. Time of day only changes brightness and tint there. */
const INDOOR: Record<Exclude<EnvKind, 'outdoor'>, Atmosphere> = {
  space: {
    ...OUTDOOR.night,
    skyTop: '#04020d',
    skyHorizon: '#190f3d',
    skyBottom: '#2b1759',
    keyColor: '#ffffff',
    keyIntensity: 2.9,
    keyPosition: [-6, 9, 6],
    hemiSky: '#9483ff',
    hemiGround: '#2c2154',
    hemiIntensity: 0.85,
    rimColor: '#b48cff',
    rimIntensity: 1.3,
    fogColor: '#190f3d',
    fogDensity: 0.003,
    discSize: 0,
    discGlow: 0,
    starOpacity: 1,
    cloudAmount: 0,
    fillIntensity: 0.4,
    bloom: 0.9,
  },
  underwater: {
    ...OUTDOOR.day,
    skyTop: '#5fd3ee',
    skyHorizon: '#1f93bd',
    skyBottom: '#0d517c',
    keyColor: '#dcfbff',
    keyIntensity: 2.4,
    keyPosition: [-3, 11, 4],
    hemiSky: '#86e3f6',
    hemiGround: '#1d7190',
    hemiIntensity: 1.1,
    rimColor: '#8ff3ff',
    rimIntensity: 0.9,
    fogColor: '#1f9bc4',
    fogDensity: 0.03,
    discDirection: [0.1, 1, -0.2],
    discColor: '#e9fdff',
    discSize: 0.12,
    discGlow: 1.6,
    cloudAmount: 0,
    lit: true,
    fillIntensity: 0.3,
    bloom: 0.7,
  },
  cave: {
    ...OUTDOOR.night,
    skyTop: '#171022',
    skyHorizon: '#2c1f3f',
    skyBottom: '#3a2a4c',
    keyColor: '#ffcf9c',
    keyIntensity: 2.2,
    keyPosition: [-3, 9, 7],
    hemiSky: '#7462a6',
    hemiGround: '#2c2036',
    hemiIntensity: 0.85,
    rimColor: '#7fdcff',
    rimIntensity: 1.2,
    fogColor: '#241a34',
    fogDensity: 0.018,
    discSize: 0,
    discGlow: 0,
    starOpacity: 0,
    cloudAmount: 0,
    fillIntensity: 0.7,
    bloom: 0.95,
  },
}

export function atmosphereFor(kind: EnvKind, time: TimeOfDay, weather: Weather): Atmosphere {
  let a: Atmosphere
  if (kind === 'outdoor') {
    a = { ...OUTDOOR[time] }
  } else {
    a = { ...INDOOR[kind] }
    if (time === 'night') {
      a.keyIntensity *= 0.75
      a.hemiIntensity *= 0.85
      a.skyTop = mix(a.skyTop, '#02030f', 0.45)
      a.skyHorizon = mix(a.skyHorizon, '#0b1030', 0.4)
      a.skyBottom = mix(a.skyBottom, '#0b1030', 0.4)
      a.fogColor = mix(a.fogColor, '#0b1030', 0.4)
      a.fillIntensity += 0.3
    } else if (time === 'sunset') {
      a.keyColor = mix(a.keyColor, '#ffa66b', 0.45)
      a.rimColor = mix(a.rimColor, '#ff8aa0', 0.4)
      if (kind === 'underwater') a.skyTop = mix(a.skyTop, '#ffc38f', 0.35)
    } else if (time === 'morning') {
      a.keyColor = mix(a.keyColor, '#ffe1b5', 0.3)
    }
  }

  const dark = time === 'night'
  switch (weather) {
    case 'rain': {
      const grey = dark ? '#1b2238' : time === 'sunset' ? '#8b7f96' : '#93a4b8'
      a.skyTop = mix(a.skyTop, grey, 0.62)
      a.skyHorizon = mix(a.skyHorizon, mix(grey, '#ffffff', 0.25), 0.55)
      a.skyBottom = mix(a.skyBottom, grey, 0.45)
      a.fogColor = mix(a.fogColor, grey, 0.6)
      a.keyIntensity *= 0.62
      a.hemiIntensity *= 1.12
      a.fogDensity += 0.012
      a.discGlow *= 0.15
      a.discSize *= 0.5
      a.starOpacity = 0
      a.cloudColor = mix(a.cloudColor, dark ? '#2a3355' : '#7f8ea3', 0.7)
      a.cloudAmount = kind === 'outdoor' ? 2 : a.cloudAmount
      break
    }
    case 'snow': {
      const pale = dark ? '#2d3a6b' : '#dfe9f5'
      a.skyTop = mix(a.skyTop, pale, 0.4)
      a.skyHorizon = mix(a.skyHorizon, pale, 0.4)
      a.fogColor = mix(a.fogColor, pale, 0.5)
      a.keyIntensity *= 0.82
      a.hemiIntensity *= 1.1
      a.fogDensity += 0.008
      a.discGlow *= 0.5
      a.starOpacity *= 0.3
      a.cloudAmount = kind === 'outdoor' ? 1.6 : a.cloudAmount
      break
    }
    case 'fog': {
      const mist = mix(a.skyHorizon, dark ? '#3a4678' : '#e9eef0', 0.6)
      a.skyTop = mix(a.skyTop, mist, 0.6)
      a.skyHorizon = mist
      a.skyBottom = mix(a.skyBottom, mist, 0.7)
      a.fogColor = mist
      a.fogDensity = Math.max(a.fogDensity, 0.021)
      a.keyIntensity *= 0.7
      a.hemiIntensity *= 1.15
      a.discGlow *= 0.6
      a.starOpacity *= 0.2
      break
    }
    case 'stars':
      if (kind === 'outdoor' && !dark) {
        // Stars need a darker sky to show: pull the zenith towards dusk.
        a.skyTop = mix(a.skyTop, '#1b2a70', time === 'sunset' ? 0.35 : 0.5)
      }
      a.starOpacity = Math.max(a.starOpacity, dark ? 1 : time === 'sunset' ? 0.85 : 0.6)
      break
    case 'fireflies':
      a.lit = true
      break
    default:
      break
  }
  return a
}
