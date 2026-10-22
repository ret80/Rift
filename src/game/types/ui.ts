/**
 * UI-типы — данные, передаваемые из игрового движка в React-UI.
 * Единый источник правды — дубли в game.ts, CountdownSystem.ts, useHudUpdater.ts удалены.
 */

import type { LoadoutSlotData } from "../loadout/LoadoutTypes";

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
  minerals: number;
  parts: number;
  /** Weapon + bonus slots rendered in the HUD loadout row. */
  loadout: LoadoutSlotData[];
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

/* ============================== Popups / Stats ============================== */

export interface PopupData {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface StatsData {
  score: number;
  best: number;
  isBest: boolean;
  wave: number;
  kills: number;
  time: number;
}
