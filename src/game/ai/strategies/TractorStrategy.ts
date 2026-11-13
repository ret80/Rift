/**
 * TractorStrategy — тягач.
 *
 * Работает как кран: облетает край зоны, выбирает пролетающий камень,
 * разворачивается к нему, захватывает двумя лучами и тащит перед собой
 * внутрь зоны. Там разворачивается к игроку и даёт камню импульс в его
 * сторону. Камень держится не позицией, а пружиной скорости: физика не
 * выбрасывается из цикла, а камень остаётся обычным телом.
 *
 * Состояния в marker.mode:
 *   0 — облёт края и поиск камня;
 *   1 — перехват выбранного камня;
 *   2 — буксировка камня к внутренней точке зоны;
 *   3 — прицел на игрока и запуск.
 *
 * Удерживаемый камень медленнее порога AsteroidAvoidance, поэтому союзники
 * не шарахаются от «приманки», а уклоняются только от запущенного камня.
 */

import {
  TRACTOR_AIM_TIME,
  TRACTOR_CAPTURE_DIST,
  TRACTOR_DETECT_RANGE,
  TRACTOR_FIRE_CD,
  TRACTOR_HOLD_R,
  TRACTOR_INNER_R,
  TRACTOR_LAUNCH_SPEED,
  TRACTOR_TOW_DIST,
  EnemyKind,
} from "../../balance";
import type { AsteroidRef, EnemyRef } from "../../ecs";
import { clamp, lerpAngle, smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { steer } from "./ArchetypeMovement";

const PATROL = 0;
const APPROACH = 1;
const TOW = 2;
const AIM = 3;

/** Сколько секунд тягач пытается догнать камень, прежде чем бросить его. */
const APPROACH_TIMEOUT = 5;
/** Насколько далеко камень может уйти от точки удержания, прежде чем сорвётся. */
const TOW_BREAK_DIST = 300;
/** Предел скорости, с которой камень следует за точкой удержания, px/с. */
const TOW_MAX_SPEED = 700;

export class TractorStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    if (
      marker.mode !== PATROL &&
      marker.mode !== APPROACH &&
      marker.mode !== TOW &&
      marker.mode !== AIM
    ) {
      marker.mode = PATROL;
      marker.modeT = 0;
      marker.tractorTargetId = null;
    }
    marker.fireCd = Math.max(0, marker.fireCd - dt);

    if (marker.mode === PATROL) {
      marker.telegraphActive = false;
      this.holdEdge(enemy, context, dt);
      if (marker.fireCd > 0) return;

      const rock = this.pickTarget(enemy, context);
      if (!rock) return;
      marker.tractorTargetId = rock.entity.id;
      marker.mode = APPROACH;
      marker.modeT = APPROACH_TIMEOUT;
      return;
    }

    const rock = this.targetRock(enemy, context);
    if (!rock) {
      this.release(enemy);
      return;
    }

    if (marker.mode === APPROACH) {
      this.approach(enemy, context, rock, dt);
      return;
    }

    if (marker.mode === TOW) {
      this.tow(enemy, context, rock, dt);
      return;
    }

    this.aim(enemy, context, rock, dt);
  }

  /** Внешняя орбита: облёт края зоны в выбранную сторону. */
  private holdEdge(enemy: EnemyRef, context: GameContext, dt: number): void {
    const dx = enemy.position.x - context.zoneX;
    const dy = enemy.position.y - context.zoneY;
    const dist = Math.hypot(dx, dy);
    const hold = Math.max(80, context.zoneRadius * TRACTOR_HOLD_R);
    const bearing =
      dist > 1
        ? Math.atan2(dy, dx)
        : Math.atan2(context.playerY - context.zoneY, context.playerX - context.zoneX);

    const tangent = bearing + (Math.PI / 2) * enemy.marker.strafeDir;
    const radial = dist < hold ? bearing : bearing + Math.PI;
    const mix = clamp(Math.abs(hold - dist) / 140, 0, 1);
    const desired = lerpAngle(tangent, radial, mix);

    steer(enemy, desired, enemy.marker.speed, 2.1, dt);
  }

  /** Ближайший свободный камень в радиусе поиска. */
  private pickTarget(enemy: EnemyRef, context: GameContext): AsteroidRef | null {
    let best: AsteroidRef | null = null;
    let bestDist = TRACTOR_DETECT_RANGE;

    for (const rock of context.asteroids) {
      if (rock.marker.dead) continue;
      // Камень должен лететь: неподвижная глыба — не «пролетающий» астероид.
      if (Math.hypot(rock.velocity.vx, rock.velocity.vy) < 40) continue;

      const dist = Math.hypot(
        rock.position.x - enemy.position.x,
        rock.position.y - enemy.position.y,
      );
      if (dist >= bestDist) continue;
      if (this.claimedByAlly(rock, enemy, context)) continue;

      bestDist = dist;
      best = rock;
    }
    return best;
  }

  /** Камень уже тащит другой тягач. */
  private claimedByAlly(
    rock: AsteroidRef,
    enemy: EnemyRef,
    context: GameContext,
  ): boolean {
    for (const other of context.enemies) {
      if (other === enemy || other.marker.dead) continue;
      if (other.marker.kind !== EnemyKind.Tractor) continue;
      if (other.marker.tractorTargetId === rock.entity.id) return true;
    }
    return false;
  }

  /** Захваченный камень по id; null — цель потеряна. */
  private targetRock(enemy: EnemyRef, context: GameContext): AsteroidRef | null {
    const id = enemy.marker.tractorTargetId;
    if (id === null) return null;
    const rock = context.asteroids.find((a) => a.entity.id === id);
    return rock && !rock.marker.dead ? rock : null;
  }

  /** Перехват: летим в упреждённую точку камня. */
  private approach(
    enemy: EnemyRef,
    context: GameContext,
    rock: AsteroidRef,
    dt: number,
  ): void {
    const marker = enemy.marker;
    marker.modeT -= dt;

    const dx = rock.position.x - enemy.position.x;
    const dy = rock.position.y - enemy.position.y;
    const dist = Math.hypot(dx, dy);

    if (dist <= TRACTOR_CAPTURE_DIST) {
      // Камень больше не принадлежит поясу: его держат лучи тягача.
      rock.marker.beltState = "none";
      marker.mode = TOW;
      marker.modeT = 0;
      return;
    }
    if (marker.modeT <= 0 || dist > TRACTOR_DETECT_RANGE * 1.7) {
      this.release(enemy);
      return;
    }

    // Упреждение по скорости камня: тягач летит наперерез, а не вдогонку.
    const flight = clamp(dist / Math.max(80, marker.speed), 0, 1.2);
    const tx = rock.position.x + rock.velocity.vx * flight * 0.6;
    const ty = rock.position.y + rock.velocity.vy * flight * 0.6;
    marker.lockAngle = Math.atan2(dy, dx);
    steer(
      enemy,
      Math.atan2(ty - enemy.position.y, tx - enemy.position.x),
      marker.speed,
      3.4,
      dt,
    );
  }

  /** Буксировка камня к внутренней точке зоны. */
  private tow(
    enemy: EnemyRef,
    context: GameContext,
    rock: AsteroidRef,
    dt: number,
  ): void {
    const marker = enemy.marker;
    const target = this.innerPoint(enemy, context);
    steer(
      enemy,
      Math.atan2(target.y - enemy.position.y, target.x - enemy.position.x),
      marker.speed,
      3.0,
      dt,
    );
    this.holdRock(enemy, rock, dt);
    marker.lockAngle = Math.atan2(
      rock.position.y - enemy.position.y,
      rock.position.x - enemy.position.x,
    );

    const lost = Math.hypot(
      rock.position.x - enemy.position.x,
      rock.position.y - enemy.position.y,
    );
    if (lost > TRACTOR_TOW_DIST + TOW_BREAK_DIST) {
      this.release(enemy);
      return;
    }

    if (
      Math.hypot(target.x - enemy.position.x, target.y - enemy.position.y) < 70
    ) {
      marker.mode = AIM;
      marker.modeT = TRACTOR_AIM_TIME;
    }
  }

  /** Прицел на игрока: корпус и камень разворачиваются на цель, затем запуск. */
  private aim(
    enemy: EnemyRef,
    context: GameContext,
    rock: AsteroidRef,
    dt: number,
  ): void {
    const marker = enemy.marker;
    smoothVelocity(enemy.velocity, 0, 0, 6, dt);

    const toPlayer = Math.atan2(
      context.playerY - enemy.position.y,
      context.playerX - enemy.position.x,
    );
    marker.angle = lerpAngle(marker.angle, toPlayer, 1 - Math.exp(-6 * dt));
    marker.lockAngle = marker.angle;

    this.holdRock(enemy, rock, dt, marker.angle);

    marker.modeT -= dt;
    marker.telegraphActive = true;
    marker.telegraphType = "line";
    marker.telegraphAngle = toPlayer;
    marker.telegraphTimer = Math.max(0.05, marker.modeT);

    if (marker.modeT > 0) return;

    this.launch(enemy, context, rock);
    marker.telegraphActive = false;
    marker.telegraphTimer = 0;
    marker.tractorTargetId = null;
    marker.mode = PATROL;
    marker.modeT = 0;
    marker.fireCd = TRACTOR_FIRE_CD;
  }

  /** Точка внутри зоны на текущем радиальном направлении тягача. */
  private innerPoint(
    enemy: EnemyRef,
    context: GameContext,
  ): { x: number; y: number } {
    const dx = enemy.position.x - context.zoneX;
    const dy = enemy.position.y - context.zoneY;
    const dist = Math.hypot(dx, dy) || 1;
    const radius = Math.max(60, context.zoneRadius * TRACTOR_INNER_R);
    return {
      x: context.zoneX + (dx / dist) * radius,
      y: context.zoneY + (dy / dist) * radius,
    };
  }

  /**
   * Удержать камень перед корпусом.
   *
   * Камень висит на лучах кинематически: позиция ставится в точку
   * удержания, а скорость считается из перемещения этой точки. Пружина
   * скорости не годится: тягач летит быстрее, чем успевал бы камень, и
   * тот отрывался назад. Здесь камень не может отстать по построению.
   *
   * @param heading направление удержания; по умолчанию — курс корпуса
   */
  private holdRock(
    enemy: EnemyRef,
    rock: AsteroidRef,
    dt: number,
    heading = enemy.marker.angle,
  ): void {
    const holdX =
      enemy.position.x + Math.cos(heading) * (TRACTOR_TOW_DIST + rock.radius.r);
    const holdY =
      enemy.position.y + Math.sin(heading) * (TRACTOR_TOW_DIST + rock.radius.r);
    const step = Math.max(dt, 1 / 240);

    let vx = (holdX - rock.position.x) / step;
    let vy = (holdY - rock.position.y) / step;
    const speed = Math.hypot(vx, vy);
    if (speed > TOW_MAX_SPEED) {
      const k = TOW_MAX_SPEED / speed;
      vx *= k;
      vy *= k;
    }

    rock.position.x = holdX;
    rock.position.y = holdY;
    rock.velocity.vx = vx;
    rock.velocity.vy = vy;
  }

  /** Импульс камню в упреждённую точку игрока. */
  private launch(
    enemy: EnemyRef,
    context: GameContext,
    rock: AsteroidRef,
  ): void {
    const angle = this.aimAngle(enemy, context, rock);
    rock.marker.beltState = "none";
    rock.velocity.vx = Math.cos(angle) * TRACTOR_LAUNCH_SPEED;
    rock.velocity.vy = Math.sin(angle) * TRACTOR_LAUNCH_SPEED;
  }

  /**
   * Угол на упреждённую позицию игрока: камень летит со своей скоростью,
   * поэтому точка встречи уточняется двумя итерациями.
   */
  private aimAngle(
    enemy: EnemyRef,
    context: GameContext,
    rock: AsteroidRef,
  ): number {
    let tx = context.playerX;
    let ty = context.playerY;
    for (let i = 0; i < 2; i++) {
      const flight =
        Math.hypot(tx - rock.position.x, ty - rock.position.y) /
        TRACTOR_LAUNCH_SPEED;
      tx = context.playerX + context.playerVx * flight;
      ty = context.playerY + context.playerVy * flight;
    }
    return Math.atan2(ty - rock.position.y, tx - rock.position.x);
  }

  /** Бросить цель и вернуться к облёту края. */
  private release(enemy: EnemyRef): void {
    enemy.marker.tractorTargetId = null;
    enemy.marker.mode = PATROL;
    enemy.marker.modeT = 0;
    enemy.marker.telegraphActive = false;
  }
}
