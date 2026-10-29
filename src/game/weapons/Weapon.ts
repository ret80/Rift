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
import type { DroneFleetSpec } from "../drones/Drone";
import type { AllyDrone, Bullet, Enemy, LaserBeam } from "../types";

/** Идентификаторы видов оружия. */
export type WeaponId = "cannon" | "missile" | "drone" | "laser";

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
  /** Автоцель — враг, на который наведено орудие (null — ручной прицел). */
  target: Enemy | null;
  /** Шанс попадания автонаведения (0..1, всегда < 1). */
  hitChance: number;
}

/** Снимок границы игровой зоны для оружия. */
export interface ZoneSnapshot {
  /** Зона волны активна. */
  active: boolean;
  /** Центр зоны (мировые координаты). */
  x: number;
  y: number;
  /** Радиус зоны. */
  radius: number;
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
  /** Зарегистрировать новый снаряд игрока в ECS-мире. */
  addBullet(bullet: Bullet): void;
  /** Пул дронов-компаньонов. */
  readonly drones: AllyDrone[];
  /** Зарегистрировать новый дрон-компаньон в ECS-мире. */
  addAllyDrone(drone: AllyDrone): void;
  /** Пул лучей лазера — визуальная трасса выстрела. */
  readonly beams: LaserBeam[];
  /** Зарегистрировать новый визуальный луч лазера в ECS-мире. */
  addBeam(beam: LaserBeam): void;
  /** Граница игровой зоны (null — зона не задана). */
  readonly zone: ZoneSnapshot | null;
  /** Колбэк выстрела — проигрывание звука. */
  onFired(id: WeaponId): void;
  /** Колбэк гибели врага — единый путь enemy_killed (дроп, счёт, волна). */
  killEnemy?(enemy: Enemy): void;
  /** Нанести урон врагу через единый канонический путь (ECS damageEnemy). */
  damageEnemy?(enemy: Enemy, dmg: number): void;
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

/** Модель оружия, расширяемая апгрейдом в меню «Арсенал». */
export type WeaponStatKey = "reload" | "damage" | "accuracy";

/** Модель оружия в арсенале: база + уровни трёх линий. */
export interface WeaponModelUpgrades {
  /** Уровень ускорения перезарядки. */
  reload: number;
  /** Уровень повышения урона. */
  damage: number;
  /** Уровень повышения точности. */
  accuracy: number;
}

/** Шаблон «нулевой» модели оружия. */
export const BASE_WEAPON_MODEL: WeaponModelUpgrades = {
  reload: 0,
  damage: 0,
  accuracy: 0,
};

/** Запись арсенала: куплено ли оружие и уровни его линий. */
export interface WeaponLoadoutEntry {
  /** Оружие куплено (пушка куплена по умолчанию). */
  owned: boolean;
  /** Уровни линий апгрейда оружия. */
  model: WeaponModelUpgrades;
}

/** Персистентный арсенал игрока: модели всех видов оружия. */
export type WeaponLoadout = Record<WeaponId, WeaponLoadoutEntry>;

/**
 * Персистентные модификаторы оружия, приходящие из апгрейдов.
 * Каждое оружие само решает, какие из них к нему относятся.
 */
export interface WeaponModifiers {
  /** Оружие куплено в арсенале (постоянно доступно). */
  owned?: boolean;
  /** Число экземпляров оружия: стволы пушки, дроны-компаньоны. */
  count?: number;
  /** Персональный множитель перезарядки оружия (меньше — быстрее). */
  reloadMult?: number;
  /** Персональный множитель урона оружия (арсенал). */
  damageMult?: number;
  /** Персональная модель оружия (уровни линий арсенала). */
  model?: WeaponModelUpgrades;
  /** Снимок флота купленных дронов (для DroneWeapon). */
  droneFleet?: DroneFleetSpec;
  /**
   * Персональная точность оружия: замещает общий шанс попадания,
   * если оружие поддерживает персональную точность (usesPersonalAccuracy).
   */
  accuracy?: number;
}

/**
 * Персистентные апгрейды игрока, доступные оружию.
 * Структурно совместим с результатом applyUpgrades() из upgrades.ts.
 */
export interface WeaponUpgrades {
  /** Число слотов под дроны корабля. */
  droneSlots: number;
  /** Множитель темпа стрельбы от постоянного бонуса «Темп огня». */
  fireRateMult: number;
}

/** Апгрейд, задающий число экземпляров оружия. */
export type WeaponCountUpgrade = "drones";

/** Единый контракт всех видов оружия. */
export interface Weapon {
  /** Идентификатор вида оружия. */
  readonly id: WeaponId;
  /** Оформление слота оружия в строке снаряжения. */
  readonly meta: WeaponMeta;
  /** Апгрейд, задающий число экземпляров (null — оружие не масштабируется). */
  readonly countUpgrade: WeaponCountUpgrade | null;
  /** Поддерживает ли оружие персональную точность арсенала. */
  readonly usesPersonalAccuracy: boolean;
  /** Базовый урон одной порции оружия (для расчёта множителя урона). */
  readonly baseDamage: number;

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
