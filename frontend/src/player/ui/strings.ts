import type { Lang } from '../../api/types'

const hr = {
  storyLabel: 'Priča',
  play: 'Pokreni priču',
  theEnd: 'Kraj',
  replay: 'Pogledaj ponovno',
  share: 'Podijeli',
  copyLink: 'Kopiraj poveznicu',
  copied: 'Kopirano!',
  savePicture: 'Spremi sliku',
  saved: 'Spremljeno!',
  pausedHint: 'Pauza · povuci za razgledavanje',
  pause: 'Pauza',
  resume: 'Nastavi',
  previous: 'Prethodna scena',
  next: 'Sljedeća scena',
  restart: 'Ispočetka',
  mute: 'Isključi pripovjedača',
  unmute: 'Uključi pripovjedača',
  fullscreen: 'Cijeli zaslon',
  scene: 'Scena',
  shareText: 'Pogledaj moju 3D priču!',
}

export type PlayerStrings = typeof hr

const en: PlayerStrings = {
  storyLabel: 'A story',
  play: 'Play the story',
  theEnd: 'The End',
  replay: 'Watch again',
  share: 'Share',
  copyLink: 'Copy link',
  copied: 'Copied!',
  savePicture: 'Save picture',
  saved: 'Saved!',
  pausedHint: 'Paused · drag to look around',
  pause: 'Pause',
  resume: 'Play',
  previous: 'Previous scene',
  next: 'Next scene',
  restart: 'Start over',
  mute: 'Mute the narrator',
  unmute: 'Unmute the narrator',
  fullscreen: 'Full screen',
  scene: 'Scene',
  shareText: 'Watch my 3D story!',
}

export const PLAYER_STRINGS: Record<Lang, PlayerStrings> = { hr, en }
