/**
 * Weapon — единый контракт всех видов оружия игрока.
 *
 * Любое оружие обязано:
 *   • сообщать о себе метаданные (иконка, цвет, подпись) для HUD;
 *   • уметь активироваться по подбору пикапа;
 *   • обновляться каждый кадр;
 *   • отдавать снимок слота для строки снаряжения.
 *
 * Оружие не знает о других системах: всё, что ему нужно, приходит
 * в контексте (WeaponContext) на каждый вызов.
 */

import type { LoadoutSlotMeta } from "../loadout/LoadoutTypes";
import type { PlayerBonuses } from "../loadout/bonuses/Bonus";
import type { AllyDrone, Bullet, Enemy } from "../types";

/** Идентификаторы видов оружия. */
export type WeaponId = "cannon" | "missile" | "drone";

/** Оформление слота оружия в строке снаряжения. */
export type WeaponMeta = LoadoutSlotMeta;

/** Снимок состояния игрока, доступный оружию. */
export interface PlayerSnapshot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
  maxHp: number;
}

/** Состояние наведения оружия. */
export interface AimState {
  /** Угол прицеливания (null — прицел не задан). */
  angle: number | null;
  /** Готовность стрелять. */
  firing: boolean;
}

/** Всё, что доступно оружию во время работы. */
export interface WeaponContext {
  /** Положение и состояние игрока. */
  readonly player: PlayerSnapshot;
  /** Текущие бонусы игрока. */
  readonly bonuses: PlayerBonuses;
  /** Наведение: угол и готовность стрелять. */
  readonly aim: AimState;
  /** Враги — цели для наведения. */
  readonly enemies: readonly Enemy[];
  /** Пул снарядов игрока. */
  readonly bullets: Bullet[];
  /** Пул дронов-компаньонов. */
  readonly drones: AllyDrone[];
  /** Колбэк выстрела — проигрывание звука. */
  onFired(id: WeaponId): void;
}

/** Снимок слота оружия для строки снаряжения. */
export interface WeaponSlotState {
  /** Вид оружия. */
  id: WeaponId;
  /** Оформление слота. */
  meta: WeaponMeta;
  /** Заполнение кольца, 0..1. */
  progress: number;
  /** Остаток таймера в секундах (0 — без таймера). */
  remaining: number;
}

/**
 * Персистентные модификаторы оружия, приходящие из апгрейдов.
 * Каждое оружие само решает, какие из них к нему относятся.
 */
export interface WeaponModifiers {
  /** Дополнительный урон снарядов оружия. */
  damage?: number;
  /** Число экземпляров оружия: стволы пушки, дроны-компаньоны. */
  count?: number;
}

/**
 * Персистентные апгрейды игрока, доступные оружию.
 * Структурно совместим с результатом applyUpgrades() из upgrades.ts.
 */
export interface WeaponUpgrades {
  /** Множитель темпа стрельбы от апгрейда «темп огня». */
  fireRateMult: number;
  /** Дополнительный урон снарядов от апгрейда «урон». */
  damageBonus: number;
  /** Число постоянных стволов пушки. */
  guns: number;
  /** Число постоянных дронов-компаньонов. */
  drones: number;
}

/** Апгрейд, задающий число экземпляров оружия. */
export type WeaponCountUpgrade = "guns" | "drones";

/** Единый контракт всех видов оружия. */
export interface Weapon {
  /** Идентификатор вида оружия. */
  readonly id: WeaponId;
  /** Оформление слота оружия в строке снаряжения. */
  readonly meta: WeaponMeta;
  /** Апгрейд, задающий число экземпляров (null — оружие не масштабируется). */
  readonly countUpgrade: WeaponCountUpgrade | null;
  /** Применять ли к оружию апгрейд урона. */
  readonly usesDamageUpgrade: boolean;

  /** Сбросить внутреннее состояние оружия (начало забега). */
  reset(ctx: WeaponContext): void;

  /** Оружие доступно игроку прямо сейчас. */
  isAvailable(ctx: WeaponContext): boolean;

  /** Активировать оружие — подбор пикапа. */
  activate(ctx: WeaponContext): void;

  /** Тик оружия: кулдауны, таймеры, поведение. */
  update(dt: number, ctx: WeaponContext): void;

  /** Снимок слота для строки снаряжения. */
  getSlot(ctx: WeaponContext): WeaponSlotState;

  /** Число экземпляров оружия у игрока (стволы пушки, дроны). */
  getInstanceCount(ctx: WeaponContext): number;

  /** Применить персистентные модификаторы из апгрейдов. */
  applyModifiers(mods: WeaponModifiers, ctx: WeaponContext): void;
}
