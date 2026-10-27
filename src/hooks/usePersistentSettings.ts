import type { PickupKind } from "../game/balance";
import { ALL_PICKUP_KINDS } from "../game/balance/drops";
import { EnemyKind } from "../game/balance/enemies";
import type { MenuTrackId, CombatTrackId } from "../game/audio/tracks";
import {
  DEFAULT_MENU_TRACK,
  DEFAULT_COMBAT_TRACK,
  normalizeMenuTrack,
  normalizeCombatTrack,
} from "../game/audio/tracks";
import { usePersistedState } from "./usePersistedState";

/** Персистентные настройки отладки/звука/врагов-пикапов. */
export interface PersistentSettings {
  vols: { master: number; sfx: number; music: number };
  setVols: (v: { master: number; sfx: number; music: number }) => void;
  menuTrack: MenuTrackId;
  setMenuTrack: (v: MenuTrackId) => void;
  combatTrack: CombatTrackId;
  setCombatTrack: (v: CombatTrackId) => void;
  debugFps: boolean;
  setDebugFps: (v: boolean) => void;
  debugGod: boolean;
  setDebugGod: (v: boolean) => void;
  debugWave: number;
  setDebugWave: (n: number) => void;
  debugDetails: boolean;
  setDebugDetails: (v: boolean) => void;
  enabledEnemies: EnemyKind[];
  setEnabledEnemies: React.Dispatch<React.SetStateAction<EnemyKind[]>>;
  enabledPickups: PickupKind[];
  setEnabledPickups: React.Dispatch<React.SetStateAction<PickupKind[]>>;
}

/** Хук: все персистентные настройки в одном контракте. */
export function usePersistentSettings(): PersistentSettings {
  const [vols, setVols] = usePersistedState(
    "rift9_volumes",
    { master: 0.8, sfx: 0.8, music: 0.55 }
  );
  // Выбранные треки (меню/бой). Значения из localStorage могут быть битыми —
  // нормализуем через каталог.
  const [menuTrackRaw, setMenuTrackRaw] = usePersistedState<string>(
    "rift9_menu_track",
    DEFAULT_MENU_TRACK
  );
  const [combatTrackRaw, setCombatTrackRaw] = usePersistedState<string>(
    "rift9_combat_track",
    DEFAULT_COMBAT_TRACK
  );
  const menuTrack = normalizeMenuTrack(menuTrackRaw);
  const combatTrack = normalizeCombatTrack(combatTrackRaw);
  const setMenuTrack = (v: MenuTrackId) => setMenuTrackRaw(v);
  const setCombatTrack = (v: CombatTrackId) => setCombatTrackRaw(v);

  const [debugFps, setDebugFps] = usePersistedState("rift9_debug_fps", false);
  const [debugGod, setDebugGod] = usePersistedState("rift9_debug_god", false);
  const [debugWave, setDebugWave] = usePersistedState("rift9_debug_wave", 1);
  const [debugDetails, setDebugDetails] = usePersistedState("rift9_debug_details", false);
  const [enabledEnemies, setEnabledEnemies] = usePersistedState<EnemyKind[]>(
    "rift9_debug_enemies",
    [EnemyKind.Drone, EnemyKind.Hunter, EnemyKind.Fighter, EnemyKind.Cruiser, EnemyKind.Carrier]
  );
  const [enabledPickups, setEnabledPickups] = usePersistedState<PickupKind[]>(
    "rift9_debug_pickups",
    [...ALL_PICKUP_KINDS]
  );

  return {
    vols, setVols,
    menuTrack, setMenuTrack,
    combatTrack, setCombatTrack,
    debugFps, setDebugFps,
    debugGod, setDebugGod,
    debugWave, setDebugWave,
    debugDetails, setDebugDetails,
    enabledEnemies, setEnabledEnemies,
    enabledPickups, setEnabledPickups,
  };
}