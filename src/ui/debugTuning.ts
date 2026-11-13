/**
 * DebugTuning — отладочные сдвиги параметров мира.
 *
 * Один объект вместо россыпи полей: профиль и ползунки. Панель отладки
 * строит слайдеры из `DEBUG_SLIDERS`, поэтому новый параметр — это одна
 * строка в реестре и поле в `ParamModifiers`, а не правки в пяти файлах.
 */

import { readJson, readNumber } from "../game/core/storage";
import { createLocalStoragePort } from "../game/core/PersistencePort";
import { STORAGE_KEYS } from "../game/core/storageKeys";
import {
  normalizeParamProfileId,
  type ParamProfileId,
} from "../game/balance/params/profiles";
import type { TKey } from "../i18n";

/** Отладочные сдвиги, которые сохраняются между запусками. */
export interface DebugTuning {
  /** Выбранный профиль параметров мира. */
  profile: ParamProfileId;
  /** Сдвиг скорости игрока и врагов, проценты. */
  speed: number;
  /** Сдвиг размера арены, проценты. */
  zone: number;
}

/** Описание отладочного ползунка. */
export interface DebugSliderDef {
  /** Поле `DebugTuning`, которым управляет ползунок. */
  key: "speed" | "zone";
  labelKey: TKey;
  descKey: TKey;
  min: number;
  max: number;
  step: number;
}

/** Реестр ползунков панели отладки. */
export const DEBUG_SLIDERS: readonly DebugSliderDef[] = [
  {
    key: "speed",
    labelKey: "debug.speed",
    descKey: "debug.speedDesc",
    min: -50,
    max: 50,
    step: 5,
  },
  {
    key: "zone",
    labelKey: "debug.zone",
    descKey: "debug.zoneDesc",
    min: -50,
    max: 50,
    step: 5,
  },
];

/** Значения по умолчанию: профиль `default`, без сдвигов. */
export const DEFAULT_DEBUG_TUNING: DebugTuning = {
  profile: "default",
  speed: 0,
  zone: 0,
};

const port = createLocalStoragePort();

/** Ограничить сдвиг диапазоном ползунка. */
function clampPercent(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.min(50, Math.max(-50, Math.round(value / 5) * 5));
}

/** Привести сохранённое значение к валидному виду. */
export function normalizeDebugTuning(value: unknown): DebugTuning {
  const data = (typeof value === "object" && value !== null ? value : {}) as Partial<DebugTuning>;
  return {
    profile: normalizeParamProfileId(data.profile),
    speed: clampPercent(data.speed),
    zone: clampPercent(data.zone),
  };
}

/**
 * Прочитать настройки отладки, мигрируя старые ключи
 * `rift9_debug_speed` / `rift9_debug_zone` в общий объект.
 */
export function loadDebugTuning(): DebugTuning {
  const raw = port.get(STORAGE_KEYS.debugTuning);
  if (raw !== null) {
    return normalizeDebugTuning(readJson<DebugTuning>(port, STORAGE_KEYS.debugTuning, DEFAULT_DEBUG_TUNING));
  }
  return normalizeDebugTuning({
    ...DEFAULT_DEBUG_TUNING,
    speed: readNumber(port, STORAGE_KEYS.debugSpeed, 0),
    zone: readNumber(port, STORAGE_KEYS.debugZone, 0),
  });
}
