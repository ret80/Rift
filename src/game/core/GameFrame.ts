/**
 * GameFrame — кадровый цикл: порядок обновления систем.
 * Здесь же строится единое мировое сечение (WorldFrame), которое
 * читают системы, рендер и HUD. Порядок вызовов зафиксирован и
 * определяет поведение (зона, волна, коллизии, HUD).
 */

import type { AsteroidWorld, WorldFrame } from "./WorldFrame";
import type { GameContext } from "./GameContext";
import type { GameRender } from "./GameRender";
import type { PhysicsEntity } from "../physics/index";
import {
  asteroidEntity,
  enemyEntity,
  playerEntity,
} from "../physics/index";

export class GameFrame {
  constructor(
    private readonly ctx: GameContext,
    private readonly render: GameRender,
  ) {}

  /** Полный кадр: меню или игровой цикл. Вызывается из GameLoop. */
  step(dt: number): void {
    const ctx = this.ctx;
    const fsm = ctx.fsm;

    ctx.handleDebugKeys(dt);

    if (fsm.is("menu")) {
      this.render.updateMenu(dt);
      return;
    }

    if (ctx.paused) {
      this.render.renderScene(dt);
      return;
    }

    /* Update all systems in order */
    ctx.countdownSystem.update(dt);
    ctx.scoringSystem.updateCombo(dt);
    ctx.bonusManager.update(dt);
    ctx.shieldSystem.update(dt);
    if (fsm.is("playing", "active")) {
      ctx.abilitySystem.update(dt);
    }
    ctx.playerSystem.update(dt, fsm.not("menu", "over", "dying"), ctx.physics.integratesPositions);

    // Handle dying → over transition
    if (fsm.is("dying")) {
      if (ctx.deathSystem.update(dt)) {
        fsm.fire("death_anim_done");
      }
    }

    // Stop enemies and bullets during dying/over (prevent orphan bullets)
    const isDead = fsm.is("dying", "over");
    if (!isDead) {
      ctx.enemySystem.update(
        dt,
        ctx.entityPool.enemyList,
        ctx.getPlayerPosition(),
        ctx.getZoneBounds(),
        ctx.physics.integratesPositions,
      );
      // Enemy shooting: separate from movement/AI
      if (fsm.is("playing", "active")) {
        ctx.enemyShootingSystem.update(dt, ctx.entityPool.enemyList, ctx.getPlayerPosition());
      }
      // Weapons: targeting, cannon fire, missiles, drones
      if (fsm.is("playing", "active")) {
        ctx.weaponManager.update(dt);
      }
      ctx.bulletSystem.update(dt, ctx.entityPool.bulletList, ctx.entityPool.enemyBulletList, ctx.entityPool.enemyList);
    }

    // Физика: регистрация тел, синхронизация, шаг, контакты.
    // В custom-режиме позиции уже проинтегрированы системами выше;
    // в Planck-режиме движок сам двигает тела и возвращает состояние,
    // поэтому единое мировое сечение строится после шага физики.
    if (!isDead) {
      ctx.physics.update(dt, this.buildPhysicsEntities());
    }

    const world = this.buildWorld();
    if (!isDead) {
      ctx.collisionSystem.update(dt, world);
      ctx.pickupSystem.update(dt, world.pickups, world.player.x, world.player.y);
      ctx.spawnSystem.update(dt, {
        countdownSystem: ctx.countdownSystem,
        zoneState: world.zone ?? null,
        riftField: ctx.riftField,
        hooks: {
          onToast: (data) => ctx.hooks.onToast(data),
        },
        wave: ctx.waveOrchestrator.wave,
        killedWave: ctx.scoringSystem.killedWave,
        playerX: world.player.x,
        playerY: world.player.y,
      });
    }
    ctx.riftField.update(dt);
    ctx.fx.update(dt, dt); // Обновляем частицы и тряску экрана

    // Zone updates (always run, damage handled inside)
    ctx.waveFlowSystem.updateZoneAndWaves(dt);

    // Update zone system: sync, clamp, constraints (after orchestrator update)
    if (!isDead) {
      ctx.zoneSystem.update(dt);
    }

    // Update asteroid field with camera and zone info
    const cp = ctx.cameraSystem.getPosition();
    ctx.asteroidField.update(dt, {
      camX: cp.x,
      camY: cp.y,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      zone: ctx.waveOrchestrator.zoneState.active
        ? {
            x: ctx.waveOrchestrator.zoneState.x,
            y: ctx.waveOrchestrator.zoneState.y,
            r: ctx.waveOrchestrator.zoneState.radius,
          }
        : null,
      physicsIntegrates: ctx.physics.integratesPositions,
      physicsResolves: ctx.physics.resolvesVelocity,
    } as import("../asteroids").AsteroidEnv);

    this.render.renderScene(dt);
    this.render.renderDebug();
    ctx.loadoutSystem.update(dt);
    this.render.updateHud();
  }

  /** Единое мировое сечение для систем и рендера (справочные ссылки на пулы). */
  buildWorld(): WorldFrame {
    const ctx = this.ctx;
    const zoneState = ctx.waveOrchestrator.zoneState;
    return {
      player: ctx.getPlayerWorld(),
      enemies: ctx.entityPool.enemyList,
      bullets: ctx.entityPool.bulletList,
      enemyBullets: ctx.entityPool.enemyBulletList,
      pickups: ctx.entityPool.pickupList,
      allyDrones: ctx.entityPool.allyDroneList,
      beams: ctx.entityPool.beamList,
      asteroids: ctx.asteroidField.asteroidList as AsteroidWorld[],
      zone: zoneState && zoneState.active ? zoneState : null,
    };
  }

  /** Живые сущности физики текущего кадра (live-мосты над игровыми объектами). */
  private buildPhysicsEntities(): PhysicsEntity[] {
    const ctx = this.ctx;
    const entities: PhysicsEntity[] = [
      playerEntity(ctx.playerSystem.getPlayerRef()),
    ];
    for (const e of ctx.entityPool.enemyList) {
      if (!e.dead) entities.push(enemyEntity(e));
    }
    for (const a of ctx.asteroidField.asteroidList) {
      entities.push(asteroidEntity(a));
    }
    return entities;
  }
}