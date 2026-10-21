/**
 * BonusRegistry — реестр временных бонусов игрока.
 *
 * Бонус — это усиление, которое живёт ограниченное время (темп огня,
 * дополнительные стволы, рывок) либо срабатывает мгновенно (ремонт, минерал).
 *
 * Реестр хранит оформление и длительность каждого бонуса, чтобы:
 *   • HUD не держал собственные копии иконок и цветов;
 *   • добавление нового бонуса сводилось к одной записи здесь.
 */

import type { PickupKind } from "../balance";
import {
  DASH_BONUS_TIME,
  GUN_BONUS_TIME,
  RATE_BOOST_TIME,
} from "../balance/player";
import type { LoadoutSlotMeta } from "./LoadoutTypes";

/** Как долго мгновенный бонус мигает в строке снаряжения, секунды. */
export const INSTANT_BONUS_FLASH = 1.8;

/** Виды бонусов, отображаемых в строке снаряжения. */
export type BonusKind =
  /* бонусы с таймером */
  | "rate"
  | "guns"
  | "dash"
  /* мгновенные бонусы */
  | "heal"
  | "mineral";

/** Описание бонуса: оформление слота и длительность. */
export interface BonusMeta extends LoadoutSlotMeta {
  /** Вид бонуса. */
  kind: BonusKind;
  /** Длительность бонуса в секундах (0 — мгновенный бонус). */
  duration: number;
}

/** Реестр всех бонусов игрока. */
export const BONUS_REGISTRY: Record<BonusKind, BonusMeta> = {
  rate: {
    kind: "rate",
    icon: "pickup-rate",
    color: "#ff8c42",
    labelKey: "hud.loadout.rate",
    order: 3,
    duration: RATE_BOOST_TIME,
  },
  guns: {
    kind: "guns",
    icon: "pickup-gun",
    color: "#5ef2ff",
    labelKey: "hud.loadout.guns",
    order: 4,
    duration: GUN_BONUS_TIME,
  },
  dash: {
    kind: "dash",
    icon: "bonus-dash",
    color: "#ffd23e",
    labelKey: "hud.loadout.dash",
    order: 5,
    duration: DASH_BONUS_TIME,
  },
  heal: {
    kind: "heal",
    icon: "pickup-heal",
    color: "#7dffb8",
    labelKey: "hud.loadout.heal",
    order: 6,
    duration: 0,
  },
  mineral: {
    kind: "mineral",
    icon: "pickup-mineral",
    color: "#7dffb8",
    labelKey: "hud.loadout.mineral",
    order: 7,
    duration: 0,
  },
};

/**
 * Какой бонус выдаёт поднятый пикап.
 * Пикапы оружия (ракетомёт, дрон) бонусом не являются — они возвращают null.
 */
export function bonusKindForPickup(kind: PickupKind): BonusKind | null {
  switch (kind) {
    case "heal25":
    case "heal50":
    case "heal100":
    case "hp":
      return "heal";
    case "rate20":
    case "rate40":
    case "rate60":
    case "rate":
      return "rate";
    case "gun":
      return "guns";
    case "dash":
      return "dash";
    case "mineral":
      return "mineral";
    default:
      return null;
  }
}
