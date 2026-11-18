/**
 * bosses — виды боссов и числа их боевых фаз.
 *
 * Босс-волна приходит каждые `bossInterval` волн (10 по умолчанию, 5 при
 * модификаторе Асценсии). Вид босса задаётся номером босс-волны и
 * повторяется по кругу: 1-я — Страж Периметра, 2-я — Колосс, 3-я — Улей,
 * 4-я снова Страж, но с уже возросшим по волнам корпусом.
 *
 * Фазы всех боссов считаются одинаково — по остатку прочности (0/1/2), —
 * а вот набор атак у каждого свой. Числа фаз живут здесь, чтобы стратегия
 * движения и система стрельбы читали один источник.
 */

/** Вид босса-арены. */
export enum BossVariant {
  /** Страж Периметра: вращающиеся лазеры, призыв, ускоренные истребители. */
  Warden = "warden",
  /** Колосс: секторные турели, таран с призывом крейсеров, гравитация. */
  Colossus = "colossus",
  /** Улей: постоянный рой, разделение на маток, рой-шторм. */
  Hive = "hive",
}

/** Порядок боссов по босс-волнам. */
export const BOSS_VARIANTS: readonly BossVariant[] = [
  BossVariant.Warden,
  BossVariant.Colossus,
  BossVariant.Hive,
];

/**
 * Вид босса для волны.
 * `wave` — номер волны, `bossInterval` — период босс-волн.
 */
export function bossVariantForWave(
  wave: number,
  bossInterval: number = 10,
): BossVariant {
  const interval = Math.max(1, bossInterval);
  const index = Math.max(1, Math.floor(wave / interval)) - 1;
  return BOSS_VARIANTS[index % BOSS_VARIANTS.length];
}

/* --------------------------- Страж Периметра --------------------------- */

/** Число вращающихся лазерных лучей Стража. */
export const BOSS_WARDEN_LASER_ARMS = 2;
/** Радиус вращающихся лучей, px. */
export const BOSS_WARDEN_LASER_RADIUS = 400;
/** Период полного оборота лучей, секунды. */
export const BOSS_WARDEN_LASER_PERIOD = 6;
/** Полуширина луча, радианы. */
export const BOSS_WARDEN_LASER_HALF_WIDTH = 0.12;
/** Урон одного касания луча. */
export const BOSS_WARDEN_LASER_DAMAGE = 12;
/** Пауза между касаниями лучей, секунды. */
export const BOSS_WARDEN_LASER_HIT_CD = 0.55;
/** Сколько носителей вызывает Страж во второй фазе. */
export const BOSS_WARDEN_SUMMON_CARRIERS = 2;
/** Сколько истребителей вызывает Страж в третьей фазе. */
export const BOSS_WARDEN_SUMMON_FIGHTERS = 2;
/** Пауза между вызовами истребителей, секунды. */
export const BOSS_WARDEN_SUMMON_INTERVAL = 9;

/* ------------------------------- Колосс ------------------------------- */

/** Число секторных турелей по фазам. */
export const BOSS_COLOSSUS_TURRETS = [4, 4, 6];
/** Пауза между секторными залпами по фазам, секунды. */
export const BOSS_COLOSSUS_TURRET_RATE = [1.6, 1.3, 1.0];
/** Полуугол сектора залпа, радианы. */
export const BOSS_COLOSSUS_TURRET_SPREAD = 0.18;
/** Подготовка тарана, секунды. */
export const BOSS_COLOSSUS_RAM_WINDUP = 0.9;
/** Длительность тарана, секунды. */
export const BOSS_COLOSSUS_RAM_TIME = 1.1;
/** Пауза между таранами, секунды. */
export const BOSS_COLOSSUS_RAM_COOLDOWN = 7;
/** Скорость тарана относительно базовой скорости босса. */
export const BOSS_COLOSSUS_RAM_SPEED_MULT = 2.4;
/** Радиус гравитационной воронки, px. */
export const BOSS_COLOSSUS_GRAVITY_RADIUS = 520;
/** Ускорение притяжения игрока к Колоссу, px/с². */
export const BOSS_COLOSSUS_GRAVITY_ACCEL = 320;
/** Сколько крейсеров вызывает Колосс во второй фазе. */
export const BOSS_COLOSSUS_SUMMON_CRUISERS = 2;

/* -------------------------------- Улей -------------------------------- */

/** Пауза между выводками дронов, секунды. */
export const BOSS_HIVE_SPAWN_INTERVAL = 2.4;
/** Размер выводка дронов. */
export const BOSS_HIVE_SPAWN_BATCH = 2;
/** Потолок живых врагов: рой не должен заполнять арену целиком. */
export const BOSS_HIVE_FIELD_CAP = 90;
/** Сколько маток-ульев отделяется во второй фазе. */
export const BOSS_HIVE_SPLIT_COUNT = 2;
/** Длительность роя-шторма, секунды. */
export const BOSS_HIVE_STORM_TIME = 10;
/** Пауза между выводками во время шторма, секунды. */
export const BOSS_HIVE_STORM_INTERVAL = 0.4;
/** Размер выводка во время шторма. */
export const BOSS_HIVE_STORM_BATCH = 4;
/** Пауза после роя-шторма, секунды. */
export const BOSS_HIVE_STORM_COOLDOWN = 6;
