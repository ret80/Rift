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
import type { AnchorTarget, PlayerSnapshot } from "./Weapon";

// Якорь описан в контракте оружия; реэкспорт сохраняет прежние импорты.
export type { AnchorTarget } from "./Weapon";

/** Дальность автонаведения по умолчанию (базовая для пушки). */
export const DEFAULT_TARGET_RANGE = 420;
/** Дальность, с которой орудие переключается на якорь-разлом. */
export const ANCHOR_AIM_RANGE = 620;
/** Ближняя угроза, которую автонаведение не игнорирует ради якоря. */
export const ANCHOR_THREAT_RADIUS = 240;

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
  /** Якорь, выбранный целью, когда врагов в радиусе орудия нет. */
  private anchorTarget: AnchorTarget | null = null;

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
   *   1. лок игрока;
   *   2. ближняя угроза (враг в ANCHOR_THREAT_RADIUS) — сначала выжить;
   *   3. ближайший враг в радиусе оружия;
   *   4. якорь-разлом в радиусе ANCHOR_AIM_RANGE — цель волны.
   *
   * Якорь — только запасная цель: пока в радиусе орудия есть враги,
   * арсенал стреляет по ним, а разлом ждёт своей очереди.
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
      this.anchorTarget = null;
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
    // Враги в радиусе орудия всегда приоритетнее разлома; якорь берётся,
    // только когда стрелять больше не в кого.
    const locked = this.locked && !this.locked.marker.dead ? this.locked : null;
    const aimEnemy = locked ?? threat ?? nearest;
    this.target = aimEnemy;
    this.autoAngle = aimEnemy
      ? Math.atan2(aimEnemy.position.y - player.y, aimEnemy.position.x - player.x)
      : null;
    this.anchorTarget = !aimEnemy && anchor ? anchor : null;
    this.anchorAngle = this.anchorTarget
      ? Math.atan2(this.anchorTarget.y - player.y, this.anchorTarget.x - player.x)
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

  /** Якорь-разлом, выбранный целью (null — врагов в радиусе нет, якоря тоже). */
  get currentAnchor(): AnchorTarget | null {
    return this.anchorTarget;
  }
}
