/**
 * AnchorSystem — якоря-разломы: цель волны, которая держит разлом открытым.
 *
 * Механика:
 *   • якорь появляется только после того, как зона волны активировалась,
 *     и всегда внутри зоны (на дальней от игрока стороне арены);
 *   • пока якорь жив, его разлом остаётся открытым и каждые несколько
 *     секунд выпускает подкрепление — игнорировать якоря нельзя;
 *   • волна с якорями не завершается, пока жив хотя бы один якорь;
 *   • сжатие зоны не оставляет якоря снаружи: они «подтягиваются» к
 *     границе зоны, поэтому цель всегда достижима.
 *
 * Система ничего не знает про оружие и рендер: спавн подкреплений и
 * подсказки приходят через окружение (`AnchorEnv`).
 */

import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
import type { ZoneData } from "../core/ZoneTypes";

/** Якорь-разлом. */
export interface Anchor {
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  alive: boolean;
  wave: number;
  /** Секунды до следующего подкрепления из разлома. */
  spawnT: number;
  /** Сколько подкреплений разлом уже выпустил (потолок на волну). */
  spawned: number;
  /** Seed визуального разлома. */
  seed: number;
  /** Награда деталями за уничтожение. */
  reward: number;
}

/** Радиус якоря в пикселях. */
export const ANCHOR_RADIUS = 20;
/** Доля радиуса зоны, на которой стоят якоря. */
export const ANCHOR_ORBIT_FRACTION = 0.58;
/** Якорь никогда не уходит дальше этой доли радиуса зоны. */
export const ANCHOR_ZONE_MARGIN = 0.8;
/** Минимальная дистанция от игрока при постановке. */
export const ANCHOR_MIN_PLAYER_DIST = 170;
/** Задержка перед первым подкреплением, секунды. */
export const ANCHOR_FIRST_SPAWN_DELAY = 4;
/** Период подкреплений из разлома, секунды. */
export const ANCHOR_SPAWN_INTERVAL = 6;
/** Сколько подкреплений выпускает один якорь за волну. */
export const ANCHOR_MAX_REINFORCEMENTS = 12;
/** Минимальный зазор между якорями: цели не должны накладываться друг на друга. */
export const ANCHOR_MIN_SPACING = ANCHOR_RADIUS * 4 + 24;

/** Прочность якоря: база + рост по волнам (крейсерский скейл). */
export function anchorMaxHp(wave: number): number {
  return Math.round(240 + wave * 28);
}

export interface AnchorEnv {
  /** Живая зона волны. */
  getZone(): ZoneData;
  /** Позиция игрока. */
  getPlayer(): { x: number; y: number };
  /** Выпустить подкрепление из разлома якоря. */
  spawnReinforcement(anchor: Anchor): void;
  /** Якоря поставлены — можно показать подсказку игроку. */
  onSpawned(anchors: Anchor[]): void;
}

export class AnchorSystem extends PhasedSystem {
  private anchors: Anchor[] = [];
  private nextId = 0;
  /** Сколько якорей нужно поставить, когда зона активируется. */
  private pendingCount = 0;
  private pendingWave = 0;

  constructor(private readonly env: AnchorEnv) {
    super(Phase.Wave);
  }

  getAnchors(): Anchor[] {
    return this.anchors;
  }

  reset(): void {
    this.anchors = [];
    this.pendingCount = 0;
    this.pendingWave = 0;
  }

  /**
   * Запросить якоря для волны. Позиции считаются позже, когда зона уже
   * активна: до активации её центра и радиуса ещё не существует.
   */
  requestSpawn(wave: number, count: number): void {
    this.reset();
    if (count <= 0) return;
    this.pendingWave = wave;
    this.pendingCount = count;
  }

  /** Тик системы: постановка, удержание в зоне, подкрепления. */
  process(dt: number): void {
    if (this.anchors.length === 0 && this.pendingCount > 0) {
      this.tryPlacePending();
    }
    if (this.anchors.length === 0) return;

    const zone = this.env.getZone();
    if (!zone.active) return;

    this.keepInsideZone(zone);
    this.separate(this.anchors, zone);

    for (const anchor of this.anchors) {
      if (!anchor.alive) continue;
      if (anchor.spawned >= ANCHOR_MAX_REINFORCEMENTS) continue;
      anchor.spawnT -= dt;
      if (anchor.spawnT > 0) continue;
      anchor.spawnT = ANCHOR_SPAWN_INTERVAL;
      anchor.spawned += 1;
      this.env.spawnReinforcement(anchor);
    }
  }

