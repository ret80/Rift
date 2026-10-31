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
import type { PhysicsEngineId } from "../game/physics";
import { normalizePhysicsEngine } from "../game/physics";
import { STORAGE_KEYS } from "../game/core/storageKeys";
import { usePersistedState } from "./usePersistedState";

/** Персистентные настройки отладки/звука/врагов-пикапов. */
export interface PersistentSettings {
  vols: { master: number; sfx: number; music: number };
  setVols: (v: { master: number; sfx: number; music: number }) => void;
  menuTrack: MenuTrackId;
  setMenuTrack: (v: MenuTrackId) => void;
  combatTrack: CombatTrackId;
  setCombatTrack: (v: CombatTrackId) => void;
  physicsEngine: PhysicsEngineId;
  setPhysicsEngine: (v: PhysicsEngineId) => void;
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
    STORAGE_KEYS.volumes,
    { master: 0.8, sfx: 0.8, music: 0.55 }
  );
  // Выбранные треки (меню/бой). Значения из localStorage могут быть битыми —
  // нормализуем через каталог.
  const [menuTrackRaw, setMenuTrackRaw] = usePersistedState<string>(
    STORAGE_KEYS.menuTrack,
    DEFAULT_MENU_TRACK
  );
  const [combatTrackRaw, setCombatTrackRaw] = usePersistedState<string>(
    STORAGE_KEYS.combatTrack,
    DEFAULT_COMBAT_TRACK
  );
  const menuTrack = normalizeMenuTrack(menuTrackRaw);
  const combatTrack = normalizeCombatTrack(combatTrackRaw);
  const setMenuTrack = (v: MenuTrackId) => setMenuTrackRaw(v);
  const setCombatTrack = (v: CombatTrackId) => setCombatTrackRaw(v);

  // Выбранный физический движок (значение из localStorage может быть битым —
  // нормализуем через реестр).
  const [physicsEngineRaw, setPhysicsEngineRaw] = usePersistedState<string>(
    STORAGE_KEYS.physicsEngine,
    "planck"
  );
  const physicsEngine = normalizePhysicsEngine(physicsEngineRaw);
  const setPhysicsEngine = (v: PhysicsEngineId) => setPhysicsEngineRaw(v);

  const [debugFps, setDebugFps] = usePersistedState(STORAGE_KEYS.debugFps, false);
  const [debugGod, setDebugGod] = usePersistedState(STORAGE_KEYS.debugGod, false);
  const [debugWave, setDebugWave] = usePersistedState(STORAGE_KEYS.debugWave, 1);
  const [debugDetails, setDebugDetails] = usePersistedState(STORAGE_KEYS.debugDetails, false);
  const [enabledEnemies, setEnabledEnemies] = usePersistedState<EnemyKind[]>(
    STORAGE_KEYS.debugEnemies,
    [EnemyKind.Drone, EnemyKind.Hunter, EnemyKind.Fighter, EnemyKind.Cruiser, EnemyKind.Carrier]
  );
  const [enabledPickups, setEnabledPickups] = usePersistedState<PickupKind[]>(
    STORAGE_KEYS.debugPickups,
    [...ALL_PICKUP_KINDS]
  );

  return {
    vols, setVols,
    menuTrack, setMenuTrack,
    combatTrack, setCombatTrack,
    physicsEngine, setPhysicsEngine,
    debugFps, setDebugFps,
    debugGod, setDebugGod,
    debugWave, setDebugWave,
    debugDetails, setDebugDetails,
    enabledEnemies, setEnabledEnemies,
    enabledPickups, setEnabledPickups,
  };
}