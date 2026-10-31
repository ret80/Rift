/**
 * ZoneSystem — централизованное управление зоной.
 * Отвечает за:
 *  1. Clamp игрока к границе зоны (отталкивание обратно)
 *  2. Применение ограничений зоны для астероидов (выталкивание наружу)
 *
 * Кламп/ограничение врагов вынесено в ECS-систему ZoneClampSystem,
 * которая исполняется с приоритетом 11 — после шага физики.
 */

import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
import { ZONE_ASTEROID_PUSH_FORCE } from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import type { AsteroidRef, PlayerRef } from "../ecs";

/* ============================== Types ============================== */

export interface ZoneSystemConfig {
  /** authoritative zone state from WaveOrchestrator */
  getZoneState: () => ZoneData;
  /** live player components for clamp (позиция/скорость — базовые компоненты) */
  getPlayerRef: () => PlayerRef | null;
  /** reference to asteroids for constraints (живые связки базовых компонентов) */
  getAsteroids: () => AsteroidRef[];
}

/* ============================== ZoneSystem ============================== */

export class ZoneSystem extends PhasedSystem {
  private config: ZoneSystemConfig;

  constructor(config: ZoneSystemConfig) {
    super(Phase.Wave);
    this.config = config;
  }

  /**
   * Обновить аспекты зоны, относящиеся к игроку и астероидам.
   * Кламп врагов вынесен в ECS-систему ZoneClampSystem (приоритет 11,
   * после шага физики).
   */
  process(dt: number): void {
    this.update(dt);
  }

  /**
   * Обновить аспекты зоны, относящиеся к игроку и астероидам.
   */
  update(dt: number): void {
    const zone = this.config.getZoneState();

    // Skip zone logic if not active
    if (!zone.active || zone.radius <= 0) return;

    // Clamp player to zone boundary
    this.clampPlayer(zone);

    // Apply zone constraints (asteroids out)
    this.applyZoneConstraints(dt, zone);
  }

  // ============================== Clamp ==============================

  /**
   * Clamp player to zone boundary.
   * Pushes player back inside if outside, reflects outward velocity.
   */
  clampPlayer(zone: ZoneData): void {
    const playerRef = this.config.getPlayerRef();
    if (!playerRef) return;
    const position = playerRef.position;
    const velocity = playerRef.velocity;
    const dx = position.x - zone.x;
    const dy = position.y - zone.y;
    const dist = Math.hypot(dx, dy);
    // Player clamp uses full zone radius (no overdrive extension)
    const limit = zone.radius;

    if (dist > limit) {
      const angle = Math.atan2(dy, dx);
      // Hard position reset to boundary
      position.x = zone.x + Math.cos(angle) * limit;
      position.y = zone.y + Math.sin(angle) * limit;

      // Reflect velocity: v -= 2 * (v·n) * n
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const dot = velocity.vx * nx + velocity.vy * ny;
      if (dot > 0) {
        velocity.vx -= 2 * dot * nx;
        velocity.vy -= 2 * dot * ny;
      }
    }
  }

  // ============================== Constraints ==============================

  /**
   * Apply zone constraints:
   *  - Asteroids: push OUT of zone if inside boundary
   *  - Enemies: handled in ZoneClampSystem (ECS) after physics
   */
  applyZoneConstraints(dt: number, zone: ZoneData): void {
    const zoneRadius = zone.radius;
    const zoneCenterX = zone.x;
    const zoneCenterY = zone.y;

    // Constrain asteroids - keep them outside the zone
    const asteroids = this.config.getAsteroids();
    for (const asteroid of asteroids) {
      const { position, velocity, radius } = asteroid;
      const adx = position.x - zoneCenterX;
      const ady = position.y - zoneCenterY;
      const dist = Math.hypot(adx, ady);

      // If asteroid is inside zone boundary, push it out strongly
      if (dist < zoneRadius - radius.r * 0.5) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const pushForce =
          (zoneRadius - radius.r * 0.5 - dist) * ZONE_ASTEROID_PUSH_FORCE;
        velocity.vx += (adx * pushDir) * pushForce;
        velocity.vy += (ady * pushDir) * pushForce;
      }
    }
  }
}
