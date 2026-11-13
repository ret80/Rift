/**
 * ZoneSystem — централизованное управление зоной.
 * Отвечает за:
 *  1. Выталкивание астероидов из игровой области (зона для них непроницаема).
 *  2. Притяжение врагов к центру вынесено в ECS-систему ZoneEnemyPullSystem.
 *
 * Игрок зону игнорирует: никакого клампа и отражения скорости нет. За выход
 * из зоны отвечает ZoneEdgeDamage (урон + предупреждение).
 */

import { PhasedSystem, Phase } from "../SystemSchedule";
import { ZONE_ASTEROID_PUSH_FORCE } from "../../balance";
import type { ZoneData } from "../../core/ZoneTypes";
import type { AsteroidRef } from "..";

/* ============================== Types ============================== */

export interface ZoneSystemConfig {
  /** authoritative zone state from WaveOrchestrator */
  getZoneState: () => ZoneData;
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
   * Обновить аспекты зоны, относящиеся к астероидам.
   */
  process(dt: number): void {
    this.update(dt);
  }

  /**
   * Обновить аспекты зоны, относящиеся к астероидам.
   */
  update(dt: number): void {
    const zone = this.config.getZoneState();

    // Skip zone logic if not active
    if (!zone.active || zone.radius <= 0) return;

    // Apply zone constraints (asteroids out)
    this.applyZoneConstraints(dt, zone);
  }

  // ============================== Constraints ==============================

  /**
   * Apply zone constraints:
   *  - Asteroids: push OUT of zone if inside boundary
   *  - Enemies: handled in ZoneEnemyPullSystem (ECS) after physics
   */
  applyZoneConstraints(dt: number, zone: ZoneData): void {
    const zoneRadius = zone.radius;
    const zoneCenterX = zone.x;
    const zoneCenterY = zone.y;

    // Constrain asteroids - keep them outside the zone
    const asteroids = this.config.getAsteroids();
    for (const asteroid of asteroids) {
      const { position, velocity, radius, marker } = asteroid;
      // Камень в лучах и запущенный снаряд — часть атаки, а не препятствие зоны.
      if (marker.towed || marker.launched) continue;
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
