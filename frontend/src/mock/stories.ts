// Bundled sample stories in the exact shape of the backend story view (docs/API_NOTES.md §4.2).
// They use the same four CC0 models the backend serves in mock mode, so the player can be developed,
// tested and demonstrated with no backend at all.

import type {
  CharacterKind,
  EnvironmentId,
  PlanCharacter,
  PlanScene,
  StoryCharacter,
  StoryPlan,
  StoryView,
  TimeOfDay,
  Weather,
} from '../api/types'

const BIPED_CLIPS = [
  { name: 'walk', clip: 'Walking' },
  { name: 'idle', clip: 'Idle' },
  { name: 'run', clip: 'Running' },
  { name: 'jump', clip: 'Jump' },
  { name: 'celebrate', clip: 'Dance' },
]

function mockCharacter(plan: PlanCharacter, placeholder = false): StoryCharacter {
  const base = { key: plan.key, displayName: plan.displayName, kind: plan.kind, progress: 100 }
  if (placeholder) return { ...base, status: 'PLACEHOLDER', error: 'GENERATION_FAILED' }
  const url = `/mock/${plan.kind}.glb`
  const clips = plan.kind === 'biped' ? BIPED_CLIPS : plan.kind === 'quadruped' ? [{ name: 'walk', clip: 'Walk' }] : []
  return {
    ...base,
    status: 'READY',
    model: {
      glbUrl: url,
      rigged: clips.length > 0,
      rigType: clips.length > 0 ? plan.kind : undefined,
      animations: clips.map((c) => ({ ...c, url })),
    },
  }
}

function view(slug: string, text: string, plan: StoryPlan, placeholders: string[] = []): StoryView {
  return {
    slug,
    status: 'READY',
    progress: 100,
    lang: plan.language,
    text,
    title: plan.title,
    createdAt: '2026-11-16T06:00:00Z',
    plan,
    characters: plan.characters.map((c) => mockCharacter(c, placeholders.includes(c.key))),
  }
}

const character = (key: string, displayName: string, kind: CharacterKind, relativeSize: number): PlanCharacter => ({
  key,
  displayName,
  kind,
  relativeSize,
})

