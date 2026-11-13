/**
 * DroneStrategy — движение дрона внутри группы.
 *
 * Групповые решения (направление, слоты, отделение, возврат) принимает
 * DroneSwarm. Стратегия только ведёт дрон к точке строя, атакует игрока
 * в состоянии detached и возвращается в строй по команде координатора.
 *
 * Дроны носителя до выпуска живут на орбите вокруг Carrier: их позицию
 * задаёт носитель, поэтому для них сохраняется отдельная ветка.
 */

import { solveInterceptTime } from "../../aiming/AimSolver";
import type { EnemyRef } from "../../ecs";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { clamp, lerpAngle, smoothVelocity } from "../../math";

/** Скорость в строю, доля от базовой. */
const FORMATION_SPEED_MULT = 0.78;
/** Скорость возврата в группу, доля от базовой. */
const RETURN_SPEED_MULT = 0.95;
/** Скорость атаки отделившегося дрона. */
const DETACH_SPEED_MULT = 1.3;
/** Доворот в строю, рад/с. */
const FORMATION_TURN_RATE = 4;
/** Доворот при возврате, рад/с. */
const RETURN_TURN_RATE = 5;
/** Доворот в атаке, рад/с. */
const DETACH_TURN_RATE = 2.4;
/** Горизонт упреждения в атаке, секунды. */
const LEAD_MAX = 0.6;
/** Ближе этого к слоту дрон переходит на скорость кольца, а не догоняет точку. */
const FORMATION_ARRIVE_RADIUS = 70;

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    if (enemy.marker.droneState === "orbiting") {
      this.updateOrbiting(enemy, context, dt);
      return;
    }

    if (enemy.marker.swarmState === "detached") {
      this.updateDetached(enemy, context, dt);
      return;
    }

    const target = { x: 0, y: 0, vx: 0, vy: 0, speedMult: 1 };
    if (context.swarm?.formationTarget(enemy, context, target)) {
      const returning = enemy.marker.swarmState === "returning";
      const dist = Math.hypot(target.x - enemy.position.x, target.y - enemy.position.y);
      // Чем плотнее группа, тем быстрее её кольцо — и тем быстрее должен
      // лететь дрон, иначе он отстаёт от собственного слота.
      const speedMult =
        (returning ? RETURN_SPEED_MULT : FORMATION_SPEED_MULT) * target.speedMult;
      // Если дрон сильно отстал, догоняем группу быстрее.
      const catchUp = dist > 180 ? 1.15 : 1;
      if (!returning && dist <= FORMATION_ARRIVE_RADIUS) {
        // В строю держим скорость кольца: иначе дрон проскакивает слот,
        // разворачивается и вместе с соседями образует «толкучку».
        smoothVelocity(enemy.velocity, target.vx, target.vy, FORMATION_TURN_RATE, dt);
        this.faceVelocity(enemy, 7, dt);
        return;
      }
      const arrival = Math.min(1, Math.max(0.35, dist / 120));
      this.steerTo(
        enemy,
        target.x,
        target.y,
        enemy.marker.speed * speedMult * catchUp * arrival,
        returning ? RETURN_TURN_RATE : FORMATION_TURN_RATE,
        dt,
      );
      return;
    }

    // Группа ещё не назначена (первый кадр после выпуска из носителя).
    this.updateFallback(enemy, context, dt);
  }

  /** Движение к точке с плавным доворотом скорости и носа. */
  private steerTo(
    enemy: EnemyRef,
    x: number,
    y: number,
    speed: number,
    turnRate: number,
    dt: number,
  ): void {
    const angle = Math.atan2(y - enemy.position.y, x - enemy.position.x);
    smoothVelocity(
      enemy.velocity,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      turnRate,
      dt,
    );
    this.faceVelocity(enemy, 7, dt);
  }

  /** Атака отделившегося дрона: короткое пике на упреждённую точку. */
  private updateDetached(enemy: EnemyRef, context: GameContext, dt: number): void {
    const speed = enemy.marker.speed * DETACH_SPEED_MULT;
    const angle = this.interceptAngle(enemy, context, speed);
    smoothVelocity(
      enemy.velocity,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      DETACH_TURN_RATE,
      dt,
    );
    this.faceVelocity(enemy, 10, dt);
  }

  /** Резерв, пока группа не назначена: обычное преследование. */
  private updateFallback(enemy: EnemyRef, context: GameContext, dt: number): void {
    const speed = enemy.marker.speed * FORMATION_SPEED_MULT;
    const angle = this.interceptAngle(enemy, context, speed);
    smoothVelocity(
      enemy.velocity,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      FORMATION_TURN_RATE,
      dt,
    );
    this.faceVelocity(enemy, 7, dt);
  }

  /** Направить нос по вектору скорости. */
  private faceVelocity(enemy: EnemyRef, rate: number, dt: number): void {
    const vel = enemy.velocity;
    const speed = Math.hypot(vel.vx, vel.vy);
    if (speed <= 5) return;
    const movementAngle = Math.atan2(vel.vy, vel.vx);
    enemy.marker.angle = lerpAngle(enemy.marker.angle, movementAngle, 1 - Math.exp(-rate * dt));
  }

  /** Угол на упреждённую точку встречи с игроком. */
  private interceptAngle(enemy: EnemyRef, context: GameContext, speed: number): number {
    const pos = enemy.position;
    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const t = solveInterceptTime(dx, dy, context.playerVx, context.playerVy, speed);
    const lead = t === null ? 0 : clamp(t, 0, LEAD_MAX);
    return Math.atan2(
      context.playerY + context.playerVy * lead - pos.y,
      context.playerX + context.playerVx * lead - pos.x,
    );
  }

  /** Орбита вокруг Carrier до выпуска. */
  private updateOrbiting(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;
    const carrier = this.findParentById(enemy, context);
    if (!carrier || carrier.marker.dead) {
      // Carrier мёртв — дальше дроном управляет группа.
      marker.droneState = "attacking";
      marker.swarmState = "none";
      return;
    }

    const orbitSpeed = 1.5; // радиан в секунду
    const dir = marker.strafeDir >= 0 ? 1 : -1;
    marker.orbitAngle += orbitSpeed * dir * dt;

    pos.x = carrier.position.x + Math.cos(marker.orbitAngle) * marker.orbitRadius;
    pos.y = carrier.position.y + Math.sin(marker.orbitAngle) * marker.orbitRadius;

    const tangentX = -Math.sin(marker.orbitAngle) * dir;
    const tangentY = Math.cos(marker.orbitAngle) * dir;
    vel.vx = tangentX * marker.speed;
    vel.vy = tangentY * marker.speed;
    marker.angle = Math.atan2(vel.vy, vel.vx);
  }

  /** Найти живого родителя (Carrier) по parentId из списка врагов контекста. */
  private findParentById(enemy: EnemyRef, context: GameContext): EnemyRef | null {
    const parentId = enemy.marker.parentId;
    if (parentId === null || parentId === undefined) return null;
    for (const o of context.enemies) {
      if (o.marker.ecsId === parentId) return o;
    }
    return null;
  }
}
