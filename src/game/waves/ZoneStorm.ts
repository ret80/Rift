/**
 * ZoneStorm — периодическая буря на кромке зоны.
 *
 * Сжатие зоны (см. ZoneModel) заставляет игрока сменить радиус раз за волну,
 * но между сжатиями кромка остаётся спокойной: урон наносит только сам выход
 * за границу, а стоять в внешних 18 % радиуса безопасно. Поэтому кромка — не
 * «опасное место», а «место, где ничего не происходит».
 *
 * Буря делает кромку ритмичной: каждые ZONE_STORM_PERIOD секунд во внешней
 * полосе вспыхивает угроза суммарной шириной ZONE_STORM_SECTOR. За
 * ZONE_STORM_TELEGRAPH секунд до вспышки она видна, поэтому удар честный:
 * его можно обойти по кромке или уйти внутрь. Угроза медленно смещается
 * по кругу — «стоять на кромке» нельзя, «двигаться по кромке» можно.
 *
 * Угроза не всегда сплошная: полоса из ZONE_STORM_CELLS долей раскладывается
 * в одну полосу, две зоны по три доли (напротив друг друга) или три зоны по
 * две доли (через 120°). Промежутки между зонами всегда одинаковые, поэтому
 * между ними есть честный безопасный коридор.
 *
 * Модель не знает о рендере и мире: только геометрия, таймеры и один хук
 * урона. Урон идёт через щит (в отличие от урона за краем зоны) и не
 * упирается в кадры неуязвимости: это среда, а не попадание снаряда.
 */

