/**
 * DroneSystem — ангар дронов забега.
 *
 * Дроны покупаются за детали в ангаре между волнами и живут только
 * внутри забега: при старте нового забега флот пуст. Постоянной
 * прокачки дронов нет — её роль выполняют таланты Эха Разлома
 * (слоты) и сами покупки внутри забега.
 */

import {
  BASE_DRONE_MODEL,
  DRONE_CATALOG,
  DRONE_STAT_MAX_LEVEL,
  buildDroneCombatSpec,
  type DroneCombatSpec,
  type DroneFleetSpec,
  type DroneId,
  type DroneLoadout,
  type DroneLoadoutEntry,
  type DroneStatKey,
} from "./Drone";

/** Пустая запись ангара (дрон не куплен, всё на нуле). */
function emptyEntry(): DroneLoadoutEntry {
  return { count: 0, model: { ...BASE_DRONE_MODEL } };
}

/** Ангар по умолчанию: всё пусто, дроны покупаются за детали. */
export function defaultDroneLoadout(): DroneLoadout {
  const entries = {} as Record<DroneId, DroneLoadoutEntry>;
  for (const spec of DRONE_CATALOG) {
    entries[spec.id] = emptyEntry();
  }
  return { entries };
}

export class DroneSystem {
  private _loadout: DroneLoadout = defaultDroneLoadout();

  /** Ангар забега: купленные дроны и их модели. */
  get loadout(): DroneLoadout {
    return this._loadout;
  }

  /** Вернуть ангар в состояние начала забега. */
  resetRun(): void {
    this._loadout = defaultDroneLoadout();
  }

  /** Задать стартовый ангар (симуляция/реплей). */
  setLoadout(loadout: DroneLoadout): void {
    this._loadout = loadout;
  }

  /** Сколько единиц дрона куплено. */
  getCount(id: DroneId): number {
    return this._loadout.entries[id]?.count ?? 0;
  }

  /** Всего купленных единиц (занятые слоты). */
  getTotalCount(): number {
    let total = 0;
    for (const spec of DRONE_CATALOG) {
      total += this.getCount(spec.id);
    }
    return total;
  }

  /** Уровень линии дрона (модель общая на вид). */
  getStatLevel(id: DroneId, stat: DroneStatKey): number {
    return this._loadout.entries[id]?.model[stat] ?? 0;
  }

  /**
   * Снимок флота для боя: каждая купленная единица со своими
   * характеристиками. Модель вида общая, поэтому характеристики
   * считаются один раз на вид.
   */
  getFleetSpec(): DroneFleetSpec {
    const counts = {} as Record<DroneId, number>;
    const specs = {} as Record<DroneId, DroneCombatSpec>;
    let total = 0;
    for (const spec of DRONE_CATALOG) {
      const entry = this._loadout.entries[spec.id];
      const count = entry?.count ?? 0;
      counts[spec.id] = count;
      total += count;
      if (count > 0) {
        specs[spec.id] = buildDroneCombatSpec(spec.id, entry.model);
      }
    }
    return { counts, specs, total };
  }

  /** Купить единицу дрона. Проверка слота/списание деталей — у вызывающего. */
  buy(id: DroneId): boolean {
    const entry = this._loadout.entries[id];
    if (!entry) return false;
    entry.count += 1;
    return true;
  }

  /** Прокачать линию дрона (проверка/списание деталей — у вызывающего). */
  upgradeStat(id: DroneId, stat: DroneStatKey): boolean {
    const entry = this._loadout.entries[id];
    if (!entry || entry.count <= 0) return false;
    const level = entry.model[stat];
    if (level >= DRONE_STAT_MAX_LEVEL) return false;
    entry.model[stat] = level + 1;
    return true;
  }
}
