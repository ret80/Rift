/**
 * AllyDroneSystem — ECS-система боевых дронов-компаньонов.
 *
 * Оперирует сущностями с компонентом AllyDroneComponent + базовыми
 * Position/Radius/Life. Ведёт орбиту вокруг корабля, выбор цели
 * (EntityRef targetId), стрельбу по цели с упреждением и затухание
 * вспышки/перезарядки. Гибнущие дроны (life.remaining<=0) удаляет из ECS.
 *
 * Состав роя (сколько и каких дронов есть) задаёт DroneWeapon через
 * addAllyDrone; эта система отвечает только за пофреймовое поведение.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { BULLET_RANGE_PLAYER } from "../../balance";
import { aimAtTarget } from "../../aiming/AimSolver";
import type { Rng } from "../../core/rng";
import type { EnemyRef, PlayerRef } from "../../ecs";
import { AllyDroneComponent, type DroneOrder } from "../components/AllyDroneComponent";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { GameEntity } from "../GameEntity";
import type { BulletSpawn } from "../spawn";
import { Phase, PhasedSystem } from "../SystemSchedule";

/** Радиус орбиты дронов вокруг корабля. */
export const DRONE_ORBIT_RADIUS = 58;
/** Скорость вращения роя вокруг корабля. */
const DRONE_ORBIT_SPEED = 0.5;
/** Дальность захвата цели дроном в эскорте. */
const DRONE_TARGET_RANGE = 430;
/** Дальность захвата в штурме и фокусе. */
const DRONE_ASSAULT_RANGE = 700;
/** Дистанция, на которой штурмующий дрон держится от цели. */
const DRONE_STANDOFF = 190;
/** Скорость перестроения к цели штурма, px/с. */
const DRONE_ASSAULT_SPEED = 235;
/** Максимальное число дронов в рое (и слотов корабля). */
export const MAX_ALLY_DRONES = 8;
/** Период смены цели дроном, секунды. */
const DRONE_RETARGET_INTERVAL = 1;
/** Длительность вспышки ствола после выстрела, секунды. */
const DRONE_FLASH_TIME = 0.15;

/** Зависимости, которые предоставляет владелец мира (GameContext). */
export interface AllyDroneHooks {
  /** Живая связка компонентов игрока (позиция для орбиты). */
  getPlayer(): PlayerRef | null;
  /** Бонусный множитель перезарядки (rateMult). */
  getRateMult(): number;
  /** Точность (hitChance) для упреждения. */
  getHitChance(): number;
  /** Живые враги — цели дронов. */
  getEnemies(): readonly EnemyRef[];
  /** Добавить снаряд игрока в ECS-мир. */
  addBullet(bullet: BulletSpawn): void;
  /** Колбэк, когда какой-то дрон выстрелил. */
  onDroneFired(): void;
  /** Боевой поток случайности (рассеивание выстрела дрона). */
  getRng(): Rng;
}

export class AllyDroneSystem extends PhasedSystem {
  private aspect: Aspect | null = null;
  /** Общий приказ роя: эскорт, штурм или фокус на выбранной цели. */
  private order: DroneOrder = "escort";
  /** Цель фокуса: id врага, выбранного игроком в тактическом режиме. */
  private focusTargetId: number | string | null = null;

  constructor(private h: AllyDroneHooks) {
    super(Phase.Allies);
  }

  /** Текущий приказ роя (для HUD). */
  get currentOrder(): DroneOrder {
    return this.order;
  }

  /**
   * Отдать приказ рою. В фокусе передаётся конкретная цель; если её
   * убили, дроны возвращаются к ближайшим врагам, не теряя приказ.
   */
  setOrder(order: DroneOrder, focusTargetId: number | string | null = null): void {
    this.order = order;
    this.focusTargetId = order === "focus" ? focusTargetId : null;
  }

