/**
 * Реестр профилей параметров.
 *
 * Профиль — это полный набор `GameParams`, а не дельта: такой набор можно
 * прочитать, сравнить и провалидировать целиком. Отладочные сдвиги
 * накладываются поверх профиля в `resolveParams`.
 */

import { EnemyKind } from "../enemyKinds";
import { DEFAULT_PARAMS, type GameParams } from "./GameParams";

/** Идентификаторы профилей. */
export type ParamProfileId = "default" | "relaxed" | "stress";

/** Профили в порядке показа в отладке. */
export const PARAM_PROFILE_IDS: readonly ParamProfileId[] = ["default", "relaxed", "stress"];

/** Клонировать параметры: профили не должны делить объекты друг с другом. */
export function cloneParams(params: GameParams): GameParams {
  return {
    player: { ...params.player },
    enemy: {
      speedFactor: { ...params.enemy.speedFactor },
      hpBase: { ...params.enemy.hpBase },
    },
    zone: {
      radiusScale: params.zone.radiusScale,
      baseRadius: { ...params.zone.baseRadius },
      collapse: { ...params.zone.collapse },
    },
  };
}

/** Умножить все доли скоростей врагов и их корпус на общий коэффициент. */
function scaleEnemies(params: GameParams, speedMult: number, hpMult: number): void {
  for (const kind of Object.values(EnemyKind)) {
    params.enemy.speedFactor[kind] *= speedMult;
    // Корпус кратен целому: иначе 2 HP ищейки в профиле превращаются в 1.6.
    params.enemy.hpBase[kind] = Math.max(1, Math.round(params.enemy.hpBase[kind] * hpMult));
  }
}

/**
 * «Спокойный» профиль: просторнее арена, медленнее и мягче враги.
 * Для проверки читаемости угроз и новых механик без давления.
 */
function buildRelaxed(): GameParams {
  const params = cloneParams(DEFAULT_PARAMS);
  params.zone.radiusScale *= 1.15;
  scaleEnemies(params, 0.9, 0.8);
  return params;
}

/**
 * «Стресс» профиль: тесная арена, быстрые и живучие враги.
 * Для проверки предела сложности и производительности.
 */
function buildStress(): GameParams {
  const params = cloneParams(DEFAULT_PARAMS);
  params.zone.radiusScale *= 0.9;
  scaleEnemies(params, 1.1, 1.25);
  return params;
}

/** Все доступные профили по идентификатору. */
export const PARAM_PROFILES: Record<ParamProfileId, GameParams> = {
  default: DEFAULT_PARAMS,
  relaxed: buildRelaxed(),
  stress: buildStress(),
};

/** Нормализовать идентификатор профиля из внешних данных. */
export function normalizeParamProfileId(value: unknown): ParamProfileId {
  return typeof value === "string" && value in PARAM_PROFILES
    ? (value as ParamProfileId)
    : "default";
}
