/**
 * AnchorSystem — якоря-разломы: спавн, HP, уничтожение, бонус.
 * Заглушка. Реализация — Этап 3.
 */

export interface Anchor {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  alive: boolean;
}

export class AnchorSystem {
  private anchors: Anchor[] = [];

  getAnchors(): Anchor[] {
    return this.anchors;
  }

  reset(): void {
    this.anchors = [];
  }

  /** Спавн якорей для волны. */
  spawn(_wave: number, _zoneX: number, _zoneY: number, _zoneRadius: number): void {
    // [TUNE] реализовать спавн 2-3 якорей
  }

  /** Нанести урон якорю. Возвращает true если уничтожен. */
  damage(anchorId: string, amount: number): boolean {
    const anchor = this.anchors.find((a) => a.id === anchorId);
    if (!anchor || !anchor.alive) return false;
    anchor.hp -= amount;
    if (anchor.hp <= 0) {
      anchor.hp = 0;
      anchor.alive = false;
      return true;
    }
    return false;
  }

  /** Все якоря уничтожены? */
  allDestroyed(): boolean {
    return this.anchors.length > 0 && this.anchors.every((a) => !a.alive);
  }

  /** Количество живых якорей. */
  aliveCount(): number {
    return this.anchors.filter((a) => a.alive).length;
  }
}
