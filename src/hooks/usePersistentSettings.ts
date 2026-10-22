import type { PickupKind } from "../game/balance";
import { ALL_PICKUP_KINDS } from "../game/balance/drops";
import { EnemyKind } from "../game/balance/enemies";
import { usePersistedState } from "./usePersistedState";

/** Персистентные настройки отладки/звука/врагов-пикапов. */
export interface PersistentSettings {
  vols: { master: number; sfx: number; music: number };
  setVols: (v: { master: number; sfx: number; music: number }) => void;
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
    debugFps, setDebugFps,
    debugGod, setDebugGod,
    debugWave, setDebugWave,
    debugDetails, setDebugDetails,
    enabledEnemies, setEnabledEnemies,
    enabledPickups, setEnabledPickups,
  };
}