/**
 * FighterStrategy — истребитель «патруль, поиск, срез орбиты, заход, выстрел,
 * вираж, пауза».
 *
 * Состояния (marker.mode):
 *   PATROL   (0) — облёт зоны по кольцу, игрок ещё не обнаружен.
 *   SEARCH   (1) — игрок в радиусе обнаружения: держит дистанцию, облетает
 *                  его и ждёт удачного момента.
 *   ATTACK   (2) — летит в точку упреждения болта, доворачивая линию огня.
 *   FIRE     (3) — один кадр: ставит заявку marker.fireGate.
 *   EVADE    (4) — вираж в сторону от игрока, чтобы не столкнуться с ним.
 *   COOLDOWN (5) — короткий свободный полёт без наведения и огня.
 *   CUT      (6) — срез орбиты: игрок кружит, истребитель заходит внутрь
 *                  круга и держится впереди по направлению обхода.
 *
 * Почему CUT. Зона — круг, поэтому самый безопасный полёт игрока — облёт по
 * кругу: болт, пущенный по линейному упреждению, за время полёта уходит
 * мимо, потому что цель поворачивает. Снаружи истребитель обогнать игрока
 * по углу не может (его скорость 0.9 от скорости игрока), поэтому он идёт
 * на внутреннее кольцо орбиты: с радиуса ~0.55R его угловая скорость выше,
 * он садится впереди игрока и держит его на линии огня, вынуждая либо
 * биться об него, либо ломать облёт.
 *
 * Выстрел создаёт EnemyShootingSystem, но только по заявке fireGate: она
 * открывается, когда solveFireWindow подтверждает, что болт, пущенный по
 * упреждению, долетит до игрока и не погаснет о край зоны. Если игрок
 * кружит, упреждение считается по дуге курса (predictArc), а не по прямой —
 * иначе подтверждённое окно было бы геометрической фикцией.
 * Заявка живёт один кадр: стратегия (фаза Enemies) ставит её, стрельба
 * (фаза EnemyActions) снимает; не снятая заявка сгорает на следующем кадре.
 *
 * Рассеивание при выстреле остаётся: заявка гарантирует геометрию, а меткость
 * по волнам (balance/accuracy) всё ещё может увести болт в сторону.
 */

import {
  type FireWindow,
  solveFireWindow,
  solveInterceptTime,
  solveLead,
} from '../../aiming/AimSolver';
import {
  FIGHTER_ATTACK_TIMEOUT,
  FIGHTER_BOLT_SPEED,
  FIGHTER_BREAK_DIST,
  FIGHTER_CIRCLE_OMEGA,
  FIGHTER_COMMIT_RANGE,
  FIGHTER_COMMIT_TIME,
  FIGHTER_COOLDOWN_TIME,
  FIGHTER_CUT_DIST,
  FIGHTER_CUT_LEAD,
  FIGHTER_CUT_RADIUS,
  FIGHTER_CUT_ZONE_MARGIN,
  FIGHTER_DETECT_RANGE,
  FIGHTER_EVADE_DIST,
  FIGHTER_EVADE_MIN_TIME,
  FIGHTER_EVADE_TIME,
  FIGHTER_FIRE_KEEP_DIST,
  FIGHTER_FIRE_MAX_TIME,
  FIGHTER_FIRE_MIN_ANGULAR,
  FIGHTER_FIRE_MIN_TIME,
  FIGHTER_FREE_DRIFT,
  FIGHTER_PATROL_RING,
  FIGHTER_PATROL_STEP,
  FIGHTER_STANDOFF,
  FIGHTER_STANDOFF_BAND,
  PLAYER_BULLET_HIT_OFFSET,
  PLAYER_HITBOX_RADIUS,
} from '../../balance';
import type { EnemyRef } from '../../ecs';
import type { EnemyComponent } from '../../ecs/components/EnemyComponent';
import { clamp, lerpAngle, smoothVelocity } from '../../math';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