  /** Нанести урон якорю. Возвращает true, если он уничтожен. */
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

  /** Найти якорь по позиции (для коллизий пуль). */
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

  // ============================== Private ==============================

  /** Поставить якоря, если зона уже активна. */
  private tryPlacePending(): void {
    const zone = this.env.getZone();
    if (!zone.active || zone.radius <= ANCHOR_RADIUS * 2) return;

    const player = this.env.getPlayer();
    const count = this.pendingCount;
    const wave = this.pendingWave;
    const hp = anchorMaxHp(wave);
    // Дальняя от игрока сторона зоны: игрок не должен получать якоря
    // буквально на голове в момент активации.
    const away = Math.atan2(zone.y - player.y, zone.x - player.x);
    const orbit = zone.radius * ANCHOR_ORBIT_FRACTION;
    // Разносим якоря по дуге ±0.75 рад вокруг дальней точки.
    const spread = 0.75;
    const step = count > 1 ? (spread * 2) / (count - 1) : 0;
    const start = away - (count > 1 ? spread : 0);

    this.anchors = [];
    for (let i = 0; i < count; i++) {
      const angle = start + step * i;
      let x = zone.x + Math.cos(angle) * orbit;
      let y = zone.y + Math.sin(angle) * orbit;
      // Слишком близко к игроку — сдвигаем к центру зоны.
      const dist = Math.hypot(x - player.x, y - player.y);
      if (dist < ANCHOR_MIN_PLAYER_DIST) {
        const t = ANCHOR_MIN_PLAYER_DIST / Math.max(1, dist);
        x = player.x + (x - player.x) * t;
        y = player.y + (y - player.y) * t;
      }
      this.anchors.push({
        id: `anchor_${this.nextId++}`,
        x,
        y,
        hp,
        maxHp: hp,
        radius: ANCHOR_RADIUS,
        alive: true,
        wave,
        spawnT: ANCHOR_FIRST_SPAWN_DELAY,
        spawned: 0,
        seed: Math.floor((this.nextId * 97 + wave * 13) % 1000),
        reward: Math.round(hp * 0.15),
      });
    }
    this.keepInsideZone(zone);
    // Разнести якоря при постановке, чтобы они не появлялись друг на друге.
    for (let i = 0; i < this.anchors.length; i++) {
      this.separate(this.anchors, zone);
    }
    this.keepInsideZone(zone);
    this.pendingCount = 0;
    this.pendingWave = 0;
    this.env.onSpawned(this.anchors);
}

  /** Раздвинуть близкие якоря вдоль линии между ними и вернуть в зону. */
  separate(anchors: Anchor[], zone: ZoneData): void {
    const limit = zone.radius * ANCHOR_ZONE_MARGIN;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      if (!a.alive) continue;
      for (let j = i + 1; j < anchors.length; j++) {
        const b = anchors[j];
        if (!b.alive) continue;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy);
        if (dist >= ANCHOR_MIN_SPACING) continue;
        if (dist < 1e-3) { dx = 1; dy = 0; dist = 1; }
        const push = (ANCHOR_MIN_SPACING - dist) / 2;
        a.x -= (dx / dist) * push; a.y -= (dy / dist) * push;
        b.x += (dx / dist) * push; b.y += (dy / dist) * push;
        this._clamp(a, zone, limit);
        this._clamp(b, zone, limit);
      }
    }
  }

  private _clamp(anchor: Anchor, zone: ZoneData, limit: number): void {
    const dx = anchor.x - zone.x, dy = anchor.y - zone.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= limit || dist === 0) return;
    const k = limit / dist;
    anchor.x = zone.x + dx * k; anchor.y = zone.y + dy * k;
  }

  /** Держать живые якоря внутри текущей зоны (сжатие не отрезает цель). */
  keepInsideZone(zone: ZoneData): void {
    const limit = zone.radius * ANCHOR_ZONE_MARGIN;
    for (const anchor of this.anchors) {
      if (!anchor.alive) continue;
      const dx = anchor.x - zone.x;
      const dy = anchor.y - zone.y;
      const dist = Math.hypot(dx, dy);
      if (dist <= limit || dist === 0) continue;
      const k = limit / dist;
      anchor.x = zone.x + dx * k;
      anchor.y = zone.y + dy * k;
    }
  }
}
