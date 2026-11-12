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

import type { Rng } from "../core/rng";
import type { PlayerBonuses } from "../loadout/bonuses/Bonus";
import type { DroneFleetSpec } from "../drones/Drone";
import type { BeamSpawn, BulletSpawn } from "../ecs/spawn";
import type { DroneRef, EnemyBulletRef, EnemyRef, AllyDroneSpawn, BeamRef } from "../ecs";
import type { EnemyDamagePort } from "../ecs/EnemyLifecycle";
import type { WeaponId, WeaponMeta } from "./WeaponCatalog";

export type { WeaponId, WeaponMeta } from "./WeaponCatalog";

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
  /**
   * Альтернативный огонь.
   *
   * Каждое оружие само решает, что делает его alt-fire: веер, залп,
   * разрыв цепи или выброс заряда. Общий контракт один — режим
   * запрашивается игроком и обрабатывается вместо основного выстрела.
   */
  altFiring: boolean;
  /** Автоцель — враг, на который наведено орудие (null — ручной прицел). */
  target: EnemyRef | null;
  /** Цель, взятая игроком в лок; ракеты бьют её первой. */
  locked: EnemyRef | null;
  /** Шанс попадания автонаведения (0..1, всегда < 1). */
  hitChance: number;
}

/** Всё, что доступно оружию во время работы. */
export interface WeaponContext extends EnemyDamagePort {
  /** Положение и состояние игрока. */
  readonly player: PlayerSnapshot;
  /** Текущие бонусы игрока. */
  readonly bonuses: PlayerBonuses;
  /** Наведение: угол и готовность стрелять. */
  readonly aim: AimState;
  /** Враги — цели для наведения. */
  readonly enemies: readonly EnemyRef[];
  /** Вражеские снаряды: их поглощает оружие вроде пожирателя. */
  readonly enemyBullets: readonly EnemyBulletRef[];
  /** Удалить вражеский снаряд (поглощение, не урон игроку). */
  removeEnemyBullet(bullet: EnemyBulletRef): void;
  /** Зарегистрировать новый снаряд игрока в ECS-мире. */
  addBullet(bullet: BulletSpawn): void;
  /** Пул дронов-компаньонов (живые связки компонентов). */
  readonly drones: DroneRef[];
  /** Зарегистрировать новый дрон-компаньон в ECS-мире. */
  addAllyDrone(drone: AllyDroneSpawn): void;
  /** Пул лучей лазера — визуальная трасса выстрела. */
  readonly beams: BeamRef[];
  /** Зарегистрировать новый визуальный луч лазера в ECS-мире. */
  addBeam(beam: BeamSpawn): void;
  /** Колбэк выстрела — проигрывание звука. */
  onFired(id: WeaponId): void;
  /** Боевой поток случайности: разброс стволов и точность. */
  readonly rng: Rng;
  /** Визуальный поток: seed'ы лучей и эффектов. */
  readonly rngFx: Rng;
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
