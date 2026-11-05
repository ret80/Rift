/**
 * EnemyAvoidance — сменный решатель мягкого расталкивания врагов.
 *
 * Система не толкает врагов импульсами: она разводит их позиции на долю
 * перекрытия, поэтому AI-стратегии не борются с avoidance каждый кадр.
 * Насколько сильно двигать каждого участника, задаёт профиль вида:
 *   - размер (radius) определяет минимальную дистанцию;
 *   - padding оставляет визуальный зазор между корпусами;
 *   - mobility показывает, насколько корпус уступает давлению (дрон — 1,
 *     носитель — почти 0);
 *   - maxStep ограничивает перемещение за кадр, чтобы не было телепортов.
 *
 * Орбитальные дроны носителя кинематические: их позицию задаёт CarrierStrategy,
 * поэтому они выступают неподвижными препятствиями, а не толкаются.
 */

import { EnemyKind } from "../balance";
import type { EnemyRef } from "../ecs";

export interface AvoidanceProfile {
  /** Дополнительный зазор сверх суммы радиусов, px. */
  padding: number;
  /** Подвижность: 0 — неподвижный, 1 — легко уступает. */
  mobility: number;
  /** Максимальное смещение за кадр, px. */
  maxStep: number;
}

export interface IEnemyAvoidance {
  /** Развести пересекающиеся корпуса врагов. */
  solve(enemies: EnemyRef[]): void;
}

const DEFAULT_PROFILES: Record<EnemyKind, AvoidanceProfile> = {
  // Дроны летают строем: зазор маленький, но строй обязан быть шире него.
  [EnemyKind.Drone]: { padding: 2, mobility: 1, maxStep: 6 },
  // Хантер — лёгкий и быстрый, уступает почти полностью.
  [EnemyKind.Hunter]: { padding: 6, mobility: 1, maxStep: 6 },
  // Истребитель крупнее, но всё ещё манёвренный.
  [EnemyKind.Fighter]: { padding: 7, mobility: 0.85, maxStep: 6 },
  // Крейсер — тяжёлый корабль: расходится медленно и неохотно.
  [EnemyKind.Cruiser]: { padding: 16, mobility: 0.3, maxStep: 5 },
  // Носитель почти не смещается, его обходят остальные.
  [EnemyKind.Carrier]: { padding: 26, mobility: 0.08, maxStep: 4 },
  // Минёр — средний корпус, но держится в стороне от толпы.
  [EnemyKind.Miner]: { padding: 10, mobility: 0.7, maxStep: 5 },
  // Босс — почти неподвижная масса: его обходят остальные.
  [EnemyKind.Boss]: { padding: 34, mobility: 0.04, maxStep: 3 },
  // Мина неподвижна: её обходят, а не она.
  [EnemyKind.Mine]: { padding: 0, mobility: 0, maxStep: 0 },
};

/** Доля перекрытия, которая исправляется за один кадр. */
const SEPARATION_STRENGTH = 0.55;
/** Меньшие перекрытия игнорируются, чтобы не дрожать. */
const MIN_OVERLAP = 0.5;

export class EnemyAvoidance implements IEnemyAvoidance {
  private readonly profiles: Record<EnemyKind, AvoidanceProfile>;

  constructor(overrides: Partial<Record<EnemyKind, Partial<AvoidanceProfile>>> = {}) {
    this.profiles = { ...DEFAULT_PROFILES };
    for (const kind of Object.keys(overrides) as EnemyKind[]) {
      this.profiles[kind] = { ...this.profiles[kind], ...overrides[kind] };
    }
  }

  solve(enemies: EnemyRef[]): void {
    for (let i = 0; i < enemies.length; i++) {
      const a = enemies[i];
      if (a.marker.dead) continue;

      for (let j = i + 1; j < enemies.length; j++) {
        const b = enemies[j];
        if (b.marker.dead) continue;

        // Свои дроны на орбите не должны расталкивать носитель.
        if (a.marker.parentId !== null && a.marker.parentId === b.marker.ecsId) continue;
        if (b.marker.parentId !== null && b.marker.parentId === a.marker.ecsId) continue;

        const aOrbiting = a.marker.droneState === "orbiting";
        const bOrbiting = b.marker.droneState === "orbiting";
        // Два кинематических дрона на одной орбите разводит CarrierStrategy.
        if (aOrbiting && bOrbiting) continue;

        const profileA = this.profileFor(a);
        const profileB = this.profileFor(b);
        const mobilityA = aOrbiting ? 0 : profileA.mobility;
        const mobilityB = bOrbiting ? 0 : profileB.mobility;
        if (mobilityA <= 0 && mobilityB <= 0) continue;

        const dx = a.position.x - b.position.x;
        const dy = a.position.y - b.position.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= 0.0001) continue;

        const minDist =
          a.radius.r + b.radius.r + profileA.padding + profileB.padding;
        const dist = Math.sqrt(distSq);
        const overlap = minDist - dist;
        if (overlap <= MIN_OVERLAP) continue;

        const nx = dx / dist;
        const ny = dy / dist;
        const totalMobility = mobilityA + mobilityB;
        const correction = overlap * SEPARATION_STRENGTH;
        const aShare = mobilityA / totalMobility;
        const bShare = mobilityB / totalMobility;

        const aStep = Math.min(correction * aShare, profileA.maxStep);
        const bStep = Math.min(correction * bShare, profileB.maxStep);

        a.position.x += nx * aStep;
        a.position.y += ny * aStep;
        b.position.x -= nx * bStep;
        b.position.y -= ny * bStep;
      }
    }
  }

  private profileFor(enemy: EnemyRef): AvoidanceProfile {
    return this.profiles[enemy.marker.kind];
  }
}
