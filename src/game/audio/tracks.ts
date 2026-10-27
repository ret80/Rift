/**
 * Каталог музыкальных треков игры.
 *
 * Музыка генерируется процедурно (WebAudio), каталог описывает id треков,
 * их названия для локализации и порядок в настройках. ID используются
 * как персистентный выбор пользователя (localStorage).
 */

import type { TKey } from "../../i18n";

export type MenuTrackId = "nebula" | "solar" | "aurora";
export type CombatTrackId = "rift" | "vanguard" | "onslaught" | "overdrive";
export type TrackId = MenuTrackId | CombatTrackId;

export const MENU_TRACK_IDS: MenuTrackId[] = ["nebula", "solar", "aurora"];
export const COMBAT_TRACK_IDS: CombatTrackId[] = ["rift", "vanguard", "onslaught", "overdrive"];
export const ALL_TRACK_IDS: TrackId[] = [...MENU_TRACK_IDS, ...COMBAT_TRACK_IDS];

/** Ключи i18n для названий треков. */
export const TRACK_NAMES: Record<TrackId, TKey> = {
  nebula: "music.track.nebula",
  solar: "music.track.solar",
  aurora: "music.track.aurora",
  rift: "music.track.rift",
  vanguard: "music.track.vanguard",
  onslaught: "music.track.onslaught",
  overdrive: "music.track.overdrive",
};

export const DEFAULT_MENU_TRACK: MenuTrackId = "nebula";
export const DEFAULT_COMBAT_TRACK: CombatTrackId = "rift";

export function isMenuTrackId(id: string): id is MenuTrackId {
  return (MENU_TRACK_IDS as string[]).includes(id);
}

export function isCombatTrackId(id: string): id is CombatTrackId {
  return (COMBAT_TRACK_IDS as string[]).includes(id);
}

export function isTrackId(id: string): id is TrackId {
  return isMenuTrackId(id) || isCombatTrackId(id);
}

/** Приводит произвольную строку (в т.ч. из localStorage) к валидному id. */
export function normalizeMenuTrack(id: string): MenuTrackId {
  return isMenuTrackId(id) ? id : DEFAULT_MENU_TRACK;
}

export function normalizeCombatTrack(id: string): CombatTrackId {
  return isCombatTrackId(id) ? id : DEFAULT_COMBAT_TRACK;
}