/**
 * DroneSystem — персистентная система дронов игрока.
 *
 * Хранит ангар (купленный запас дронов и их прокачку) и отдаёт
 * боевые характеристики флота (DroneFleetSpec) модулю оружия.
 *
 * Каждая единица дрона занимает один слот корабля; число слотов
 * задаётся апгрейдом «дроны» (см. src/game/upgrades.ts). Покупка
 * новой единицы возможна только при свободном слоте.
 *
 * Построена по образцу UpgradeSystem (src/game/systems/UpgradeSystem.ts).
 */

import type { PersistencePort } from "../core/PersistencePort";
import { STORAGE_KEYS } from "../core/storageKeys";
import {
  BASE_DRONE_MODEL,
  DRONE_CATALOG,
  DRONE_STAT_MAX_LEVEL,
  buildDroneCombatSpec,
  type DroneCombatSpec,
  type DroneId,
  type DroneLoadout,
  type DroneLoadoutEntry,
  type DroneStatKey,
} from "./Drone";
import type { DroneFleetSpec } from "./Drone";

const LS_KEY = STORAGE_KEYS.droneLoadout;

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

/** Миграция сохранённой записи ангара (старый формат — owned/selected). */
function migrateEntry(raw: unknown): DroneLoadoutEntry {
  const fresh = emptyEntry();
  if (!raw || typeof raw !== "object") return fresh;
  const entry = raw as Partial<DroneLoadoutEntry> & { owned?: unknown; model?: { reload?: unknown; damage?: unknown } };
  // Старое сохранение: owned=true → одна единица.
  const count = typeof entry.count === "number" && Number.isFinite(entry.count)
    ? Math.max(0, Math.floor(entry.count))
    : entry.owned === true ? 1 : 0;
  fresh.count = count;
  const model = entry.model;
  if (model && typeof model === "object") {
    for (const key of ["reload", "damage"] as const) {
      const value = model[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        fresh.model[key] = Math.max(0, Math.floor(value));
      }
    }
  }
  return fresh;
}

/** Прочитать ангар из хранилища (с миграцией полей). */
export function loadDroneLoadout(storage: PersistencePort): DroneLoadout {
  const loadout = defaultDroneLoadout();
  try {
    const raw = storage.get(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<DroneLoadout> & { selected?: unknown; v?: unknown };
      if (parsed && typeof parsed === "object") {
        if (parsed.entries && typeof parsed.entries === "object") {
          for (const id of Object.keys(parsed.entries) as DroneId[]) {
            if (id in loadout.entries) {
              loadout.entries[id] = migrateEntry(parsed.entries[id]);
            }
          }
        }
        // Старые версии выдавали одного разведчика бесплатно. Если
        // сохранение записано старым форматом и у игрока ровно одна
        // единица — это стартовая выдача, убираем её.
        if (parsed.v !== 2 && loadout.entries.scout.count === 1) {
          loadout.entries.scout.count = 0;
        }
      }
    }
  } catch { /* ignore */ }
  return loadout;
}

/** Сохранить ангар в хранилище. */
export function saveDroneLoadout(loadout: DroneLoadout, storage: PersistencePort): void {
  try {
    storage.set(LS_KEY, JSON.stringify({ v: 2, ...loadout }));
  } catch { /* ignore */ }
}

/** Сбросить ангар: все дроны не куплены. */
export function resetDroneLoadout(storage: PersistencePort): DroneLoadout {
  const fresh = defaultDroneLoadout();
  storage.remove(LS_KEY);
  return fresh;
}

export class DroneSystem {
  private _loadout: DroneLoadout = defaultDroneLoadout();
  private _storage: PersistencePort | null = null;

  /** Персистентный ангар: запас дронов и их модели. */
  get loadout(): DroneLoadout {
    return this._loadout;
  }

  static create(storage: PersistencePort): DroneSystem {
    const sys = new DroneSystem();
    sys._storage = storage;
    sys._loadout = loadDroneLoadout(storage);
    return sys;
  }

  private constructor() {}

  /** Перечитать ангар из хранилища. */
  refresh(): void {
    if (this._storage) {
      this._loadout = loadDroneLoadout(this._storage);
    }
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
    this.save();
    return true;
  }

  /** Прокачать линию дрона (проверка/списание деталей — у вызывающего). */
  upgradeStat(id: DroneId, stat: DroneStatKey): boolean {
    const entry = this._loadout.entries[id];
    if (!entry || entry.count <= 0) return false;
    const level = entry.model[stat];
    if (level >= DRONE_STAT_MAX_LEVEL) return false;
    entry.model[stat] = level + 1;
    this.save();
    return true;
  }

  /** Сохранить ангар в хранилище. */
  save(): void {
    if (this._storage) {
      saveDroneLoadout(this._loadout, this._storage);
    }
  }
}