const robotStory: StoryPlan = {
  title: 'Robot Bip i izgubljeni psić',
  language: 'hr',
  mood: 'adventurous',
  palette: ['#ff8a5b', '#5bb8ff', '#ffd166'],
  source: 'gemini',
  characters: [character('bip', 'Bip', 'biped', 1.1), character('flek', 'Flek', 'quadruped', 0.7), character('gljiva', 'Gljivica', 'object', 0.6)],
  scenes: [
    {
      environment: 'meadow',
      timeOfDay: 'morning',
      weather: 'clear',
      narration: 'Jednog sunčanog jutra robot Bip šetao je livadom i tražio prijatelja za igru.',
      durationSec: 8,
      camera: { type: 'wide' },
      actions: [
        { characterKey: 'bip', type: 'enter', to: { x: -1.5, z: 0.5 }, startAt: 0.3, duration: 3.2, emotion: 'happy' },
        { characterKey: 'bip', type: 'wave', startAt: 4.2, duration: 2.4, emotion: 'happy' },
      ],
      props: [
        { type: 'signpost', x: 3.5, z: -2.5 },
        { type: 'ball', x: 2.2, z: 1.8, scale: 0.9 },
      ],
    },
    {
      environment: 'meadow',
      timeOfDay: 'morning',
      weather: 'clear',
      narration: 'Iza grma začuo je tiho cviljenje. Bio je to mali psić Flek, koji se izgubio.',
      durationSec: 8,
      camera: { type: 'over_shoulder', targetKey: 'bip' },
      actions: [
        { characterKey: 'flek', type: 'enter', to: { x: 2.4, z: 0.2 }, startAt: 0.4, duration: 3, emotion: 'sad' },
        { characterKey: 'bip', type: 'look_at', targetKey: 'flek', startAt: 1, duration: 2.5, emotion: 'surprised' },
        { characterKey: 'bip', type: 'walk_to', to: { x: 0.6, z: 0.4 }, startAt: 4, duration: 2.6, emotion: 'happy' },
      ],
      props: [{ type: 'signpost', x: 3.5, z: -2.5 }],
    },
    {
      environment: 'forest',
      timeOfDay: 'sunset',
      weather: 'fog',
      narration: 'Zajedno su krenuli kroz maglovitu šumu. Čarobna Gljivica pokazala im je put.',
      durationSec: 9,
      camera: { type: 'follow', targetKey: 'flek' },
      actions: [
        { characterKey: 'gljiva', type: 'appear', to: { x: 3.2, z: -0.8 }, startAt: 0.5, duration: 1.2, emotion: 'excited' },
        { characterKey: 'bip', type: 'enter', to: { x: -2.6, z: 0.6 }, startAt: 0.2, duration: 3 },
        { characterKey: 'flek', type: 'enter', to: { x: -0.6, z: 1.2 }, startAt: 1, duration: 3 },
        { characterKey: 'flek', type: 'run_to', to: { x: 1.6, z: 0.4 }, startAt: 4.8, duration: 2.2, emotion: 'excited' },
        { characterKey: 'gljiva', type: 'spin', startAt: 5.5, duration: 2.6, emotion: 'happy' },
      ],
      props: [
        { type: 'lantern', x: -4.2, z: -1.8 },
        { type: 'mushroom', x: 4.4, z: 1.6, scale: 1.3 },
      ],
    },
    {
      environment: 'cave',
      timeOfDay: 'night',
      weather: 'fireflies',
      narration: 'U tamnoj špilji Flek se uplašio, ali krijesnice su zasvijetlile poput malih zvijezda.',
      durationSec: 9,
      camera: { type: 'dolly_in', targetKey: 'flek' },
      actions: [
        { characterKey: 'flek', type: 'enter', to: { x: 0.8, z: 0.6 }, startAt: 0.3, duration: 2.6, emotion: 'scared' },
        { characterKey: 'bip', type: 'enter', to: { x: -1.4, z: 0.4 }, startAt: 0.8, duration: 2.8 },
        { characterKey: 'bip', type: 'look_at', targetKey: 'flek', startAt: 4, duration: 1.5, emotion: 'happy' },
        { characterKey: 'flek', type: 'jump', startAt: 5.6, duration: 2.6, emotion: 'excited' },
      ],
      props: [
        { type: 'crystal', x: -3.6, z: -2.2, scale: 1.3 },
        { type: 'treasure_chest', x: 3.4, z: -1.6 },
      ],
    },
    {
      environment: 'village',
      timeOfDay: 'night',
      weather: 'stars',
      narration: 'Na kraju su stigli do sela, gdje je Fleka čekao njegov dom. Svi su plesali od sreće!',
      durationSec: 10,
      camera: { type: 'orbit' },
      actions: [
        { characterKey: 'bip', type: 'enter', to: { x: -2.2, z: 0.6 }, startAt: 0.2, duration: 2.8, emotion: 'happy' },
        { characterKey: 'flek', type: 'enter', to: { x: 0.2, z: 1.2 }, startAt: 0.6, duration: 2.8, emotion: 'excited' },
        { characterKey: 'gljiva', type: 'appear', to: { x: 2.6, z: 0.4 }, startAt: 2.4, duration: 1, emotion: 'happy' },
        { characterKey: 'bip', type: 'dance', startAt: 3.6, duration: 6, emotion: 'excited' },
        { characterKey: 'flek', type: 'celebrate', startAt: 3.9, duration: 5.8, emotion: 'excited' },
        { characterKey: 'gljiva', type: 'jump', startAt: 4.2, duration: 5, emotion: 'happy' },
      ],
      props: [
        { type: 'campfire', x: 0.2, z: -2.6 },
        { type: 'balloon', x: -4.4, z: -1.2 },
        { type: 'gift', x: 3.8, z: 2 },
      ],
    },
  ],
}

