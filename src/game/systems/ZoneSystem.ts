/**
 * ZoneSystem — централизованное управление зоной.
 * Отвечает за:
 *  1. Clamp игрока к границе зоны (отталкивание обратно)
 *  2. Clamp врагов к границе зоны (удержание внутри)
 *  3. Применение ограничений зоны для астероидов и врагов
 */

import {
  ZONE_ASTEROID_PUSH_FORCE,
  ZONE_ENEMY_PUSH_FORCE_COEFF,
  ZONE_ENEMY_PUSH_FORCE_MAX,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import type { Enemy } from "../types";

/* ============================== Types ============================== */

export interface ZoneSystemConfig {
  /** authoritative zone state from WaveOrchestrator */
  getZoneState: () => ZoneData;
  /** mutable player position+velocity for clamp */
  getPlayerRef: () => { x: number; y: number; vx: number; vy: number };
  /** reference to enemy list for constraints */
  getEnemyList: () => Enemy[];
  /** reference to asteroids for constraints */
  getAsteroids: () => Array<{ x: number; y: number; r: number; vx: number; vy: number }>;
}

/* ============================== ZoneSystem ============================== */

export class ZoneSystem {
  private config: ZoneSystemConfig;

  constructor(config: ZoneSystemConfig) {
    this.config = config;
  }

  /**
   * Обновить все аспекты зоны: clamp, ограничения.
   * Вызывается каждый кадр во время active/cleared состояний.
   */
  update(dt: number): void {
    const zone = this.config.getZoneState();

    // Skip zone logic if not active
    if (!zone.active || zone.radius <= 0) return;

    // Clamp player to zone boundary
    this.clampPlayer(zone);

    // Clamp enemies to zone boundary
    this.clampEnemies(zone);

    // Apply zone constraints (asteroids out, enemies in)
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

  /**
   * Clamp all enemies to zone boundary.
   * Pushes enemies back inside if outside, reflects outward velocity.
   */
  clampEnemies(zone: ZoneData): void {
    const enemies = this.config.getEnemyList();

    for (const enemy of enemies) {
      if (enemy.dead) continue;

      const dx = enemy.x - zone.x;
      const dy = enemy.y - zone.y;
      const dist = Math.hypot(dx, dy);
      const limit = zone.radius - (enemy.r || 15);

      if (dist > limit) {
        const angle = Math.atan2(dy, dx);
        // Hard position reset to boundary
        enemy.x = zone.x + Math.cos(angle) * limit;
        enemy.y = zone.y + Math.sin(angle) * limit;

        // Reflect velocity
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const dot = enemy.vx * nx + enemy.vy * ny;
        if (dot > 0) {
          enemy.vx -= 2 * dot * nx;
          enemy.vy -= 2 * dot * ny;
        }
      }
    }
  }

  // ============================== Constraints ==============================

  /**
   * Apply zone constraints:
   *  - Asteroids: push OUT of zone if inside boundary
   *  - Enemies: push IN to zone if outside boundary
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

    // Constrain enemies - keep them inside the zone
    const enemies = this.config.getEnemyList();
    for (const enemy of enemies) {
      if (enemy.dead) continue;

      const edx = enemy.x - zoneCenterX;
      const edy = enemy.y - zoneCenterY;
      const dist = Math.hypot(edx, edy);
      const enemyR = enemy.r || 15;

      // If enemy is outside zone boundary, push it back inside
      if (dist > zoneRadius - enemyR) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const penetration = dist - (zoneRadius - enemyR);
        const pushForce = Math.min(
          penetration * ZONE_ENEMY_PUSH_FORCE_COEFF,
          ZONE_ENEMY_PUSH_FORCE_MAX
        );
        enemy.vx -= (edx * pushDir) * pushForce * dt;
        enemy.vy -= (edy * pushDir) * pushForce * dt;
      }
    }
  }
}