  /** Сбросить приказ к эскорту (новый забег). */
  reset(): void {
    this.order = "escort";
    this.focusTargetId = null;
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(AllyDroneComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const player = this.h.getPlayer();
    const enemies = this.h.getEnemies();
    const enemiesById = new Map<number | string, EnemyRef | null>();
    for (const e of enemies) {
      if (e.marker.ecsId !== null && e.marker.ecsId !== undefined) enemiesById.set(e.marker.ecsId, e);
    }

    const toRemove: GameEntity[] = [];
    let anyFired = false;

    for (const entity of [...aspect.entities]) {
      const drone = entity.components.get(AllyDroneComponent);
      if (!drone) continue;
      const position = entity.components.get(PositionComponent);
      const life = entity.components.get(LifeComponent);
      if (!position || !life) continue;

      if (drone.flash > 0) drone.flash = Math.max(0, drone.flash - dt);
      if (drone.fireCd > 0) drone.fireCd = Math.max(0, drone.fireCd - dt);

      const range = this.order === "escort" ? DRONE_TARGET_RANGE : DRONE_ASSAULT_RANGE;

      // Выбор цели: в фокусе — назначенная, иначе ближайшая к дрону.
      drone.retargetT -= dt;
      const focus = this.order === "focus" && this.focusTargetId !== null
        ? enemiesById.get(this.focusTargetId) ?? null
        : null;
      let currentTarget: EnemyRef | null | undefined =
        drone.targetId !== null ? enemiesById.get(drone.targetId) : undefined;
      if (focus && !focus.marker.dead) {
        currentTarget = focus;
        drone.targetId = focus.marker.ecsId ?? null;
      } else if (!currentTarget || drone.retargetT <= 0 || currentTarget.marker.dead) {
        const next = this.findTarget(position.x, position.y, enemies, range);
        drone.targetId = next ? next.marker.ecsId ?? null : null;
        drone.retargetT = DRONE_RETARGET_INTERVAL;
        currentTarget = undefined;
      }

      const target: EnemyRef | null =
        currentTarget !== undefined
          ? currentTarget
          : drone.targetId !== null
            ? (enemiesById.get(drone.targetId) ?? null)
            : null;

      // Движение: эскорт держит орбиту, штурм/фокус выходят на дугу у цели.
      if (!player) {
        drone.fireCd = Math.max(0, drone.fireCd - dt);
        continue;
      }
      if (this.order !== "escort" && target && !target.marker.dead) {
        this.updateCombatPosition(drone, position, target, dt);
      } else {
        this.updateOrbit(drone, position, player, dt);
      }

      if (!target) continue;

      const dx = target.position.x - position.x;
      const dy = target.position.y - position.y;
      if (Math.hypot(dx, dy) > range) continue;
      if (drone.fireCd > 0) continue;

      const combat = drone.combat;
      if (!combat) continue;

      const angle = aimAtTarget(
        {
          sx: position.x,
          sy: position.y,
          target: {
            x: target.position.x,
            y: target.position.y,
            vx: target.velocity.vx,
            vy: target.velocity.vy,
            r: target.radius.r,
          },
          bulletSpeed: combat.bulletSpeed,
          maxFlightTime: combat.leadTime,
        },
        this.h.getHitChance(),
        target.radius.r,
        this.h.getRng(),
      );

      const rateMult = Math.max(0.01, this.h.getRateMult());
      drone.fireCd = combat.reloadTime / rateMult;
      drone.flash = DRONE_FLASH_TIME;
      drone.angle = angle;
      this.h.addBullet({
        x: position.x,
        y: position.y,
        vx: Math.cos(angle) * combat.bulletSpeed,
        vy: Math.sin(angle) * combat.bulletSpeed,
        life: BULLET_RANGE_PLAYER / combat.bulletSpeed,
        dmg: combat.damage,
      });
      anyFired = true;

      // Гибель дрона (получение урона обрабатывает CollisionSystem).
      if (life.remaining <= 0) toRemove.push(entity);
    }

    if (anyFired) this.h.onDroneFired();
    for (const entity of toRemove) this.engine?.entities.remove(entity);
  }

  /** Орбита дрона вокруг корабля. */
  private updateOrbit(
    drone: AllyDroneComponent,
    position: PositionComponent,
    player: PlayerRef,
    dt: number
  ): void {
    drone.phase += dt * DRONE_ORBIT_SPEED;
    position.x = player.position.x + Math.cos(drone.phase) * DRONE_ORBIT_RADIUS;
    position.y = player.position.y + Math.sin(drone.phase) * DRONE_ORBIT_RADIUS;
    drone.angle = drone.phase + Math.PI / 2;
  }

  /**
   * Позиция атакующего дрона: держит дугу у цели и облетает её,
   * не залетая внутрь корпуса.
   */
  private updateCombatPosition(
    drone: AllyDroneComponent,
    position: PositionComponent,
    target: EnemyRef,
    dt: number,
  ): void {
    drone.phase += dt * 0.9;
    const tx = target.position.x + Math.cos(drone.phase) * DRONE_STANDOFF;
    const ty = target.position.y + Math.sin(drone.phase) * DRONE_STANDOFF;
    const dx = tx - position.x;
    const dy = ty - position.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 1) return;
    const step = Math.min(dist, DRONE_ASSAULT_SPEED * dt);
    position.x += (dx / dist) * step;
    position.y += (dy / dist) * step;
    drone.angle = Math.atan2(target.position.y - position.y, target.position.x - position.x);
  }

  /** Ближайший живой враг в зоне захвата дрона. */
  private findTarget(
    x: number,
    y: number,
    enemies: readonly EnemyRef[],
    range: number = DRONE_TARGET_RANGE,
  ): EnemyRef | null {
    let nearest: EnemyRef | null = null;
    let nearestDist = range;
    for (const enemy of enemies) {
      if (enemy.marker.dead) continue;
      const dist = Math.hypot(enemy.position.x - x, enemy.position.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }
}