const seaStory: StoryPlan = {
  title: 'The Little Star Who Fell Into the Sea',
  language: 'en',
  mood: 'magical',
  palette: ['#ffd166', '#6ecbff', '#ff8fab'],
  source: 'gemini',
  characters: [character('star', 'Twinkle', 'creature', 0.8), character('robot', 'Captain Bolt', 'biped', 1.2), character('crab', 'Pinch', 'creature', 0.6)],
  scenes: [
    {
      environment: 'beach',
      timeOfDay: 'sunset',
      weather: 'clear',
      narration: 'One golden evening a tiny star named Twinkle tumbled out of the sky and landed on the beach.',
      durationSec: 8,
      camera: { type: 'dolly_in', targetKey: 'star' },
      actions: [
        { characterKey: 'star', type: 'appear', to: { x: 0.4, z: 0.6 }, startAt: 0.6, duration: 1.2, emotion: 'surprised' },
        { characterKey: 'star', type: 'jump', startAt: 2.6, duration: 1.8, emotion: 'scared' },
        { characterKey: 'star', type: 'idle', startAt: 4.8, duration: 3, emotion: 'sad' },
      ],
      props: [
        { type: 'shell', x: -2.6, z: 2.2 },
        { type: 'star', x: 3.4, z: -2.4 },
      ],
    },
    {
      environment: 'sea',
      timeOfDay: 'sunset',
      weather: 'clear',
      narration: 'Captain Bolt sailed by and promised to help her find the way back home.',
      durationSec: 8,
      camera: { type: 'wide' },
      actions: [
        { characterKey: 'robot', type: 'enter', to: { x: -2, z: 0.4 }, startAt: 0.3, duration: 3, emotion: 'happy' },
        { characterKey: 'star', type: 'enter', to: { x: 1.4, z: 0.8 }, startAt: 0.9, duration: 2.8 },
        { characterKey: 'robot', type: 'wave', startAt: 4, duration: 2.2, emotion: 'happy' },
        { characterKey: 'star', type: 'spin', startAt: 5, duration: 2.4, emotion: 'excited' },
      ],
      props: [{ type: 'boat', x: -4.4, z: -1 }],
    },
    {
      environment: 'underwater',
      timeOfDay: 'day',
      weather: 'clear',
      narration: 'They dived deep under the waves, where a shy crab called Pinch guarded a glowing treasure.',
      durationSec: 9,
      camera: { type: 'closeup', targetKey: 'crab' },
      actions: [
        { characterKey: 'crab', type: 'appear', to: { x: 2.2, z: 0.6 }, startAt: 0.4, duration: 1, emotion: 'scared' },
        { characterKey: 'robot', type: 'enter', to: { x: -2.4, z: 0.2 }, startAt: 0.4, duration: 3.2 },
        { characterKey: 'star', type: 'enter', to: { x: -0.4, z: 1.4 }, startAt: 1, duration: 3.2, emotion: 'happy' },
        { characterKey: 'crab', type: 'look_at', targetKey: 'star', startAt: 4.6, duration: 1.4, emotion: 'surprised' },
        { characterKey: 'crab', type: 'grow', startAt: 6.2, duration: 1.6, emotion: 'happy' },
      ],
      props: [
        { type: 'treasure_chest', x: 3.8, z: -1.8 },
        { type: 'shell', x: -3.6, z: 2.4, scale: 1.3 },
      ],
    },
    {
      environment: 'snowy_mountain',
      timeOfDay: 'night',
      weather: 'snow',
      narration: 'The treasure was a map to the tallest mountain, the closest place to the sky.',
      durationSec: 9,
      camera: { type: 'follow', targetKey: 'robot' },
      actions: [
        { characterKey: 'robot', type: 'enter', to: { x: -0.8, z: 0.4 }, startAt: 0.2, duration: 3.4 },
        { characterKey: 'star', type: 'enter', to: { x: 1.6, z: 1 }, startAt: 0.8, duration: 3.2, emotion: 'sleepy' },
        { characterKey: 'crab', type: 'enter', to: { x: 3.2, z: 0.2 }, startAt: 1.4, duration: 3 },
        { characterKey: 'robot', type: 'run_to', to: { x: 0.8, z: -0.8 }, startAt: 5, duration: 2, emotion: 'excited' },
        { characterKey: 'robot', type: 'jump', startAt: 7.1, duration: 1.7, emotion: 'excited' },
      ],
      props: [{ type: 'snowman', x: -3.8, z: -1.4 }],
    },
    {
      environment: 'space',
      timeOfDay: 'night',
      weather: 'stars',
      narration: 'With one giant leap Twinkle flew home, and now she winks at her friends every single night.',
      durationSec: 10,
      camera: { type: 'orbit' },
      actions: [
        { characterKey: 'star', type: 'appear', to: { x: 0, z: 0.4 }, startAt: 0.5, duration: 1, emotion: 'happy' },
        { characterKey: 'robot', type: 'enter', to: { x: -2.6, z: 0.8 }, startAt: 0.6, duration: 2.8, emotion: 'happy' },
        { characterKey: 'crab', type: 'enter', to: { x: 2.6, z: 0.8 }, startAt: 1, duration: 2.8, emotion: 'happy' },
        { characterKey: 'star', type: 'celebrate', startAt: 3.8, duration: 5.8, emotion: 'excited' },
        { characterKey: 'robot', type: 'celebrate', startAt: 4.2, duration: 5.4, emotion: 'excited' },
        { characterKey: 'crab', type: 'dance', startAt: 4.4, duration: 5.2, emotion: 'excited' },
      ],
      props: [
        { type: 'rocket', x: -4.2, z: -2 },
        { type: 'star', x: 3.8, z: -2.2 },
      ],
    },
  ],
}

