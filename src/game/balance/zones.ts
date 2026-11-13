/* ============================================================
   Zone constants — radius, edge, clear transitions, push forces,
   gun range, menu animations.
   ============================================================ */

import { ZONE_EXPAND_SPEED_MULT } from "./player";
import { DEFAULT_PARAMS } from "./params/GameParams";

/* ------------------------- zone constants ------------------------- */

export const ZONE_INITIAL_RADIUS = 26; // 2 × PLAYER_RADIUS (13)
/**
 * Общий масштаб арены: +10 % ко всем зонам волн.
 *
 * На поздних волнах (19+) плотность врагов оставляла слишком мало места
 * для манёвра; расширение арены возвращает пространство, не меняя состав.
 */
export const ZONE_RADIUS_SCALE = DEFAULT_PARAMS.zone.radiusScale;
/** Порог выхода: урон/предупреждение начинаются за реальной границей зоны. */
export const ZONE_EXIT_EPSILON = 4;
/** Порог возврата: урон выключается внутри зоны (защита от дребезга на краю). */
export const ZONE_REENTRY_HYSTERESIS = 26;
export const ZONE_EDGE_DAMAGE_INTERVAL = 0.5; // seconds between shake pulses
export const ZONE_EDGE_DAMAGE_FRACTION_PER_SEC = 0.1; // 10% of max HP per second
export const ZONE_EDGE_SHAKE_STRENGTH = 4; // shake intensity
export const ZONE_EARLY_DAMAGE_THRESHOLD = 0.3; // don't damage before zone reaches 30% target

/** Ширина красной полосы снаружи зоны (мировые единицы). */
export const ZONE_WARNING_BAND = 250;
/** Альфа ровной (без градиента) заливки полосы зоны — «еле заметная» граница. */
export const ZONE_FILL_ALPHA = 0.122;
/** Доля ширины полосы у внутреннего края, которая светится слабее. */
export const ZONE_FILL_INNER_FADE = 0.25;
/** Множитель альфы внутренней подполосы: на 30% прозрачнее остального кольца. */
export const ZONE_FILL_INNER_MULT = 0.7;
/** Альфа линии реальной границы зоны. */
export const ZONE_EDGE_ALPHA = 0.23;
/** Альфа линии внешнего края полосы. */
export const ZONE_OUTER_EDGE_ALPHA = 0.061;
/** Максимальная альфа зоны (раньше упиралась в 0.5). */
export const ZONE_MAX_ALPHA = 1.0;

/* ------------------------- притяжение врагов ------------------------- */

/** Ускорение, с которым зона тянет вышедшего врага к центру, ед/с². */
export const ZONE_ENEMY_PULL_ACCEL = 900;
/** Проникновение, на котором притяжение выходит на полную силу. */
export const ZONE_ENEMY_PULL_RAMP = 240;
/** Гашение радиальной скорости наружу, 1/с. */
export const ZONE_ENEMY_PULL_DAMPING = 8;
/** Гашение орбитальной составляющей на краю, 1/с. */
export const ZONE_ENEMY_PULL_TANGENT_DAMPING = 0.8;
/** Предохранитель скорости врага после притяжения. */
export const ZONE_ENEMY_PULL_MAX_SPEED = 700;

/* ------------------------- сжатие зоны в бою ------------------------- */

/**
 * Через сколько секунд боя зона начинает сжиматься.
 *
 * Расширение «навсегда» делало край арены безопасным коридором: радиус
 * рос вместе с номером волны, а состав волны упирался в потолок. Сжатие
 * заставляет игрока хотя бы раз за волну сменить радиус и пройти ближе
 * к центру — сквозь толпу, а не по пустой кромке.
 */
export const ZONE_COLLAPSE_DELAY = DEFAULT_PARAMS.zone.collapse.delay;
/**
 * С какой волны включается сжатие. Первые волны — обучение: у игрока ещё
 * нет ни апгрейдов, ни понимания арены, и сжатие там только запутывает.
 */
export const ZONE_COLLAPSE_MIN_WAVE = 3;
/** Телеграф перед началом сжатия, секунды. */
export const ZONE_COLLAPSE_TELEGRAPH = 3;
/**
 * Доля целевого радиуса, до которой зона сжимается.
 * Дальше сжатие останавливается: зона сама по себе не убивает.
 */
export const ZONE_COLLAPSE_TARGET_FRACTION = DEFAULT_PARAMS.zone.collapse.targetFraction;
/**
 * Скорость сжатия как доля текущей максимальной скорости игрока.
 * Всегда меньше скорости игрока: выйти из сжатия можно, но только
 * двигаясь внутрь, а не по касательной.
 */
export const ZONE_COLLAPSE_SPEED_MULT = DEFAULT_PARAMS.zone.collapse.speedMult;

/* ------------------------- буря на кромке ------------------------- */

/**
 * Период вспышек на кромке, секунды. Кромка — не мёртвая полоса: раз в
 * 7 секунд её сектор становится опасным.
 *
 * В аудите было 10 с при вспышке 1.2 с и секторе 90° — на замерах это дало
 * 59 урона за 120 с (5 % всего урона при облёте края): облёт кромки с
 * частотой круг раз в ~9 с просто не попадал в сектор. Ритм ускорен, чтобы
 * «держать кромку» стало решением, а не фоном.
 */
