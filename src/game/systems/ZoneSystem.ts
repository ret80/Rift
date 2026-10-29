/**
 * ZoneSystem — централизованное управление зоной.
 * Отвечает за:
 *  1. Clamp игрока к границе зоны (отталкивание обратно)
 *  2. Применение ограничений зоны для астероидов (выталкивание наружу)
 *
 * Кламп/ограничение врагов вынесено в ECS-систему ZoneClampSystem,
 * которая исполняется после шага физики (см. EcsWorld.clampEnemiesToZone).
 */

import { System } from "@trixt0r/ecs";
import { ZONE_ASTEROID_PUSH_FORCE } from "../balance";
import type { ZoneData } from "../core/ZoneTypes";

/* ============================== Types ============================== */

export interface ZoneSystemConfig {
  /** authoritative zone state from WaveOrchestrator */
  getZoneState: () => ZoneData;
  /** mutable player position+velocity for clamp */
  getPlayerRef: () => { x: number; y: number; vx: number; vy: number };
  /** reference to asteroids for constraints */
  getAsteroids: () => Array<{ x: number; y: number; r: number; vx: number; vy: number }>;
}

/* ============================== ZoneSystem ============================== */

export class ZoneSystem extends System {
  private config: ZoneSystemConfig;

  constructor(config: ZoneSystemConfig) {
    super(10); // после waveFlow (9), до ZoneClamp (11)
    this.config = config;
  }

  /**
   * Обновить аспекты зоны, относящиеся к игроку и астероидам.
   * Кламп врагов вынесен в ECS-систему ZoneClampSystem (см. EcsWorld.
   * clampEnemiesToZone) — он исполняется после шага физики.
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
    const dx = playerRef.x - zone.x;
    const dy = playerRef.y - zone.y;
    const dist = Math.hypot(dx, dy);
    // Player clamp uses full zone radius (no overdrive extension)
    const limit = zone.radius;

    if (dist > limit) {
      const angle = Math.atan2(dy, dx);
      // Hard position reset to boundary
      playerRef.x = zone.x + Math.cos(angle) * limit;
      playerRef.y = zone.y + Math.sin(angle) * limit;

      // Reflect velocity: v -= 2 * (v·n) * n
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const dot = playerRef.vx * nx + playerRef.vy * ny;
      if (dot > 0) {
        playerRef.vx -= 2 * dot * nx;
        playerRef.vy -= 2 * dot * ny;
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
      const adx = asteroid.x - zoneCenterX;
      const ady = asteroid.y - zoneCenterY;
      const dist = Math.hypot(adx, ady);

      // If asteroid is inside zone boundary, push it out strongly
      if (dist < zoneRadius - asteroid.r * 0.5) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const pushForce =
          (zoneRadius - asteroid.r * 0.5 - dist) * ZONE_ASTEROID_PUSH_FORCE;
        asteroid.vx += (adx * pushDir) * pushForce;
        asteroid.vy += (ady * pushDir) * pushForce;
      }
    }
  }
}