export const MOCK_STORIES: StoryView[] = [
  view('mock-robot', 'Robot Bip pronašao je izgubljenog psića i odveo ga kući kroz šumu i špilju.', robotStory),
  // "crab" has no model: the player must draw the stand-in blob for it.
  view('mock-star', 'A little star fell into the sea and her new friends helped her fly home.', seaStory, ['crab']),
]

export function findMockStory(slug: string): StoryView | undefined {
  return MOCK_STORIES.find((s) => s.slug === slug)
}

/** A one-place story for looking at an environment: two characters who walk in and play. */
export function environmentStory(environment: EnvironmentId, timeOfDay: TimeOfDay, weather: Weather): StoryView {
  const scene = (narration: string, camera: PlanScene['camera'], actions: PlanScene['actions']): PlanScene => ({
    environment,
    timeOfDay,
    weather,
    narration,
    durationSec: 8,
    camera,
    actions,
    props: [
      { type: 'gift', x: 3.6, z: 1.6 },
      { type: 'balloon', x: -4, z: -1.6 },
    ],
  })
  const plan: StoryPlan = {
    title: environment.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase()),
    language: 'en',
    mood: 'cozy',
    palette: ['#ff8a5b', '#5bb8ff', '#ffd166'],
    source: 'offline',
    characters: [character('robot', 'Robot', 'biped', 1), character('pup', 'Pup', 'quadruped', 0.7), character('blob', 'Blob', 'creature', 0.8)],
    scenes: [
      scene(`Welcome to the ${environment.replace('_', ' ')}. Three friends came here to play.`, { type: 'wide' }, [
        { characterKey: 'robot', type: 'enter', to: { x: -2.2, z: 0.4 }, startAt: 0.2, duration: 3, emotion: 'happy' },
        { characterKey: 'pup', type: 'enter', to: { x: 0.4, z: 1.2 }, startAt: 0.6, duration: 3 },
        { characterKey: 'blob', type: 'enter', to: { x: 2.6, z: 0.2 }, startAt: 1, duration: 3, emotion: 'excited' },
        { characterKey: 'robot', type: 'wave', startAt: 4, duration: 3, emotion: 'happy' },
        { characterKey: 'blob', type: 'jump', startAt: 4.5, duration: 2.6, emotion: 'excited' },
      ]),
      scene('They danced until the sky changed colour.', { type: 'orbit' }, [
        { characterKey: 'robot', type: 'dance', startAt: 0.5, duration: 7, emotion: 'excited' },
        { characterKey: 'pup', type: 'run_to', to: { x: -0.8, z: 2 }, startAt: 1, duration: 2.4, emotion: 'happy' },
        { characterKey: 'blob', type: 'spin', startAt: 2, duration: 3, emotion: 'happy' },
      ]),
    ],
  }
  return view(`mock-env-${environment}`, plan.scenes[0].narration, plan, ['blob'])
}
