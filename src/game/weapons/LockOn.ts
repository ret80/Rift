/**
 * LockOn — выбранная игроком цель.
 *
 * Игрок нажимает Tab и берёт в лок ближайшего к прицелу врага; повторное
 * нажатие перебирает цели по кругу в том же порядке. Лок не стреляет сам,
 * а задаёт приоритет: орудия наводятся на него раньше автоцели, ракеты
 * летят в него, дроны бьют его даже в эскорте. Цель снимается, когда
 * погибает, исчезает из мира или уходит слишком далеко.
 */

import type { EnemyRef } from "../ecs";

/** Дальность, в которой можно взять цель в лок. */
export const LOCK_RANGE = 900;
/** Дальность, после которой лок снимается сам. */
export const LOCK_DROP_RANGE = 1200;

export class LockOn {
  private target: EnemyRef | null = null;

  /** Взятая в лок цель (null — лока нет). */
  get current(): EnemyRef | null {
    return this.target;
  }

  /** id цели для дронов и HUD. */
  get currentId(): number | string | null {
    return this.target?.marker.ecsId ?? null;
  }

  /** Снять лок. */
  clear(): void {
    this.target = null;
  }

  /** Сброс на новый забег. */
  reset(): void {
    this.target = null;
  }

  /**
   * Взять следующую цель. Порядок перебора — по углу от прицела, поэтому
   * Tab сначала берёт то, на что игрок смотрит, а потом соседей по кругу.
   */
  cycle(
    px: number,
    py: number,
    enemies: readonly EnemyRef[],
    aimAngle: number | null,
  ): void {
    const candidates = enemies
      .filter((e) => !e.marker.dead
        && Math.hypot(e.position.x - px, e.position.y - py) <= LOCK_RANGE)
      .map((e) => {
        const dist = Math.hypot(e.position.x - px, e.position.y - py);
        const angle = Math.atan2(e.position.y - py, e.position.x - px);
        return { e, dist, angle };
      });

    if (candidates.length === 0) {
      this.clear();
      return;
    }

    const heading = aimAngle ?? (this.target
      ? Math.atan2(this.target.position.y - py, this.target.position.x - px)
      : 0);
    const angularDiff = (angle: number) => Math.abs(
      Math.atan2(Math.sin(angle - heading), Math.cos(angle - heading)),
    );
    candidates.sort((a, b) => angularDiff(a.angle) - angularDiff(b.angle) || a.dist - b.dist);

    const currentIndex = this.target ? candidates.findIndex((c) => c.e === this.target) : -1;
    const next = candidates[(currentIndex + 1) % candidates.length];
    this.target = next?.e ?? null;
  }

  /** Снять лок, если цель погибла, пропала или ушла далеко. */
  update(px: number, py: number, enemies: readonly EnemyRef[]): void {
    const target = this.target;
    if (!target) return;
    if (
      target.marker.dead ||
      !enemies.includes(target) ||
      Math.hypot(target.position.x - px, target.position.y - py) > LOCK_DROP_RANGE
    ) {
      this.target = null;
    }
  }
}
