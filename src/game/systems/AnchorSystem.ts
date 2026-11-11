/**
 * AnchorSystem — якоря-разломы: спавн, HP, уничтожение, бонус.
 */

export interface Anchor {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
  wave: number;
}

export class AnchorSystem {
  private anchors: Anchor[] = [];
  private nextId = 0;

  getAnchors(): Anchor[] {
    return this.anchors;
  }

  reset(): void {
    this.anchors = [];
  }

  /** Спавн якорей для волны. */
  spawn(
    wave: number,
    zoneX: number,
    zoneY: number,
    zoneRadius: number,
    count: number,
    rng: () => number,
  ): void {
    this.reset();
    const r = Math.max(40, zoneRadius * 0.45);
    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + rng() * 0.5;
      const hp = 60 + wave * 15; // [TUNE]
      this.anchors.push({
        id: `anchor_${this.nextId++}`,
        x: zoneX + Math.cos(angle) * r,
        y: zoneY + Math.sin(angle) * r,
        hp,
        maxHp: hp,
        radius: 18,
        alive: true,
        wave,
      });
    }
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

  /** Найти якорь по позиции (для коллизий). */
  findAt(x: number, y: number, radius: number): Anchor | null {
    for (const a of this.anchors) {
      if (!a.alive) continue;
      const d = Math.hypot(a.x - x, a.y - y);
      if (d <= a.radius + radius) return a;
    }
    return null;
  }

  /** Все якоря уничтожены (или их нет). */
  allDestroyed(): boolean {
    return this.anchors.length === 0 || this.anchors.every((a) => !a.alive);
  }

  /** Количество живых якорей. */
  aliveCount(): number {
    return this.anchors.filter((a) => a.alive).length;
  }

  hasAnchors(): boolean {
    return this.anchors.length > 0;
  }
}