export const ZONE_STORM_PERIOD = 7;
/** Телеграф перед вспышкой, секунды. */
export const ZONE_STORM_TELEGRAPH = 1.5;
/** Длительность самой вспышки, секунды. */
export const ZONE_STORM_DURATION = 1.8;
/** С какой волны буря включается (первые волны — обучение маневру). */
export const ZONE_STORM_MIN_WAVE = 3;
/**
 * Ширина угрозы, доля от радиуса зоны: внешние 38 % считаются кромкой.
 *
 * В аудите было 18 %, но это полоса уже самого края: облёт по 0.66R — то,
 * что игроки называют «кругом по краю», — в неё не попадал вообще, и буря
 * ничего не меняла. Граница совпадает с ZONE_EDGE_RIM_FRACTION: вредная
 * зона — ровно та внешняя треть, где ИИ перестаёт отворачивать.
 */
export const ZONE_STORM_BAND = 0.38;
/** Полный угол сектора бури, радианы (120°). */
export const ZONE_STORM_SECTOR = (Math.PI * 2) / 3;
/**
 * На сколько долей делится полоса угрозы (120°/6 = 20° на долю).
 *
 * Доли позволяют раскладывать угрозу иначе: одна сплошная полоса, две зоны
 * по три доли на противоположных концах кольца или три зоны по две доли.
 * Суммарная ширина угрозы при этом не меняется.
 */
export const ZONE_STORM_CELLS = 6;
/** Урон в секунду внутри сектора, доля максимального корпуса. */
export const ZONE_STORM_DAMAGE_PER_SEC = 0.25;
/** Скорость вращения сектора, рад/с: «стоять в кромке» нельзя. */
export const ZONE_STORM_SPIN = 0.5;

export const ZONE_CLEAR_BANNER_DELAY = 1.5; // seconds before showing wave clear banner
/** Сколько секунд баннер «волна зачищена» висит после появления. */
export const ZONE_CLEAR_BANNER_HOLD = 2.0;
/**
 * Следующая волна стартует только после исчезновения баннера зачистки:
 * задержка + удержание баннера + пауза, чтобы отсчёт не наложился на него.
 */
export const ZONE_CLEAR_NEXT_WAVE = 4.0; // seconds before next wave
/** Секунды, за которые зона гаснет в альфу 0 после зачистки волны. */
export const ZONE_CLEAR_FADE_TIME = 0.5;

export const ZONE_PICKUP_MAGNET = 150;

export const ZONE_ASTEROID_PUSH_FORCE = 15; // force multiplier for pushing asteroids out

/* ------------------------- пояс астероидов ------------------------- */

/** Центр пояса — доля ширины красной полосы от её внутреннего края. */
export const ZONE_BELT_BAND_FRACTION = 0.55;
/** Максимум захваченных астероидов. */
export const ZONE_BELT_MAX_ROCKS = 32;
/** Дальность притяжения к кольцу, px. */
export const ZONE_BELT_ATTRACT_RANGE = 650;
/** Полоса захвата вокруг кольца, px. */
export const ZONE_BELT_CAPTURE_BAND = 30;
/** Полуразнос внутренней и внешней дорожек, px. */
export const ZONE_BELT_LANE_OFFSET = 18;
/** Целевая линейная скорость по кольцу, px/с. */
export const ZONE_BELT_ORBIT_SPEED = 80;
/** Жёсткость радиальной пружины, 1/с². */
export const ZONE_BELT_SPRING = 2.2;
/** Гашение радиальной скорости, 1/с. */
export const ZONE_BELT_RADIAL_DAMPING = 1.8;
/** Скорость выхода на целевую касательную скорость, 1/с. */
export const ZONE_BELT_TANGENT_GAIN = 1.5;
/** Потолок ускорения пояса, px/с². */
export const ZONE_BELT_MAX_ACCEL = 600;
/** Потолок скорости захваченного камня, px/с. */
export const ZONE_BELT_MAX_SPEED = 220;

/* --------------------------- дальность снарядов --------------------------- */

/** Дальность снарядов игрока (пушек и дронов), мировые единицы. */
export const BULLET_RANGE_PLAYER = 2800;
/** Дальность вражеских болтов, мировые единицы. */
export const BULLET_RANGE_ENEMY = 1600;

/* ------------------------------ zone expansion speed ------------------------------ */

/**
 * Calculate zone expansion speed based on player upgrades and temporary bonuses.
 * @param speedMult — multiplier from player speed upgrade (1.0 + level × 0.05)
 * @param currentMaxSpeed — base PLAYER_MAX_SPEED (300)
 * @param accelBonus — temporary acceleration bonus (0.0 by default, e.g. from pickup/buff)
 * @returns zone expansion speed in units/s
 */
export function zoneExpandSpeed(speedMult: number, currentMaxSpeed: number, accelBonus: number = 0): number {
  // Зона расширяется быстрее игрока: player_speed * 1.3
  return currentMaxSpeed * speedMult * ZONE_EXPAND_SPEED_MULT * (1 + accelBonus);
}

/* ------------------------------ menu animation ------------------------------ */

export const MENU_ASTEROID_COUNT = 30;
export const MENU_RIFT_OPEN_TIME = 0.6;
export const MENU_RIFT_SPAWN_DELAY = 0.35;
export const MENU_RIFT_SPAWN_TIME = 0.28;
export const MENU_RIFT_CLOSE_TIME = 0.5;
export const MENU_RIFT_MIN_INTERVAL = 8;
export const MENU_RIFT_MAX_INTERVAL = 14;
export const MENU_ENEMY_MIN_SPEED = 80;
export const MENU_ENEMY_MAX_SPEED = 60; // additional speed range
export const MENU_EDGE_MARGIN = 150; // in DPR-scaled pixels
