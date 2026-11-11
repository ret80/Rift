/**
 * HiveMotherStrategy — мать-улей.
 *
 * Держит дистанцию 0.55R и выпускает по два дрона каждые 6 с (в поздних
 * фазах — чаще). Смена фаз по HP меняет скорость и темп выпуска; сами
 * выстрелы Матери ведёт EnemyShootingSystem.
 */

import {
  HIVE_PHASE2_RATIO,
  HIVE_PHASE3_RATIO,
  HIVE_SPAWN_BATCH,
  HIVE_SPAWN_INTERVAL,
  HIVE_SPAWN_RADIUS,
  HIVE_STANDOFF_R,
} from "../../balance";
import type { EnemyRef } from "../../ecs";
import { TAU } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { keepInsideZone, standoffAngle, steer } from "./ArchetypeMovement";

/** Защита от переполнения арены роем. */
const HIVE_MAX_FIELD = 80;

export class HiveMotherStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const hpRatio = enemy.life.remaining / Math.max(1, enemy.life.max);

    marker.mode =
      hpRatio <= HIVE_PHASE3_RATIO ? 2 : hpRatio <= HIVE_PHASE2_RATIO ? 1 : 0;

    const standoff = context.zoneRadius > 0
      ? context.zoneRadius * HIVE_STANDOFF_R
      : 260;

    const desired = standoffAngle(enemy, context, standoff, marker.strafeDir);
    // Точка впереди по курсу удерживается внутри зоны: улей не должен
    // вжиматься в барьер на поздних волнах, где зона маленькая.
    const target = {
      x: enemy.position.x + Math.cos(desired) * 80,
      y: enemy.position.y + Math.sin(desired) * 80,
    };
    keepInsideZone(target, context, enemy.radius.r + 40);
    const steered = Math.atan2(target.y - enemy.position.y, target.x - enemy.position.x);

    const speedMult = marker.mode === 2 ? 1.15 : marker.mode === 1 ? 1 : 0.85;
    steer(enemy, steered, marker.speed * speedMult, 2.2, dt);

    marker.spawnCd -= dt;
    if (marker.spawnCd > 0) return;
    marker.spawnCd = HIVE_SPAWN_INTERVAL * (marker.mode === 2 ? 0.7 : 1);

    if (context.enemies.length >= HIVE_MAX_FIELD) return;

    const batch = HIVE_SPAWN_BATCH + (marker.mode === 2 ? 1 : 0);
    for (let i = 0; i < batch; i++) {
      const angle = marker.seed + marker.spawnCd + (i / batch) * TAU;
      context.carrierSpawns.push({
        x: enemy.position.x + Math.cos(angle) * HIVE_SPAWN_RADIUS,
        y: enemy.position.y + Math.sin(angle) * HIVE_SPAWN_RADIUS,
        hive: true,
      });
    }
  }
}
