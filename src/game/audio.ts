export { AudioEngine } from './audio/AudioEngine';
export type { Volumes } from './audio/AudioEngine';
export { SfxSynth } from './audio/SfxSynth';
export { AmbientMusic, SCENES, BASS_SEMI, ARP_SCALE, MENU_TRACKS } from './audio/AmbientMusic';
export type { AmbientScene, MenuTrackDef } from './audio/AmbientMusic';
export { CombatMusic, COMBAT_TRACKS } from './audio/CombatMusic';
export type { CombatTrackDef } from './audio/CombatMusic';
export {
  MENU_TRACK_IDS,
  COMBAT_TRACK_IDS,
  ALL_TRACK_IDS,
  TRACK_NAMES,
  DEFAULT_MENU_TRACK,
  DEFAULT_COMBAT_TRACK,
  isMenuTrackId,
  isCombatTrackId,
  isTrackId,
  normalizeMenuTrack,
  normalizeCombatTrack,
} from './audio/tracks';
export type { MenuTrackId, CombatTrackId, TrackId } from './audio/tracks';
