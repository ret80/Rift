/**
 * GameParams — единственный источник первичных чисел баланса.
 *
 * Здесь только «входные» значения: скорость игрока, доли скоростей врагов,
 * базовый корпус, геометрия арены. Всё производное (пиксели в секунду,
 * радиус волны) считается функциями из `derived.ts`, поэтому связанные
 * параметры меняются вместе: поправили `player.maxSpeed` — поехали и
 * враги, чья скорость задана долей от неё.
 *
 * Значения по умолчанию совпадают с прежними константами бит-в-бит.
 */

import { EnemyKind } from "../enemyKinds";

/** Параметры корабля игрока. */
export interface PlayerParams {
  /** Предел скорости без прокачки, px/с. */
  maxSpeed: number;
  /** Ускорение при удержании направления, px/с². */
  accel: number;
  /** Показатель экспоненциального трения, 1/с. */
  frictionExp: number;
  /** Базовый запас корпуса без апгрейдов. */
  baseHp: number;
  /** Радиус корпуса, px. */
  radius: number;
}

/** Параметры врагов. */
export interface EnemyParams {
  /** Доля скорости врага от `player.maxSpeed`. */
  speedFactor: Record<EnemyKind, number>;
  /** Базовый запас корпуса до масштабирования по волнам. */
  hpBase: Record<EnemyKind, number>;
}

/** Геометрия арены и тайминги зоны. */
export interface ZoneParams {
  /** Общий масштаб арены: 1.1 — прежние +10 %. */
  radiusScale: number;
  /** Радиус волны: base + (wave − 1) × perWave, не больше max. */
  baseRadius: {
    base: number;
    max: number;
    perWave: number;
  };
  /** Сжатие зоны в бою (серия рывков после задержки). */
  collapse: {
    /** Задержка от активации зоны до первого рывка, секунды. */
    delay: number;
    /** С какой волны включается сжатие. */
    minWave: number;
    /** Сколько радиуса арены отнимает один рывок, доля радиуса волны. */
    stepFraction: number;
    /** Сколько длится движение пунктирного кольца, секунды. */
    dashTime: number;
    /** Пауза перед схлопыванием арены, секунды. */
    pauseTime: number;
    /** Отдых между рывками, секунды. */
    cooldown: number;
    /** Предельная потеря радиуса за волну, доля радиуса волны. */
    maxLoss: number;
  };
}

/**
 * Эффекты выбранных модификаторов Асценсии (GDD §12).
 *
 * Слой сложности поверх профиля: модификаторы не правят баланс напрямую, а
 * задают множители, которые `resolveParams` применяет так же, как отладочные
 * сдвиги. Нейтральные значения — «без модификаторов».
 */
export interface AscensionParams {
  /** Множитель корпуса врагов. */
  enemyHpMult: number;
  /** Множитель урона врагов (контакт и болты). */
  enemyDamageMult: number;
  /** Множитель доли скорости врагов. */
  enemySpeedMult: number;
  /** Множитель меткости врагов (шанс попадания). */
  enemyAccuracyMult: number;
  /** Множитель радиуса арены. */
  zoneRadiusMult: number;
  /** Множитель задержки сжатия арены. */
  collapseDelayMult: number;
  /** Множитель периода бури: <1 — вспышки чаще. */
  stormPeriodMult: number;
  /** Множитель эффективности лечения игрока: 0 — лечения нет. */
  healMult: number;
  /** Добавка к шансу элиты (0.08 = +8 п.п.). */
  eliteChanceBonus: number;
  /** Открыть дополнительные элитные аффиксы. */
  extraAffixes: boolean;
  /** Волна босса: 10 — базовая, 5 — босс каждые пять волн. */
  bossInterval: number;
  /** Подкрепления приходят клещами — парой с противоположных сторон. */
  pincer: boolean;
  /** Множитель радиуса магнита подбора. */
  pickupMagnetMult: number;
  /** Зеркальный мир: враги маневрируют и входят зеркально. */
  mirrorWorld: boolean;
  /** Бесконечный скейл: после 40-й волны давление продолжает расти. */
  endlessScaling: boolean;
  /** Множитель кредитов за забег (награда Асценсии). */
  creditsMult: number;
  /** Множитель деталей за забег (награда Асценсии). */
  partsMult: number;
}

/** Нейтральные эффекты: обычная сложность без модификаторов. */
export const DEFAULT_ASCENSION_PARAMS: AscensionParams = {
  enemyHpMult: 1,
  enemyDamageMult: 1,
  enemySpeedMult: 1,
  enemyAccuracyMult: 1,
  zoneRadiusMult: 1,
  collapseDelayMult: 1,
  stormPeriodMult: 1,
  healMult: 1,
  eliteChanceBonus: 0,
  extraAffixes: false,
  bossInterval: 10,
  pincer: false,
  pickupMagnetMult: 1,
  mirrorWorld: false,
  endlessScaling: false,
  creditsMult: 1,
  partsMult: 1,
};

/** Полный набор параметров мира. */
export interface GameParams {
  player: PlayerParams;
  enemy: EnemyParams;
  zone: ZoneParams;
  /** Эффекты Асценсии текущего забега. */
  ascension: AscensionParams;
}

/** Параметры по умолчанию: текущий баланс игры. */
export const DEFAULT_PARAMS: GameParams = {
  player: {
    maxSpeed: 480,
    accel: 1240,
    frictionExp: 2.4,
    baseHp: 120,
    radius: 13,
  },
  enemy: {
    speedFactor: {
      [EnemyKind.Drone]: 1.05,
      [EnemyKind.Hunter]: 1.15,
      [EnemyKind.Fighter]: 0.9,
      [EnemyKind.Cruiser]: 0.5,
      [EnemyKind.Carrier]: 0.3,
      [EnemyKind.Miner]: 0.55,
      [EnemyKind.Boss]: 0.27,
      [EnemyKind.Mine]: 0,
      [EnemyKind.Needle]: 1.035,
      [EnemyKind.Shieldbearer]: 0.4,
      [EnemyKind.Harpooner]: 0.9,
      [EnemyKind.Splitter]: 1.488,
      [EnemyKind.Jammer]: 0.18,
      [EnemyKind.Vortex]: 0.35,
      [EnemyKind.HiveMother]: 0.15,
      [EnemyKind.Tractor]: 0.62,
    },
    hpBase: {
      [EnemyKind.Drone]: 2,
      [EnemyKind.Hunter]: 2,
      [EnemyKind.Fighter]: 34,
      [EnemyKind.Cruiser]: 155,
      [EnemyKind.Carrier]: 350,
      [EnemyKind.Miner]: 52,
      [EnemyKind.Boss]: 900,
      [EnemyKind.Mine]: 3,
      [EnemyKind.Needle]: 40,
      [EnemyKind.Shieldbearer]: 90,
      [EnemyKind.Harpooner]: 55,
      [EnemyKind.Splitter]: 36,
      [EnemyKind.Jammer]: 70,
      [EnemyKind.Vortex]: 110,
      [EnemyKind.HiveMother]: 500,
      [EnemyKind.Tractor]: 70,
    },
  },
  zone: {
    radiusScale: 1.1,
    baseRadius: { base: 380, max: 715, perWave: 10 },
    collapse: {
      delay: 45,
      minWave: 3,
      stepFraction: 0.1,
      dashTime: 1.5,
      pauseTime: 0.5,
      cooldown: 5,
      maxLoss: 0.4,
    },
  },
  ascension: { ...DEFAULT_ASCENSION_PARAMS },
};
