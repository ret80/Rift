/**
 * AllyDroneSystem — ECS-система боевых дронов-компаньонов.
 *
 * Оперирует сущностями с компонентом AllyDroneComponent. Ведёт орбиту вокруг
 * корабля, выбор цели (EntityRef targetId), стрельбу по цели с упреждением
 * и затухание вспышки/перезарядки. Гибнущие дроны (hp<=0) удаляет из ECS.
 *
 * Состав роя (сколько и каких дронов есть) задаёт DroneWeapon через
 * addAllyDrone; эта система отвечает только за пофреймовое поведение.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { aimAtTarget } from "../../aiming/AimSolver";
import type { Enemy } from "../../types";
import type { Bullet } from "../../types";
import type { PlayerState } from "../../systems/PlayerState";
import { AllyDroneComponent } from "../components/AllyDroneComponent";
import { GameEntity } from "../GameEntity";

/** Радиус орбиты дронов вокруг корабля. */
export const DRONE_ORBIT_RADIUS = 58;
/** Скорость вращения роя вокруг корабля. */
const DRONE_ORBIT_SPEED = 0.5;
/** Дальность захвата цели дроном. */
const DRONE_TARGET_RANGE = 430;
/** Максимальное число дронов в рое (и слотов корабля). */
export const MAX_ALLY_DRONES = 8;
/** Период смены цели дроном, секунды. */
const DRONE_RETARGET_INTERVAL = 1;
/** Длительность вспышки ствола после выстрела, секунды. */
const DRONE_FLASH_TIME = 0.15;

/** Зависимости, которые предоставляет владелец мира (GameContext). */
export interface AllyDroneHooks {
  /** Текущее состояние игрока (позиция, maxHp). */
  getPlayer(): PlayerState | null;
  /** Бонусный множитель перезарядки (rateMult). */
  getRateMult(): number;
  /** Точность (hitChance) для упреждения. */
  getHitChance(): number;
  /** Живые враги — цели дронов. */
  getEnemies(): readonly Enemy[];
  /** Добавить снаряд игрока в ECS-мир. */
  addBullet(bullet: Bullet): void;
  /** Колбэк, когда какой-то дрон выстрелил. */
  onDroneFired(): void;
}

export class AllyDroneSystem extends System {
  private aspect: Aspect | null = null;

  constructor(private h: AllyDroneHooks) {
    super(3); // после пуль и лучей
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(AllyDroneComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const player = this.h.getPlayer();
    const enemies = this.h.getEnemies();
    const enemiesById = new Map<number | string, Enemy | null>();
    for (const e of enemies) {
      if (e.ecsId !== null && e.ecsId !== undefined) enemiesById.set(e.ecsId, e);
    }

    const toRemove: GameEntity[] = [];
    let anyFired = false;

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const drone = entity.components.get(AllyDroneComponent);
      if (!drone) continue;

      if (player) this.updateOrbit(drone, player, dt);
      else {
        // Нет игрока — дрон стоит на месте, только тикаем перезарядку.
        drone.phase += 0;
        drone.fireCd = Math.max(0, drone.fireCd - dt);
        if (drone.flash > 0) drone.flash = Math.max(0, drone.flash - dt);
      }

      if (drone.flash > 0) drone.flash = Math.max(0, drone.flash - dt);
      if (drone.fireCd > 0) drone.fireCd = Math.max(0, drone.fireCd - dt);

      // Выбор цели.
      drone.retargetT -= dt;
      let currentTarget: Enemy | null | undefined =
        drone.targetId !== null ? enemiesById.get(drone.targetId) : undefined;
      if (!currentTarget || drone.retargetT <= 0 || currentTarget.dead) {
        const next = this.findTarget(drone.x, drone.y, enemies);
        drone.targetId = next ? next.ecsId ?? null : null;
        drone.retargetT = DRONE_RETARGET_INTERVAL;
        currentTarget = undefined;
      }

      const target: Enemy | null =
        currentTarget !== undefined
          ? currentTarget
          : drone.targetId !== null
            ? (enemiesById.get(drone.targetId) ?? null)
            : null;
      if (!target) continue;

      const dx = target.x - drone.x;
      const dy = target.y - drone.y;
      if (Math.hypot(dx, dy) > DRONE_TARGET_RANGE) continue;
      if (drone.fireCd > 0) continue;

      const combat = drone.combat;
      if (!combat) continue;

      const angle = aimAtTarget(
        {
          sx: drone.x,
          sy: drone.y,
          target,
          bulletSpeed: combat.bulletSpeed,
          maxFlightTime: combat.bulletLife,
        },
        this.h.getHitChance(),
        target.r
      );

      const rateMult = Math.max(0.01, this.h.getRateMult());
      drone.fireCd = combat.reloadTime / rateMult;
      drone.flash = DRONE_FLASH_TIME;
      drone.angle = angle;
      this.h.addBullet({
        x: drone.x,
        y: drone.y,
        vx: Math.cos(angle) * combat.bulletSpeed,
        vy: Math.sin(angle) * combat.bulletSpeed,
        life: combat.bulletLife,
        dmg: combat.damage,
      });
      anyFired = true;

      // Гибель дрона (получение урона обрабатывает CollisionSystem).
      if (drone.hp <= 0) toRemove.push(entity);
    }

    if (anyFired) this.h.onDroneFired();
    for (const entity of toRemove) this.engine?.entities.remove(entity);
  }

  /** Орбита дрона вокруг корабля. */
  private updateOrbit(drone: AllyDroneComponent, player: PlayerState, dt: number): void {
    drone.phase += dt * DRONE_ORBIT_SPEED;
    drone.x = player.x + Math.cos(drone.phase) * DRONE_ORBIT_RADIUS;
    drone.y = player.y + Math.sin(drone.phase) * DRONE_ORBIT_RADIUS;
    drone.angle = drone.phase + Math.PI / 2;
  }

  /** Ближайший живой враг в зоне захвата дрона. */
  private findTarget(x: number, y: number, enemies: readonly Enemy[]): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = DRONE_TARGET_RANGE;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    return nearest;
  }
}