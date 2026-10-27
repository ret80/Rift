/**
 * Drone — контракт и каталог дронов игрока.
 *
 * Система дронов построена по образцу оружия (src/game/weapons) и
 * бонусов (src/game/loadout/bonuses):
 *   • каждый дрон — запись каталога со своими характеристиками;
 *   • дроны покупаются в ангаре за детали и прокачиваются персонально;
 *   • текущий дрон назначается игроком и определяет бой роя.
 */

import type { TKey } from "../../i18n";

/** Идентификаторы дронов. */
export type DroneId = "scout" | "striker" | "sentry";

/** Иконки дронов в UI. */
export type DroneIcon = "drone-scout" | "drone-striker" | "drone-sentry";

/** Линии прокачки дрона. */
export type DroneStatKey = "reload" | "damage";

/** Модель дрона в ангаре: база + уровни двух линий. */
export interface DroneModelUpgrades {
  /** Уровень ускорения перезарядки орудия. */
  reload: number;
  /** Уровень повышения силы пушки. */
  damage: number;
}

/** Запись ангара: сколько единиц дрона куплено и уровни его линий. */
export interface DroneLoadoutEntry {
  /**
   * Количество купленных единиц дрона. Каждая единица занимает один
   * слот корабля и участвует в бою.
   */
  count: number;
  /** Уровни линий прокачки дрона. */
  model: DroneModelUpgrades;
}

/** Персистентный ангар игрока: запас дронов и их прокачка. */
export interface DroneLoadout {
  /** Прогресс дронов в ангаре. */
  entries: Record<DroneId, DroneLoadoutEntry>;
}

/** Характеристики вида дрона. */
export interface DroneSpec {
  /** Идентификатор дрона. */
  id: DroneId;
  /** Ключ названия. */
  nameKey: TKey;
  /** Ключ описания. */
  descKey: TKey;
  /** Иконка в интерфейсе. */
  icon: DroneIcon;
  /** Цвет иконки. */
  color: string;
  /** Порядок в списке ангара. */
  order: number;
  /** Базовый урон снаряда дрона. */
  baseDamage: number;
  /** Базовый интервал между выстрелами, секунды. */
  reload: number;
  /** Скорость снаряда дрона. */
  bulletSpeed: number;
  /** Время жизни снаряда дрона, секунды. */
  bulletLife: number;
  /** Доля корпуса игрока, получаемая дроном. */
  hpRatio: number;
  /** Радиус дрона. */
  radius: number;
}

/* ======================== Каталог ======================== */

export const DRONE_CATALOG: readonly DroneSpec[] = [
  {
    id: "scout",
    nameKey: "upgrade.drone.scout",
    descKey: "upgrade.drone.scoutDesc",
    icon: "drone-scout",
    color: "#ff9de0",
    order: 0,
    baseDamage: 8,
    reload: 0.5,
    bulletSpeed: 500,
    bulletLife: 0.7,
    hpRatio: 0.25,
    radius: 10,
  },
  {
    id: "striker",
    nameKey: "upgrade.drone.striker",
    descKey: "upgrade.drone.strikerDesc",
    icon: "drone-striker",
    color: "#ff5c54",
    order: 1,
    baseDamage: 15,
    reload: 0.68,
    bulletSpeed: 540,
    bulletLife: 0.8,
    hpRatio: 0.3,
    radius: 11,
  },
  {
    id: "sentry",
    nameKey: "upgrade.drone.sentry",
    descKey: "upgrade.drone.sentryDesc",
    icon: "drone-sentry",
    color: "#7dff9e",
    order: 2,
    baseDamage: 6,
    reload: 0.38,
    bulletSpeed: 480,
    bulletLife: 0.65,
    hpRatio: 0.45,
    radius: 12,
  },
];

/** Шаблон «нулевой» модели дрона. */
export const BASE_DRONE_MODEL: DroneModelUpgrades = {
  reload: 0,
  damage: 0,
};

/** Максимальный уровень линии прокачки дрона. */
export const DRONE_STAT_MAX_LEVEL = 5;

/** Чем быстрее перезарядка за уровень. */
export const DRONE_RELOAD_PER_LEVEL = 0.06;

/** Множитель силы пушки за уровень. */
export const DRONE_DAMAGE_PER_LEVEL = 0.15;

/** Текущий множитель перезарядки орудия дрона (меньше — быстрее). */
export function droneReloadMult(model: DroneModelUpgrades): number {
  const level = Math.max(0, Math.min(DRONE_STAT_MAX_LEVEL, model.reload));
  return Math.max(0.2, 1 - level * DRONE_RELOAD_PER_LEVEL);
}

/** Текущий множитель силы пушки дрона. */
export function droneDamageMult(model: DroneModelUpgrades): number {
  const level = Math.max(0, Math.min(DRONE_STAT_MAX_LEVEL, model.damage));
  return 1 + level * DRONE_DAMAGE_PER_LEVEL;
}

/** Стоимость покупки дрона. Все дроны покупаются за детали. */
export function droneCost(id: DroneId): number {
  if (id === "scout") return 600;
  return id === "striker" ? 1200 : 2400;
}

/** Стоимость уровня линии дрона (идёт после текущего уровня). */
export function droneUpgradeCost(level: number): number {
  return 200 + 150 * Math.max(0, level);
}

/** Найти спецификацию дрона по идентификатору. */
export function getDroneSpec(id: DroneId): DroneSpec {
  return DRONE_CATALOG.find((d) => d.id === id) ?? DRONE_CATALOG[0];
}

/*
 * ======================== Боевая спецификация ========================
 *
 * Каждая единица флота несёт характеристики своего вида дрона и
 * персональную прокачку этой модели (ангар один на вид).
 */

/** Боевые характеристики единицы дрона в текущем бою. */
export interface DroneCombatSpec {
  /** Идентификатор вида дрона. */
  id: DroneId;
  /** Спецификация вида дрона. */
  spec: DroneSpec;
  /** Множитель перезарядки орудия (меньше — быстрее). */
  reloadMult: number;
  /** Множитель силы пушки. */
  damageMult: number;
  /** Итоговый интервал между выстрелами, секунды. */
  reloadTime: number;
  /** Итоговый урон снаряда. */
  damage: number;
  /** Скорость снаряда. */
  bulletSpeed: number;
  /** Время жизни снаряда, секунды. */
  bulletLife: number;
  /** Доля корпуса игрока, получаемая дроном. */
  hpRatio: number;
  /** Радиус дрона. */
  radius: number;
}

/** Собрать боевые характеристики единицы дрона из вида и модели. */
export function buildDroneCombatSpec(
  id: DroneId,
  model: DroneModelUpgrades
): DroneCombatSpec {
  const spec = getDroneSpec(id);
  const reloadMult = droneReloadMult(model);
  const damageMult = droneDamageMult(model);
  return {
    id: spec.id,
    spec,
    reloadMult,
    damageMult,
    reloadTime: spec.reload * reloadMult,
    damage: spec.baseDamage * damageMult,
    bulletSpeed: spec.bulletSpeed,
    bulletLife: spec.bulletLife,
    hpRatio: spec.hpRatio,
    radius: spec.radius,
  };
}

/**
 * Снимок всего флота: по одной боевой характеристике на каждую
 * купленную единицу (повторяющиеся виды — отдельные записи).
 */
export interface DroneFleetSpec {
  /** Вид дрона — сколько единиц каждого типа в рое. */
  counts: Record<DroneId, number>;
  /** Характеристики единицы дрона каждого вида (модель общая на вид). */
  specs: Record<DroneId, DroneCombatSpec>;
  /** Всего единиц флота. */
  total: number;
}