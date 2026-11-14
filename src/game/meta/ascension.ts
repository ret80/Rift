/**
 * Асценсия (GDD §12): игрок собирает уровень угрозы из модификаторов.
 *
 * Модель чистая и без побочных эффектов: выбор — это список id, TL — сумма
 * их стоимостей, параметры мира — `ascensionEffects`. Хранилище и мир живут
 * снаружи (`AscensionSystem`), поэтому формулу можно проверить в симуляции.
 */

import type { AscensionParams } from "../balance/params/GameParams";

/** Потолок уровня угрозы: дальше набор модификаторов не собрать. */
export const MAX_THREAT_LEVEL = 20;

/** С какой зачищенной волны открывается Асценсия (победа над боссом 10-й). */
export const THREAT_UNLOCK_BEST_WAVE = 10;

/** Идентификаторы модификаторов. */
export type AscensionModifierId =
  | "angry"
  | "fast"
  | "precise"
  | "cramped"
  | "stormy"
  | "collapse"
  | "fragile"
  | "elites"
  | "affixes"
  | "bosses"
  | "pincer"
  | "blind_pickup"
  | "hardcore"
  | "mirror"
  | "endless";

/** Описание модификатора: стоимость в TL и ключи текста. */
export interface AscensionModifierDef {
  id: AscensionModifierId;
  /** Сколько уровней угрозы стоит модификатор. */
  tl: number;
  nameKey: string;
  descKey: string;
}

/**
 * Каталог модификаторов в порядке показа.
 *
 * Стоимости взяты из GDD §12.2: сумма всех модификаторов ровно равна потолку
 * (20), поэтому «включить всё» — это и есть максимальная угроза.
 */
export const ASCENSION_MODIFIERS: readonly AscensionModifierDef[] = [
  { id: "angry", tl: 1, nameKey: "ascension.mod.angry.name", descKey: "ascension.mod.angry.desc" },
  { id: "fast", tl: 1, nameKey: "ascension.mod.fast.name", descKey: "ascension.mod.fast.desc" },
  { id: "precise", tl: 1, nameKey: "ascension.mod.precise.name", descKey: "ascension.mod.precise.desc" },
  { id: "cramped", tl: 1, nameKey: "ascension.mod.cramped.name", descKey: "ascension.mod.cramped.desc" },
  { id: "stormy", tl: 1, nameKey: "ascension.mod.stormy.name", descKey: "ascension.mod.stormy.desc" },
  { id: "collapse", tl: 1, nameKey: "ascension.mod.collapse.name", descKey: "ascension.mod.collapse.desc" },
  { id: "fragile", tl: 1, nameKey: "ascension.mod.fragile.name", descKey: "ascension.mod.fragile.desc" },
  { id: "elites", tl: 1, nameKey: "ascension.mod.elites.name", descKey: "ascension.mod.elites.desc" },
  { id: "affixes", tl: 1, nameKey: "ascension.mod.affixes.name", descKey: "ascension.mod.affixes.desc" },
  { id: "bosses", tl: 2, nameKey: "ascension.mod.bosses.name", descKey: "ascension.mod.bosses.desc" },
  { id: "pincer", tl: 1, nameKey: "ascension.mod.pincer.name", descKey: "ascension.mod.pincer.desc" },
  { id: "blind_pickup", tl: 1, nameKey: "ascension.mod.blind_pickup.name", descKey: "ascension.mod.blind_pickup.desc" },
  { id: "hardcore", tl: 3, nameKey: "ascension.mod.hardcore.name", descKey: "ascension.mod.hardcore.desc" },
  { id: "mirror", tl: 2, nameKey: "ascension.mod.mirror.name", descKey: "ascension.mod.mirror.desc" },
  { id: "endless", tl: 2, nameKey: "ascension.mod.endless.name", descKey: "ascension.mod.endless.desc" },
];

/** Модификаторы по id для быстрых проверок. */
const MODIFIER_BY_ID = new Map<AscensionModifierId, AscensionModifierDef>(
  ASCENSION_MODIFIERS.map((def) => [def.id, def]),
);

/** Выбор модификаторов на забег. */
export type AscensionSelection = readonly AscensionModifierId[];

/** Известен ли модификатор. */
export function isAscensionModifierId(value: unknown): value is AscensionModifierId {
  return typeof value === "string" && MODIFIER_BY_ID.has(value as AscensionModifierId);
}

/** Нормализовать внешний список: убрать неизвестное и повторы, сохранить порядок. */
export function normalizeSelection(ids: readonly unknown[]): AscensionModifierId[] {
  const seen = new Set<AscensionModifierId>();
  const result: AscensionModifierId[] = [];
  for (const id of ids) {
    if (!isAscensionModifierId(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

/** Сырая стоимость набора без ограничения потолком. */
export function selectionCost(selection: AscensionSelection): number {
  let sum = 0;
  for (const id of selection) sum += MODIFIER_BY_ID.get(id)?.tl ?? 0;
  return sum;
}

/** Уровень угрозы набора: сумма стоимостей, не выше потолка. */
export function threatLevelOf(selection: AscensionSelection): number {
  return Math.min(MAX_THREAT_LEVEL, selectionCost(selection));
}

/** Можно ли добавить модификатор, не выходя за потолок. */
export function canAddModifier(selection: AscensionSelection, id: AscensionModifierId): boolean {
  if (selection.includes(id)) return true;
  const def = MODIFIER_BY_ID.get(id);
  if (!def) return false;
  return selectionCost(selection) + def.tl <= MAX_THREAT_LEVEL;
}

/** Включён ли модификатор. */
export function hasModifier(selection: AscensionSelection, id: AscensionModifierId): boolean {
  return selection.includes(id);
}

/**
 * Эффекты набора для мира и наград.
 *
 * Награды по диапазонам GDD §12.3:
 *   • TL 1–5 — +10 % кредитов за уровень;
 *   • TL 6–10 — +5 % деталей за уровень выше пятого;
 *   • хардкор — ×3 кредитов поверх.
 */
export function ascensionEffects(selection: AscensionSelection): AscensionParams {
  const has = (id: AscensionModifierId) => selection.includes(id);
  const tl = threatLevelOf(selection);
  const hardcore = has("hardcore");
  return {
    enemyHpMult: has("angry") ? 1.1 : 1,
    enemyDamageMult: has("angry") ? 1.1 : 1,
    enemySpeedMult: has("fast") ? 1.15 : 1,
    enemyAccuracyMult: has("precise") ? 1.1 : 1,
    zoneRadiusMult: has("cramped") ? 0.9 : 1,
    collapseDelayMult: has("collapse") ? 30 / 45 : 1,
    stormPeriodMult: has("stormy") ? 5 / 7 : 1,
    healMult: hardcore ? 0 : has("fragile") ? 0.5 : 1,
    eliteChanceBonus: has("elites") ? 0.08 : 0,
    extraAffixes: has("affixes"),
    bossInterval: has("bosses") ? 5 : 10,
    pincer: has("pincer"),
    pickupMagnetMult: has("blind_pickup") ? 0.5 : 1,
    mirrorWorld: has("mirror"),
    endlessScaling: has("endless"),
    creditsMult: (1 + 0.1 * Math.min(tl, 5)) * (hardcore ? 3 : 1),
    partsMult: tl > 5 ? 1 + 0.05 * Math.min(tl - 5, 5) : 1,
  };
}

/** Открыта ли Асценсия по прогрессу: нужна победа на 10-й волне. */
export function isAscensionUnlocked(bestWave: number): boolean {
  return bestWave >= THREAT_UNLOCK_BEST_WAVE;
}
