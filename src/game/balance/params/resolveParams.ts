/**
 * resolveParams — профиль + Асценсия + отладочные сдвиги → параметры мира.
 *
 * Правила:
 *   • профиль применяется всегда (обычный забег использует `default`);
 *   • модификаторы Асценсии применяются всегда: это выбор игрока на забег;
 *   • отладочные сдвиги — только в тестовом режиме, иначе рекорды и
 *     реплеи зависели бы от положения ползунков.
 */

import { DEFAULT_ASCENSION_PARAMS, type AscensionParams, type GameParams } from "./GameParams";
import { cloneParams, PARAM_PROFILES, type ParamProfileId } from "./profiles";

/** Допустимый сдвиг отладочного ползунка: −50…+50 %. */
export const PARAM_MODIFIER_MIN = -0.5;
export const PARAM_MODIFIER_MAX = 0.5;

/** Отладочные сдвиги поверх профиля. */
export interface ParamModifiers {
  /** Сдвиг скорости игрока и врагов, доля: −0.5…+0.5. */
  speed?: number;
  /** Сдвиг размера арены, доля: −0.5…+0.5. */
  zone?: number;
}

function clampModifier(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(PARAM_MODIFIER_MAX, Math.max(PARAM_MODIFIER_MIN, value));
}

/**
 * Наложить модификаторы Асценсии на параметры.
 *
 * Враги ускоряются долей от скорости игрока, поэтому множитель применяется
 * к каждой доле по отдельности; арена и задержка сжатия — обычные множители.
 */
export function applyAscensionEffects(params: GameParams, effects: AscensionParams): void {
  params.ascension = { ...effects };
  if (effects.enemySpeedMult !== 1) {
    for (const kind of Object.keys(params.enemy.speedFactor) as Array<
      keyof typeof params.enemy.speedFactor
    >) {
      params.enemy.speedFactor[kind] *= effects.enemySpeedMult;
    }
  }
  params.zone.radiusScale *= effects.zoneRadiusMult;
  params.zone.collapse.delay *= effects.collapseDelayMult;
}

/**
 * Собрать параметры мира.
 *
 * Сдвиг скорости применяется к `player.maxSpeed`, а скорости врагов заданы
 * долей от неё — поэтому они ускоряются вместе с игроком автоматически,
 * без двойного умножения.
 */
export function resolveParams(
  profileId: ParamProfileId,
  mods: ParamModifiers = {},
  testMode = false,
  ascension: AscensionParams = DEFAULT_ASCENSION_PARAMS,
): GameParams {
  const params = cloneParams(PARAM_PROFILES[profileId]);
  applyAscensionEffects(params, ascension);
  if (!testMode) return params;

  const speedMod = clampModifier(mods.speed);
  const zoneMod = clampModifier(mods.zone);

  if (speedMod !== 0) {
    params.player.maxSpeed *= 1 + speedMod;
    params.player.accel *= 1 + speedMod;
  }
  if (zoneMod !== 0) {
    params.zone.radiusScale *= 1 + zoneMod;
  }
  return params;
}