import {
  ZONE_STORM_BAND,
  ZONE_STORM_CELLS,
  ZONE_STORM_DAMAGE_PER_SEC,
  ZONE_STORM_DURATION,
  ZONE_STORM_MIN_WAVE,
  ZONE_STORM_PERIOD,
  ZONE_STORM_SECTOR,
  ZONE_STORM_SPIN,
  ZONE_STORM_TELEGRAPH,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";

/** Фаза бури: покой, телеграф, удар. */
export type ZoneStormPhase = "idle" | "telegraph" | "active";

/**
 * Сколько зон бури появляется за одну вспышку.
 *
 * Доли полосы делятся между зонами поровну: 1 — сплошная полоса на 6 долей,
 * 2 — две зоны по 3 доли напротив друг друга, 3 — три зоны по 2 доли.
 */
export type ZoneStormLayout = 1 | 2 | 3;

/** Одна зона бури: группа смежных долей полосы. */
export interface ZoneStormSegment {
  /** Центр зоны, радианы. */
  angle: number;
  /** Половина углового размера зоны, радианы. */
  halfAngle: number;
  /** Число долей в зоне (для штриховки). */
  cells: number;
}

/** Снимок бури для рендера и HUD. */
export interface ZoneStormState {
  /** Буря в текущем кадре видна (телеграф или удар). */
  active: boolean;
  phase: ZoneStormPhase;
  /** Центр зоны, мировые координаты. */
  cx: number;
  cy: number;
  /** Зоны бури этой вспышки; в покое пусто. */
  segments: ZoneStormSegment[];
  /** Раскладка зон по кольцу (для отладки и тестов). */
  layout: ZoneStormLayout;
  /** Внутренний радиус полосы, px. */
  innerRadius: number;
  /** Внешний радиус полосы (совпадает с краем зоны), px. */
  outerRadius: number;
  /** Прогресс телеграфа 0..1 (для пульсации). */
  telegraph: number;
}

export interface ZoneStormHooks {
  /** Урон игроку через щит (буря — среда, а не попадание). */
  hitPlayerShielded: (amount: number) => void;
}

/** Длительность паузы между вспышками, секунды. */
const IDLE_TIME = ZONE_STORM_PERIOD - ZONE_STORM_TELEGRAPH - ZONE_STORM_DURATION;

/** Попадает ли угол в зону бури (с учётом перехода через 0). */
function withinSegment(angle: number, segment: ZoneStormSegment): boolean {
  const diff = Math.atan2(Math.sin(angle - segment.angle), Math.cos(angle - segment.angle));
  return Math.abs(diff) <= segment.halfAngle;
}

/**
 * Раскладка зон на вспышку.
 *
 * Детерминированный хеш от волны и номера вспышки: раскладка меняется от
 * удара к удару, но симуляция и повтор записи остаются воспроизводимыми.
 */
function pickLayout(wave: number, strike: number): ZoneStormLayout {
  let h = Math.imul(wave + 1, 73856093) ^ Math.imul(strike + 1, 19349663);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (1 + ((h >>> 0) % 3)) as ZoneStormLayout;
}

function emptyState(): ZoneStormState {
  return {
    active: false,
    phase: "idle",
    cx: 0,
    cy: 0,
    segments: [],
    layout: 1,
    innerRadius: 0,
    outerRadius: 0,
    telegraph: 0,
  };
}

export class ZoneStorm {
  private stateValue: ZoneStormState = emptyState();
  private phase: ZoneStormPhase = "idle";
  /** Остаток текущей фазы, секунды. */
  private timer = IDLE_TIME;
  /** Текущий угол смещения сектора, радианы. */
  private sweep = 0;
  /** Угол, зафиксированный на момент телеграфа. */
  private strikeAngle = 0;
  /** Раскладка текущей вспышки. */
  private layout: ZoneStormLayout = 1;
  /** Номер вспышки в волне: сдвигает выбор раскладки. */
  private strikeIndex = 0;

  /** Живое состояние бури (единственный источник правды). */
  get state(): ZoneStormState {
    return this.stateValue;
  }

  /** Полный сброс (новая волна/забег). */
  reset(): void {
    this.stateValue = emptyState();
    this.phase = "idle";
    this.timer = IDLE_TIME;
    this.sweep = 0;
    this.strikeAngle = 0;
    this.layout = 1;
    this.strikeIndex = 0;
  }

  /**
   * Один кадр боя.
   *
   * @param zone — текущее состояние зоны;
   * @param playerPos — позиция игрока;
   * @param playerMaxHp — максимальный корпус (база для урона в долях);
   * @param wave — номер волны (до ZONE_STORM_MIN_WAVE буря выключена).
   */
  update(
    dt: number,
    zone: ZoneData,
    playerPos: { x: number; y: number },
    playerMaxHp: number,
    wave: number,
    hooks: ZoneStormHooks,
  ): void {
    const usable =
      zone.active &&
      zone.radius > 60 &&
      zone.radius >= zone.targetRadius * 0.9 &&
      zone.phase !== "expand" &&
      wave >= ZONE_STORM_MIN_WAVE;

    if (!usable) {
      this.stateValue.active = false;
      this.stateValue.phase = "idle";
      this.stateValue.telegraph = 0;
      this.phase = "idle";
      this.timer = IDLE_TIME;
      return;
    }

    // Сектор смещается всё время, кроме самой вспышки: телеграф должен
    // показывать ту точку, куда придётся удар.
    if (this.phase !== "active") this.sweep += ZONE_STORM_SPIN * dt;

    this.timer -= dt;
    if (this.timer <= 0) this.advancePhase(wave);

    const inner = zone.radius * (1 - ZONE_STORM_BAND);
    this.stateValue.phase = this.phase;
    this.stateValue.active = this.phase !== "idle";
    this.stateValue.cx = zone.x;
    this.stateValue.cy = zone.y;
    this.stateValue.layout = this.layout;
    this.stateValue.segments =
      this.phase === "idle" ? [] : this.buildSegments(this.strikeAngle, this.layout);
    this.stateValue.innerRadius = inner;
    this.stateValue.outerRadius = zone.radius;
    this.stateValue.telegraph =
      this.phase === "telegraph"
        ? 1 - Math.max(0, this.timer) / ZONE_STORM_TELEGRAPH
        : 0;

    if (this.phase !== "active") return;

    // Удар: игрок в полосе кромки и внутри сектора.
    const dx = playerPos.x - zone.x;
    const dy = playerPos.y - zone.y;
    const dist = Math.hypot(dx, dy);
    if (dist < inner || dist > zone.radius) return;

    const angle = Math.atan2(dy, dx);
    if (!this.stateValue.segments.some((segment) => withinSegment(angle, segment))) return;

    hooks.hitPlayerShielded(playerMaxHp * ZONE_STORM_DAMAGE_PER_SEC * dt);
  }

  /**
   * Разложить доли полосы по зонам.
   *
   * Зоны распределяются равномерно по кольцу, поэтому промежутки между ними
   * одинаковые: две зоны встают на противоположные концы (через 180°), три —
   * через 120°. Ширина угрозы в сумме всегда равна ZONE_STORM_SECTOR.
   */
  private buildSegments(center: number, layout: ZoneStormLayout): ZoneStormSegment[] {
    const halfAngle = ZONE_STORM_SECTOR / layout / 2;
    const cells = ZONE_STORM_CELLS / layout;
    const segments: ZoneStormSegment[] = [];
    for (let i = 0; i < layout; i++) {
      segments.push({ angle: center + (Math.PI * 2 * i) / layout, halfAngle, cells });
    }
    return segments;
  }

  /** Переход между фазами цикла. */
  private advancePhase(wave: number): void {
    switch (this.phase) {
      case "idle":
        this.phase = "telegraph";
        this.timer = ZONE_STORM_TELEGRAPH;
        this.strikeAngle = this.sweep;
        this.layout = pickLayout(wave, this.strikeIndex++);
        break;
      case "telegraph":
        this.phase = "active";
        this.timer = ZONE_STORM_DURATION;
        break;
      default:
        this.phase = "idle";
        this.timer = IDLE_TIME;
        this.sweep = this.strikeAngle + ZONE_STORM_SPIN * ZONE_STORM_DURATION;
        break;
    }
  }
}
