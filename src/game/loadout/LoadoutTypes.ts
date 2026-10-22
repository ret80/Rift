/**
 * LoadoutTypes — описание слотов строки снаряжения HUD.
 *
 * Строка снаряжения собирается из двух независимых источников:
 *   • слоты оружия — приходят из WeaponManager;
 *   • слоты бонусов — приходят из BonusRegistry.
 *
 * Здесь описано общее оформление слота, чтобы оружие и бонусы
 * рисовались в строке одинаково и добавлялись одним способом.
 */

import type { TKey } from "../../i18n";

/** Иконки, доступные строке снаряжения. */
export type LoadoutIcon =
  /* оружие */
  | "weapon-cannon"
  | "weapon-missile"
  | "pickup-drone"
  | "weapon-weaver"
  | "weapon-laser"
  /* бонусы */
  | "pickup-rate"
  | "pickup-gun"
  | "bonus-dash"
  | "pickup-heal"
  | "pickup-mineral"
  /* способности */
  | "ability-quantum-swap";

/** Виды слотов строки снаряжения: оружие, бонусы и способности. */
export type LoadoutSlotKind =
  /* оружие */
  | "cannon"
  | "missile"
  | "drone"
  | "weaver"
  | "laser"
  /* временные бонусы */
  | "rate"
  | "guns"
  | "dash"
  /* мгновенные бонусы */
  | "heal"
  | "mineral"
  /* активные способности */
  | "quantum_swap";

/** Оформление слота: иконка, цвет, подпись и место в строке. */
export interface LoadoutSlotMeta {
  /** Иконка слота. */
  icon: LoadoutIcon;
  /** Цвет иконки и кольца. */
  color: string;
  /** Ключ локализации подписи (подсказка при наведении). */
  labelKey: TKey;
  /** Порядок слота в строке: чем меньше значение, тем левее. */
  order: number;
}

/** Данные слота для отрисовки в HUD. */
export interface LoadoutSlotData {
  /** Вид слота. */
  kind: LoadoutSlotKind;
  /** Оформление слота. */
  meta: LoadoutSlotMeta;
  /** Заполнение кольца, 0..1. */
  progress: number;
  /** Остаток таймера в секундах (0 — у слота нет таймера). */
  remaining: number;
}
