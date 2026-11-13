/**
 * UI-типы — данные, передаваемые из игрового движка в React-UI.
 * Единый источник правды — дубли в game.ts и CountdownSystem.ts удалены.
 */

import type { LoadoutSlotData } from "../loadout/LoadoutTypes";
import type { SessionRecorderStatus } from "../core/SessionRecord";
import type { DroneOrder } from "../ecs/components/AllyDroneComponent";
import type { ShieldRenderState } from "./render";

/* ============================== HUD ============================== */

export interface HudData {
  wave: number;
  score: number;
  best: number;
  hp: number;
  maxHp: number;
  killed: number;
  total: number;
  enemies: number;
  comboMult: number;
  time: number;
  guns: number;
  rateMult: number;
  rateT: number;
  drones: number;
  parts: number;
  /** Бесконечные детали: HUD показывает ∞ вместо числа. */
  partsInfinite: boolean;
  /** Снимок энергетического щита игрока. */
  shield: ShieldRenderState;
  /** Weapon + bonus slots rendered in the HUD loadout row. */
  loadout: LoadoutSlotData[];
  /** Состояние записи: индикатор виден только в dev/`?debug`. */
  recording: SessionRecorderStatus;
  /** Текущий приказ рою дронов (тактический режим). */
  droneOrder: DroneOrder;
  /** Накопленная энергия форсажа (0..1). */
  boostEnergy: number;
  /** Активен ли форсаж сейчас. */
  boostActive: boolean;
  /** Живые якоря-разломы (0 — цель волны отсутствует). */
  anchors: number;
  /** Игрок за краем арены и получает урон зоны. */
  outsideZone: boolean;
  /** Выбранный уровень угрозы (0 — обычная сложность). */
  threatLevel: number;
}

/* ============================== Banners / Toasts / Countdown ============================== */

export interface BannerData {
  title: string;
  sub?: string;
  color?: string;
}

export interface ToastData {
  text: string;
  color?: string;
}

export interface CountData {
  id: number;
  label: string;
  value: string;
}

/* ============================== Stats ============================== */

export interface StatsData {
  score: number;
  best: number;
  isBest: boolean;
  wave: number;
  kills: number;
  time: number;
  credits: number;
  creditsEarned: number;
}