/** Состояния поведения истребителя. */
const PATROL = 0;
const SEARCH = 1;
const ATTACK = 2;
const FIRE = 3;
const EVADE = 4;
const COOLDOWN = 5;
const CUT = 6;

/** Внешний радиус хитбокса игрока — он же угловой размер цели для прицела. */
const PLAYER_HIT_RADIUS = PLAYER_HITBOX_RADIUS + PLAYER_BULLET_HIT_OFFSET;

/** Минимальный радиус зоны, при котором она считается действующей границей. */
const MIN_ZONE_RADIUS = 40;

// Отворачивание от края зоны
const AVOID_ZONE_RADIUS = 160; // радиус, на котором начинается избегание
const AVOID_HARD = 60;         // ближе — движение у края полностью по касательной

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// Сглаживание рампы (smoothstep)
const smooth01 = (v: number) => v * v * (3 - 2 * v);

export class FighterStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { playerX, playerY, zoneX, zoneY, zoneRadius } = context;
    const pos = enemy.position;
    const vel = enemy.velocity;
    const marker = enemy.marker;

    const dx = playerX - pos.x;
    const dy = playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);
    // Пока игрок снаружи, враги не обязаны держаться внутри: их возвращает
    // только ZoneEnemyPullSystem. Иначе ИИ боролся бы с притяжением.
    const hasZone = zoneRadius > MIN_ZONE_RADIUS && !context.playerOutsideZone;

    // Игрок летит по дуге достаточно круто, чтобы линейный прогноз врал.
    const circling = Math.abs(context.playerTurnRate) >= FIGHTER_CIRCLE_OMEGA;

    // Заявка на выстрел живёт один кадр (см. шапку стратегии).
    marker.fireGate = false;

    this.updateState(enemy, context, dt, dist, angleToPlayer, circling);

    // --- Целевой угол движения по текущему состоянию ---
    let targetMoveAngle = marker.angle;
    let speed = marker.speed;
    let turnRate = 1 - Math.exp(-4.2 * dt);

    switch (marker.mode) {
      case PATROL: {
        // Облёт зоны по кольцу: цель — точка на дуге впереди по курсу обхода.
        if (hasZone) {
          const ring = Math.max(
            enemy.radius.r * 2,
            Math.min(zoneRadius * FIGHTER_PATROL_RING, zoneRadius - enemy.radius.r - 40)
          );
          const a =
            Math.atan2(pos.y - zoneY, pos.x - zoneX) +
            FIGHTER_PATROL_STEP * marker.strafeDir;
          const tx = zoneX + Math.cos(a) * ring;
          const ty = zoneY + Math.sin(a) * ring;
          targetMoveAngle = Math.atan2(ty - pos.y, tx - pos.x);
        } else {
          // Зоны нет (меню/передышка) — свободный дрейф по дуге.
          targetMoveAngle = this.heading(vel, marker) + FIGHTER_FREE_DRIFT * marker.strafeDir;
        }
        speed = marker.speed * 0.85;
        turnRate = 1 - Math.exp(-3.5 * dt);
        break;
      }

      case SEARCH: {
        // Держим кольцо вокруг игрока: далеко — сближаемся, близко — отходим,
        // в пределах полосы — облетаем по касательной и ждём момент.
        const err = dist - FIGHTER_STANDOFF;
        const mix = clamp(Math.abs(err) / FIGHTER_STANDOFF_BAND, 0, 1);
        const radial = angleToPlayer + (err > 0 ? 0 : Math.PI);
        const tangent = angleToPlayer + (Math.PI / 2) * marker.strafeDir;
        targetMoveAngle = lerpAngle(tangent, radial, mix);
        speed = marker.speed * 0.9;
        turnRate = 1 - Math.exp(-3.8 * dt);
        break;
      }

      case CUT: {
        // Внутреннее кольцо орбиты игрока, точка — впереди по вращению.
        // Радиус орбиты: |v|/|ω|, центр — P − (vy/ω, −vx/ω).
        const w = context.playerTurnRate;
        const cx = playerX - context.playerVy / w;
        const cy = playerY + context.playerVx / w;
        const orbit = clamp(Math.hypot(playerX - cx, playerY - cy), 60, 2000);
        const ring = Math.max(
          enemy.radius.r * 2.5,
          Math.min(orbit * FIGHTER_CUT_RADIUS, orbit - 60)
        );
        const bearing = Math.atan2(playerY - cy, playerX - cx);
        // Опережение: на тугой орбите базовый угол даёт точку почти в упор —
        // тогда отодвигаем её вперёд по дуге до FIGHTER_CUT_DIST.
        let lead = FIGHTER_CUT_LEAD;
        const cosLead =
          (ring * ring + orbit * orbit - FIGHTER_CUT_DIST * FIGHTER_CUT_DIST) /
          (2 * ring * orbit);
        if (Math.abs(cosLead) <= 1) {
          lead = Math.max(lead, Math.acos(cosLead));
        }
        const a = bearing + lead * Math.sign(w);
        let tx = cx + Math.cos(a) * ring;
        let ty = cy + Math.sin(a) * ring;

        // Точка среза обязана быть внутри зоны: у края срезать нечего.
        if (hasZone) {
          const dd = Math.hypot(tx - zoneX, ty - zoneY) || 1;
          const lim = zoneRadius - FIGHTER_CUT_ZONE_MARGIN;
          if (lim > 0 && dd > lim) {
            const k = lim / dd;
            tx = zoneX + (tx - zoneX) * k;
            ty = zoneY + (ty - zoneY) * k;
          }
        }

        targetMoveAngle = Math.atan2(ty - pos.y, tx - pos.x);
        speed = marker.speed;
        turnRate = 1 - Math.exp(-5.2 * dt);
        break;
      }

      case ATTACK:
      case FIRE: {
        // Идём в точку, где окажется игрок к прилёту болта (по дуге, если он
        // кружит): линия огня доворачивается сама, по мере сближения.
        const lead = solveLead({
          sx: pos.x,
          sy: pos.y,
          target: this.playerTarget(context),
          bulletSpeed: FIGHTER_BOLT_SPEED,
          maxFlightTime: FIGHTER_FIRE_MAX_TIME,
          turnRate: this.predictTurnRate(context),
        });
        if (lead) {
          targetMoveAngle = lead.angle;
        } else {
          // Перехвата нет — берём упреждение по текущему курсу игрока.
          const ahead = 0.35;
          targetMoveAngle = Math.atan2(
            playerY + context.playerVy * ahead - pos.y,
            playerX + context.playerVx * ahead - pos.x
          );
        }
        speed = marker.speed * (marker.mode === FIRE ? 1 : 1.05);
        turnRate = 1 - Math.exp(-4.6 * dt);
        break;
      }

      case EVADE: {
        // Уход по дуге в сторону свободного пространства: назад от игрока
        // и с креном в ту сторону, где дальше до края зоны.
        const escape = angleToPlayer + Math.PI + (Math.PI / 3) * marker.strafeDir;
        speed = marker.speed * 1.15;
        turnRate = 1 - Math.exp(-4.8 * dt);
        // Небольшой крен на развороте смягчает вираж после лобового прохода.
        targetMoveAngle = escape;
        break;
      }

      default: {
        // COOLDOWN: свободный полёт — никакого наведения на игрока,
        // только мягкая дуга и удержание внутри зоны.
        targetMoveAngle = this.heading(vel, marker) + FIGHTER_FREE_DRIFT * marker.strafeDir;
        speed = marker.speed;
        turnRate = 1 - Math.exp(-3 * dt);
        break;
      }
    }

    // --- Отворачивание от края зоны (только если движение ведёт к барьеру) ---
    const steered = this.steerAwayFromZoneEdge(enemy, context, targetMoveAngle, dt);

    // --- Плавный разворот и применение скорости ---
    marker.angle = lerpAngle(marker.angle, steered, turnRate);

    const targetVx = Math.cos(steered) * speed;
    const targetVy = Math.sin(steered) * speed;
    smoothVelocity(vel, targetVx, targetVy, 5, dt);
  }

  // ============================== Состояния ==============================

  /** Переходы между состояниями и заявка на выстрел. */
  private updateState(
    enemy: EnemyRef,
    context: GameContext,
    dt: number,
    dist: number,
    angleToPlayer: number,
    circling: boolean
  ): void {
    const marker = enemy.marker;
    const visible = dist <= FIGHTER_DETECT_RANGE;

    // Столкновение опаснее пропущенного выстрела: уходим в вираж без выстрела.
    if (dist < FIGHTER_BREAK_DIST && marker.mode !== EVADE) {
      this.enterEvade(enemy, context, angleToPlayer);
      return;
    }

    switch (marker.mode) {
      case PATROL: {
        if (visible) this.enterSearch(marker);
        break;
      }

      case SEARCH: {
        if (!visible) {
          this.enterPatrol(marker);
          break;
        }
        // Момент настал — стреляем сразу, не тратя кадр на «заход».
        if (this.tryFire(enemy, context)) break;
        // Игрок ушёл в облёт — снаружи его не догнать, идём на внутреннее
        // кольцо орбиты.
        if (circling) {
          this.enterCut(marker);
          break;
        }
        if (this.canCommit(enemy, context, dist)) this.enterAttack(marker);
        break;
      }

      case CUT: {
        if (!visible) {
          this.enterPatrol(marker);
          break;
        }
        // Игрок выпрямил курс — облёт закончился, возвращаемся к обычному заходу.
        if (!circling) {
          this.enterSearch(marker);
          break;
        }
        // Оружие к бою: в срезе окно проверяется каждый кадр, поэтому огонь
        // идёт с темпом перезарядки, без «захода» между выстрелами.
        this.tryFire(enemy, context);
        break;
      }

      case ATTACK: {
        marker.modeT -= dt;
        if (this.tryFire(enemy, context)) break;
        // Цель начала кружить — преследование снаружи бесполезно.
        if (circling) {
          this.enterCut(marker);
          break;
        }
        if (marker.modeT <= 0) {
          // Не довернул линию огня — уходим на вираж, следующий заход позже.
          this.enterEvade(enemy, context, angleToPlayer);
        }
        break;
      }

      case FIRE: {
        // Выстрел уже сделан в этом кадре (фаза EnemyActions).
        if (dist < FIGHTER_FIRE_KEEP_DIST) {
          this.enterEvade(enemy, context, angleToPlayer);
        } else if (circling) {
          this.enterCut(marker);
        } else {
          this.enterSearch(marker);
        }
        break;
      }

      case EVADE: {
        marker.modeT -= dt;
        // Вираж должен быть доведён: ранний выход по дистанции — только
        // после минимальной доли манёвра, иначе он схлопнется в один кадр.
        const turned = marker.modeT <= FIGHTER_EVADE_TIME - FIGHTER_EVADE_MIN_TIME;
        if (marker.modeT <= 0 || (turned && dist > FIGHTER_EVADE_DIST)) {
          this.enterCooldown(marker);
        }
        break;
      }

      default: {
        // COOLDOWN
        marker.modeT -= dt;
        if (marker.modeT <= 0) {
          if (visible) this.enterSearch(marker);
          else this.enterPatrol(marker);
        }
        break;
      }
    }
  }

  /**
   * Заявка на выстрел: если окно открыто — ставим fireGate и уходим в FIRE.
   * Саму стрельбу выполнит EnemyShootingSystem в фазе EnemyActions.
   */
  private tryFire(enemy: EnemyRef, context: GameContext): boolean {
    if (!this.fireWindow(enemy, context)) return false;
    enemy.marker.mode = FIRE;
    enemy.marker.fireGate = true;
    return true;
  }

  /** Угловая скорость для прогноза: только в режиме облёта, иначе прямая. */
  private predictTurnRate(context: GameContext): number {
    return Math.abs(context.playerTurnRate) >= FIGHTER_CIRCLE_OMEGA
      ? context.playerTurnRate
      : 0;
  }

  /**
   * Окно выстрела: снаряд по упреждению (по прямой или по дуге курса)
   * долетит до игрока. Зона выстрел больше не обрезает.
   */
  private fireWindow(enemy: EnemyRef, context: GameContext): FireWindow | null {
    return solveFireWindow({
      sx: enemy.position.x,
      sy: enemy.position.y,
      target: this.playerTarget(context),
      bulletSpeed: FIGHTER_BOLT_SPEED,
      turnRate: this.predictTurnRate(context),
      minTime: FIGHTER_FIRE_MIN_TIME,
      maxTime: FIGHTER_FIRE_MAX_TIME,
      minAngular: FIGHTER_FIRE_MIN_ANGULAR,
    });
  }

  /**
   * Удачный момент для захода: игрок в пределах дистанции и его можно
   * перехватить до того, как он уйдёт. Убегающего по прямой игрока
   * (быстрее файтера) не догоняем — ждём, пока он сам сблизится или отвернёт.
   */
  private canCommit(enemy: EnemyRef, context: GameContext, dist: number): boolean {
    const { marker, position } = enemy;
    if (dist > FIGHTER_COMMIT_RANGE) return false;

    const t = solveInterceptTime(
      context.playerX - position.x,
      context.playerY - position.y,
      context.playerVx,
      context.playerVy,
      marker.speed
    );
    return t !== null && t <= FIGHTER_COMMIT_TIME;
  }

  private playerTarget(context: GameContext): {
    x: number;
    y: number;
    vx: number;
    vy: number;
    r: number;
  } {
    return {
      x: context.playerX,
      y: context.playerY,
      vx: context.playerVx,
      vy: context.playerVy,
      r: PLAYER_HIT_RADIUS,
    };
  }

  private enterPatrol(marker: EnemyComponent): void {
    marker.mode = PATROL;
    marker.modeT = 0;
  }

  private enterSearch(marker: EnemyComponent): void {
    marker.mode = SEARCH;
    marker.modeT = 0;
  }

  private enterCut(marker: EnemyComponent): void {
    marker.mode = CUT;
    marker.modeT = 0;
  }

  private enterAttack(marker: EnemyComponent): void {
    marker.mode = ATTACK;
    marker.modeT = FIGHTER_ATTACK_TIMEOUT;
  }

  private enterEvade(enemy: EnemyRef, context: GameContext, angleToPlayer: number): void {
    const marker = enemy.marker;
    marker.mode = EVADE;
    marker.modeT = FIGHTER_EVADE_TIME;
    marker.strafeDir = this.pickEscapeSide(enemy, context, angleToPlayer);
  }

  private enterCooldown(marker: EnemyComponent): void {
    marker.mode = COOLDOWN;
    marker.modeT = FIGHTER_COOLDOWN_TIME;
    // Каждый следующий свободный полёт уводит в другую сторону.
    marker.strafeDir = -marker.strafeDir;
  }

  /** Текущее направление полёта (или нос, если аппарат почти остановился). */
  private heading(vel: { vx: number; vy: number }, marker: EnemyComponent): number {
    if (Math.hypot(vel.vx, vel.vy) > 5) return Math.atan2(vel.vy, vel.vx);
    return marker.angle;
  }

  // ============================== Зона ==============================

  /**
   * Отвернуть от края зоны, если движение ведёт к барьеру.
   * Возвращает скорректированный угол движения.
   */
  private steerAwayFromZoneEdge(
    enemy: EnemyRef,
    context: GameContext,
    targetMoveAngle: number,
    dt: number
  ): number {
    const { zoneX, zoneY, zoneRadius } = context;
    if (context.playerOutsideZone) return targetMoveAngle;
    if (zoneRadius <= MIN_ZONE_RADIUS) return targetMoveAngle;

    const pos = enemy.position;
    const vel = enemy.velocity;
    const distToCenter = Math.hypot(pos.x - zoneX, pos.y - zoneY) || 1;
    const distToEdge = zoneRadius - distToCenter - enemy.radius.r;
    if (distToEdge >= AVOID_ZONE_RADIUS) return targetMoveAngle;

    const raw = clamp01(
      (AVOID_ZONE_RADIUS - distToEdge) / (AVOID_ZONE_RADIUS - AVOID_HARD)
    );
    const avoidWeight = smooth01(raw);

    // Доля движения, направленного внутрь зоны (к центру).
    // Если файтер уже летит от края — избегание не вмешивается.
    const angleToCenter = Math.atan2(zoneY - pos.y, zoneX - pos.x);
    const inwardness = Math.cos(targetMoveAngle - angleToCenter);
    const needAvoid = clamp01(1 - inwardness * 1.5);
    if (needAvoid <= 0.05) return targetMoveAngle;

    // Касательная к окружности зоны — направление облёта края.
    const angleToEdge = Math.atan2(pos.y - zoneY, pos.x - zoneX);
    const tangentA = angleToEdge + Math.PI / 2;
    const velMag = Math.hypot(vel.vx, vel.vy);
    let tangent: number;
    if (velMag > 5) {
      const velAngle = Math.atan2(vel.vy, vel.vx);
      tangent = Math.cos(velAngle - tangentA) >= 0 ? tangentA : tangentA + Math.PI;
    } else {
      tangent = enemy.marker.strafeDir >= 0 ? tangentA : tangentA + Math.PI;
    }

    const effective = avoidWeight * needAvoid;
    const steered = lerpAngle(targetMoveAngle, tangent, raw >= 1 ? 1 : effective * 0.9);

    // Гасим направленную наружу радиальную скорость — файтер не «тыкается»
    // в барьер, а плавно скользит вдоль края.
    const rx = (pos.x - zoneX) / distToCenter;
    const ry = (pos.y - zoneY) / distToCenter;
    const radialV = vel.vx * rx + vel.vy * ry;
    if (radialV > 0) {
      const damp = effective * (1 - Math.exp(-9 * dt));
      vel.vx -= rx * radialV * damp;
      vel.vy -= ry * radialV * damp;
    }

    return steered;
  }

  /**
   * Выбрать сторону (справа/слева) с большим свободным пространством до края зоны.
   * Без зоны — сохранить текущее направление стрейфа.
   */
  private pickEscapeSide(enemy: EnemyRef, context: GameContext, angleToPlayer: number): number {
    const { zoneX, zoneY, zoneRadius } = context;
    const pos = enemy.position;
    const marker = enemy.marker;
    const hasZone = zoneRadius > MIN_ZONE_RADIUS && !context.playerOutsideZone;

    let best = marker.strafeDir;
    let bestScore = -Infinity;
    for (const side of [1, -1]) {
      let score: number;
      if (hasZone) {
        const angle = angleToPlayer + (Math.PI / 2) * side;
        // Прогноз позиции через ~0.6 с — там должно быть свободнее
        const px = pos.x + Math.cos(angle) * 60;
        const py = pos.y + Math.sin(angle) * 60;
        score = zoneRadius - Math.hypot(px - zoneX, py - zoneY) - enemy.radius.r;
      } else {
        score = side === marker.strafeDir ? 1 : 0;
      }
      if (score > bestScore) {
        bestScore = score;
        best = side;
      }
    }
    return best;
  }
}
