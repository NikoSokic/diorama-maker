// Types of the backend story view (docs/API_NOTES.md §4.2). Keep in sync with the controllers.

export type Lang = 'hr' | 'en'
export type Mood = 'cozy' | 'adventurous' | 'funny' | 'mysterious' | 'magical'
export type CharacterKind = 'biped' | 'quadruped' | 'creature' | 'object'

export const ENVIRONMENTS = [
  'meadow',
  'forest',
  'beach',
  'sea',
  'castle',
  'village',
  'snowy_mountain',
  'space',
  'underwater',
  'cave',
  'desert',
  'city_park',
] as const
export type EnvironmentId = (typeof ENVIRONMENTS)[number]

export const TIMES_OF_DAY = ['morning', 'day', 'sunset', 'night'] as const
export type TimeOfDay = (typeof TIMES_OF_DAY)[number]

export const WEATHERS = ['clear', 'rain', 'snow', 'fog', 'stars', 'fireflies'] as const
export type Weather = (typeof WEATHERS)[number]

export type CameraType = 'wide' | 'closeup' | 'orbit' | 'follow' | 'dolly_in' | 'over_shoulder'

export type ActionType =
  | 'enter'
  | 'exit'
  | 'walk_to'
  | 'run_to'
  | 'jump'
  | 'spin'
  | 'wave'
  | 'dance'
  | 'idle'
  | 'look_at'
  | 'grow'
  | 'shrink'
  | 'hide'
  | 'appear'
  | 'celebrate'

export type Emotion = 'neutral' | 'happy' | 'sad' | 'scared' | 'surprised' | 'angry' | 'excited' | 'sleepy'

export const PROP_TYPES = [
  'tree',
  'pine',
  'bush',
  'rock',
  'flower',
  'mushroom',
  'house',
  'tent',
  'campfire',
  'bench',
  'fence',
  'lantern',
  'ball',
  'balloon',
  'gift',
  'cake',
  'treasure_chest',
  'boat',
  'bridge',
  'signpost',
  'star',
  'crystal',
  'snowman',
  'cactus',
  'shell',
  'rocket',
] as const
export type PropType = (typeof PROP_TYPES)[number]

export interface GridPoint {
  x: number
  z: number
}

export interface PlanAction {
  characterKey: string
  type: ActionType
  to?: GridPoint
  targetKey?: string
  startAt: number
  duration: number
  emotion?: Emotion
}

export interface PlanProp {
  type: PropType
  x: number
  z: number
  scale?: number
}

export interface PlanScene {
  environment: EnvironmentId
  timeOfDay: TimeOfDay
  weather: Weather
  narration: string
  durationSec: number
  camera: { type: CameraType; targetKey?: string }
  actions: PlanAction[]
  props?: PlanProp[]
}

export interface PlanCharacter {
  key: string
  displayName: string
  kind: CharacterKind
  relativeSize: number
  tripoPrompt?: string
}

export interface StoryPlan {
  title: string
  language: Lang
  mood: Mood
  palette: string[]
  source?: 'gemini' | 'offline'
  characters: PlanCharacter[]
  scenes: PlanScene[]
}

/** Our stable animation names; `clip` is the name inside the GLB. */
export type AnimationName = 'walk' | 'idle' | 'run' | 'jump' | 'celebrate'

export interface ModelAnimation {
  name: AnimationName | string
  clip: string
  url: string
}

export interface CharacterModel {
  glbUrl: string
  riggedGlbUrl?: string
  rigged: boolean
  rigType?: string
  thumbnailUrl?: string
  animations: ModelAnimation[]
}

export type CharacterStatus = 'PENDING' | 'GENERATING' | 'RIGGING' | 'READY' | 'PLACEHOLDER'

export interface StoryCharacter {
  key: string
  displayName: string
  kind: CharacterKind
  status: CharacterStatus
  progress: number
  error?: string
  model?: CharacterModel
}

export type StoryStatus = 'ANALYZING' | 'GENERATING_MODELS' | 'READY' | 'FAILED'

export interface StoryView {
  slug: string
  status: StoryStatus
  progress: number
  lang: Lang
  text: string
  title?: string
  createdAt?: string
  error?: string
  errorCode?: string
  plan?: StoryPlan
  characters: StoryCharacter[]
  /** Generated narrator voice, one clip per scene; absent or null = the browser's voice reads the story. */
  narration?: NarrationClip[] | null
}

export interface NarrationClip {
  url: string
  durationSec: number
}

/** Answer of `POST /api/stories`. */
export interface CreatedStory {
  slug: string
  status: StoryStatus
}

/** One card of `GET /api/stories` (docs/API_NOTES.md §4.3). */
export interface GalleryItem {
  slug: string
  title: string
  mood: Mood
  palette: string[]
  environment: EnvironmentId
  characters: string[]
  createdAt?: string
  thumbnailUrl?: string
}

export interface ApiError {
  code: string
  message: string
}
