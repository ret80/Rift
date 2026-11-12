/**
 * Targeting — наведение оружия.
 *
 * Правило одно и простое: если в зоне поражения есть враг — стреляем
 * по нему (автонаведение), иначе берём ручной прицел (мышь/тач)
 * и стреляем, только если игрок держит огонь.
 *
 * Отдельно от оружия, чтобы любая пушка, ракета или дрон
 * пользовались одной и той же логикой выбора цели.
 */

import type { EnemyRef } from "../ecs";
import type { PlayerSnapshot } from "./Weapon";

/** Дальность автонаведения по умолчанию (базовая для пушки). */
export const DEFAULT_TARGET_RANGE = 420;
/** Дальность, с которой орудие переключается на якорь-разлом. */
export const ANCHOR_AIM_RANGE = 620;
/** Ближняя угроза, которую автонаведение не игнорирует ради якоря. */
export const ANCHOR_THREAT_RADIUS = 240;

/** Цель-якорь: позиция и состояние. */
export interface AnchorTarget {
  x: number;
  y: number;
  alive: boolean;
}

export class Targeting {
  /** Ручной прицел (мышь/тач); null — прицел не задан. */
  private manualAngle: number | null = null;
  /** Игрок держит огонь. */
  private manualFiring = false;
  /** Игрок запросил альтернативный огонь (правая кнопка). */
  private manualAltFiring = false;
  /** Текущая автоцель. */
  private target: EnemyRef | null = null;
  /** Угол до автоцели. */
  private autoAngle: number | null = null;
  /** Угол до якоря-разлома (цель волны). */
  private anchorAngle: number | null = null;
  /** Зона глушилки: в ней автонаведение отключено. */
  private isJammed?: (x: number, y: number) => boolean;
  /** Цель, взятая игроком в лок (Tab). Имеет приоритет над автоцелью. */
  private locked: EnemyRef | null = null;

  constructor(private range: number) {}

  /** Задать ручной прицел. */
  setManualAim(angle: number | null): void {
    this.manualAngle = angle;
  }

  /** Сообщить, что игрок держит огонь. */
  setManualFiring(firing: boolean): void {
    this.manualFiring = firing;
  }

  /** Сообщить, что игрок держит альтернативный огонь. */
  setManualAltFiring(altFiring: boolean): void {
    this.manualAltFiring = altFiring;
  }

  /** Подключить проверку зоны глушилки. */
  setJammerSource(source: (x: number, y: number) => boolean): void {
    this.isJammed = source;
  }

  /** Задать цель, взятую игроком в лок. */
  setLocked(target: EnemyRef | null): void {
    this.locked = target;
  }

  /**
   * Обновить автоцель.
   *
   * Правило приоритетов:
   *   1. ближняя угроза (враг в ANCHOR_THREAT_RADIUS) — сначала выжить;
   *   2. якорь-разлом в радиусе ANCHOR_AIM_RANGE — цель волны;
   *   3. ближайший враг в радиусе оружия.
   *
   * Якорь добавлен потому, что иначе автонаведение никогда не стреляло по
   * целям-якорям: они не являются врагами и остаются вне выбора оружия.
   */
  update(
    player: PlayerSnapshot,
    enemies: readonly EnemyRef[],
    anchors: readonly AnchorTarget[] = [],
  ): void {
    // В зоне глушилки автонаведение выключено; ручной прицел и лок остаются.
    if (this.isJammed?.(player.x, player.y)) {
      const manual = this.locked && !this.locked.marker.dead ? this.locked : null;
      this.target = manual;
      this.autoAngle = manual
        ? Math.atan2(manual.position.y - player.y, manual.position.x - player.x)
        : null;
      this.anchorAngle = null;
      return;
    }

    let nearest: EnemyRef | null = null;
    let nearestDist = this.range;
    let threat: EnemyRef | null = null;
    let threatDist = ANCHOR_THREAT_RADIUS;

    for (const e of enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - player.x, e.position.y - player.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
      if (dist < threatDist) {
        threatDist = dist;
        threat = e;
      }
    }

    let anchor: AnchorTarget | null = null;
    let anchorDist = ANCHOR_AIM_RANGE;
    for (const a of anchors) {
      if (!a.alive) continue;
      const dist = Math.hypot(a.x - player.x, a.y - player.y);
      if (dist < anchorDist) {
        anchorDist = dist;
        anchor = a;
      }
    }

    // Лок — явный выбор игрока: он важнее ближней угрозы и якоря.
    const locked = this.locked && !this.locked.marker.dead ? this.locked : null;
    const aimEnemy = locked ?? threat ?? (anchor ? null : nearest);
    this.target = aimEnemy;
    this.autoAngle = aimEnemy
      ? Math.atan2(aimEnemy.position.y - player.y, aimEnemy.position.x - player.x)
      : null;
    this.anchorAngle = !aimEnemy && anchor
      ? Math.atan2(anchor.y - player.y, anchor.x - player.x)
      : null;
  }

  /** Угол прицеливания: автоцель/якорь приоритетнее ручного прицела. */
  get angle(): number | null {
    return this.autoAngle ?? this.anchorAngle ?? this.manualAngle;
  }

  /** Оружие стреляет: есть цель (враг или якорь) либо игрок держит огонь. */
  get firing(): boolean {
    return this.target !== null || this.anchorAngle !== null || this.manualFiring || this.manualAltFiring;
  }

  /** Игрок держит альтернативный огонь. */
  get altFiring(): boolean {
    return this.manualAltFiring;
  }

  /** Текущая автоцель (null — цели нет). */
  get currentTarget(): EnemyRef | null {
    return this.target;
  }

  /** Цель в локе, если она ещё жива. */
  get lockedTarget(): EnemyRef | null {
    return this.locked && !this.locked.marker.dead ? this.locked : null;
  }
}
