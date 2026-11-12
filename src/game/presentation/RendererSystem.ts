/**
 * RendererSystem — координатор отрисовки всех игровых объектов.
 *
 * Сам не рисует — делегирует конкретным рендерерам:
 *   - PlayerRenderer   — корабль игрока
 *   - EnemyRenderer    — враги
 *   - BulletRenderer   — пули
 *   - DroneRenderer    — союзные дроны
 *   - PickupRenderer   — пикапы
 *   - ZoneRenderer     — игровая зона
 *   - RiftAnimation    — разломы
 *
 * Управляет lifecycle: beginFrame, camera, finish.
 * Каждый рендерер сам строит свой render-state через buildState.
 * Кадр передаётся одним объектом (RenderScene → RenderFrame), а не
 * пачкой позиционных аргументов.
 */

import type { AsteroidField } from "../asteroids";
import { C } from "../balance";
import type { BeamRef } from "../ecs";
import type { Fx } from "../fx";
import { rgba } from "../math";
import type { MenuEnemy, MenuFrame, MenuRift } from "./menu/types";
import { getDpr } from "../render/config";
import type { IRenderer } from "../render/index";
import { RiftField } from "../rifts";
import type { Starfield } from "../starfield";
import type { RenderFrame, RenderScene } from "../types/render";
import { buildBulletState, buildEBulletState, renderBullets } from "./Renderers/BulletRenderer";
import { buildDroneState, renderAllyDrones } from "./Renderers/DroneRenderer";
import { buildEnemyState, renderEnemies } from "./Renderers/EnemyRenderer";
import { buildPickupState, renderPickups } from "./Renderers/PickupRenderer";
import { buildPlayerState, renderPlayer } from "./Renderers/PlayerRenderer";
import { calcMenuRiftAnim, calcRiftAnim, drawRift } from "./Renderers/RiftAnimation";
import { drawShipPoly } from "./Renderers/ShipRenderer";
import {
    buildZoneState,
    renderZone,
    renderZoneReturnIndicator,
    renderZoneStorm,
} from "./Renderers/ZoneRenderer";
import type { Anchor } from "../ecs/systems/AnchorSystem";

/* ============================== config ============================== */

export interface RendererSystemConfig {
  fx: Fx;
  starfield: Starfield;
  asteroidField: AsteroidField;
  riftField: RiftField;
  anchorSystem?: {
    getAnchors(): Anchor[];
  };
}

/* ============================== RendererSystem ============================== */

export class RendererSystem {
  private config: RendererSystemConfig;

  constructor(config: RendererSystemConfig) {
    this.config = config;
  }

  /* ============================== main draw ============================== */

  /**
   * Отрисовать игровой кадр по DTO.
   * Каждый рендерер сам строит свой state через buildState.
   */
  render(scene: RenderScene): void {
    const {
      renderer: R,
      state, time,
      player, aim, guns, shield,
      enemies, bullets, enemyBullets: ebullets, pickups, allyDrones: drones, beams,
      zone: zoneState, storm, camera, view,
    } = scene;

    // Build render states — each renderer owns its transformation
    const playerRender = player
      ? buildPlayerState(
          player.position.x, player.position.y, player.marker.angle,
          player.life.remaining, player.life.max, player.marker.invuln,
          player.marker.thrusting, player.velocity.vx, player.velocity.vy,
          aim, guns, shield
        )
      : null;

    const frame: RenderFrame = {
      renderer: R,
      state,
      time,
      camera,
      view,
      player: playerRender,
      enemies: buildEnemyState(enemies),
      bullets: buildBulletState(bullets),
      enemyBullets: buildEBulletState(ebullets),
      pickups: buildPickupState(pickups),
      allyDrones: buildDroneState(drones),
      zone: zoneState ? buildZoneState(
        zoneState.active, zoneState.x, zoneState.y,
        zoneState.radius, zoneState.targetRadius, zoneState.alpha,
        zoneState.collapseT, zoneState.phase
      ) : null,
      storm,
      beams,
    };

    this.draw(frame);
  }

  renderMenu(frame: MenuFrame): void {
    const { renderer: R, view } = frame;
    R.resize(view.width, view.height);
    R.beginFrame();
    R.setMode("world");
    R.setCamera(0, 0, 1, 0, 0);
    frame.starfield.draw(R, 0, 0, 1, 0);
    frame.asteroidField.draw(R, 0);
    this.drawMenuScene(R, 0);
    this.drawMenuRifts(R, frame.rifts);
    this.drawMenuEnemies(R, frame.enemies, 0);
    R.finish(0);
  }

  draw(frame: RenderFrame): void {
    const {
      renderer: R,
      time,
      camera,
      view,
      state,
      player,
      enemies,
      bullets,
      enemyBullets: ebullets,
      pickups,
      allyDrones,
      zone,
      storm,
      beams,
    } = frame;

    R.resize(view.width, view.height);
    R.beginFrame();
    R.setMode("world");
    R.setCamera(camera.x, camera.y, camera.zoom, this.config.fx.shakeX, this.config.fx.shakeY);

    this.config.starfield.draw(R, camera.x, camera.y, camera.zoom, time);
    this.config.asteroidField.draw(R, time);

    if (state === "menu") {
      this.drawMenuScene(R, time);
    } else {
      // Зона — плоский слой: он композится над фоном, но под всеми объектами
      // сцены (пули, враги, астероиды) и не попадает в bloom.
      if (zone) {
        R.setLayer("flat");
        renderZone(R, zone, time);
        if (storm) renderZoneStorm(R, storm, time);
        R.setLayer("scene");
      }
      this.drawRifts(R, time);
      this.drawAnchors(R, time);
      renderPickups(R, pickups, time);
      renderEnemies(R, enemies, time);
      renderAllyDrones(R, allyDrones, time, player);
      if (player && state !== "dying" && state !== "over") {
        renderPlayer(R, player, time);
      }
      renderBullets(R, bullets, ebullets);
      this.drawBeams(R, beams, time);
      this.config.fx.draw(R);
    }

    // Указатель на зону, пока игрок снаружи: камера следует за игроком,
    // и сама зона может быть далеко за экраном.
    if (zone && player && state !== "dying" && state !== "over") {
      R.setMode("screen");
      renderZoneReturnIndicator(
        R, zone, player.x, player.y,
        view.width, view.height, getDpr(), time
      );
    }

    R.finish(time);
  }

  /* ============================== beams ============================== */

  private drawBeams(
    R: IRenderer,
    beams: BeamRef[],
    _time: number
  ): void {
    for (const b of beams) {
      const t = b.life.max > 0 ? Math.max(0, b.life.remaining / b.life.max) : 0;
      const a = t;
      if (a <= 0) continue;
      R.pushBeam(b.beam.x1, b.beam.y1, b.beam.x2, b.beam.y2, 5, rgba("#ff2d55", a), b.beam.seed);
      // Внутреннее яркое ядро — оно даёт «белый» центр луча.
      R.pushBeam(b.beam.x1, b.beam.y1, b.beam.x2, b.beam.y2, 1.6, rgba("#ffd9e0", a), b.beam.seed + 1);
    }
  }

  /* ============================== rifts ============================== */

  private drawRifts(R: IRenderer, time: number): void {
    this.config.riftField.draw(R, time);
  }

  /**
   * Якоря-разломы: пульс открытого разлома, прочность и вращение.
   * Якорь должен читаться как цель волны, а не как декоративный объект.
   */
  private drawAnchors(R: IRenderer, time: number): void {
    const anchors = this.config.anchorSystem?.getAnchors() ?? [];
    for (const a of anchors) {
      if (!a.alive) continue;
      const pulse = 0.5 + 0.5 * Math.sin(time * 3 + a.seed);
      // Ореол разлома, который держит якорь.
      R.circle(a.x, a.y, a.radius + 9 + pulse * 7, rgba("#c79bff", 0.16 + pulse * 0.18), 22);
      // Корпус.
      R.circle(a.x, a.y, a.radius, rgba("#ff8a3d", 0.75), 16);
      // Вращающееся кольцо разлома.
      R.dashedCircle(a.x, a.y, a.radius + 6, rgba("#c79bff", 0.9), 18, time * 0.8);
      // Прочность: число сегментов падает с HP.
      const f = a.maxHp > 0 ? a.hp / a.maxHp : 0;
      R.dashedCircle(a.x, a.y, a.radius + 10, rgba("#ff3b52", 0.85), Math.max(2, Math.round(16 * f)), -time * 1.2);
    }
  }

  /* ============================== menu scene ============================== */

  private drawMenuScene(R: IRenderer, time: number): void {
    const cyclePos = time % 4.0;
    const { lenP, widP, alpha, snake } = calcMenuRiftAnim(cyclePos, time);
    drawRift(R, { x: 0, y: -30, size: 130, seed: 7, rot: time * 0.05, time }, lenP, widP, alpha, snake);

    for (let i = 0; i < 3; i++) {
      const a = time * (0.5 + i * 0.12) + (i * Math.PI * 2) / 3;
      const ox = Math.cos(a) * (200 + i * 46);
      const oy = -30 + Math.sin(a) * (115 + i * 28);
      drawShipPoly(
        R, ox, oy, a + Math.PI / 2,
        [[10, 0], [-8, 8], [-4, 0], [-8, -8]],
        rgba(C.drone, 0.35)
      );
    }
  }

  private drawMenuRifts(R: IRenderer, rifts: MenuRift[]): void {
    for (const rf of rifts) {
      const { lenP, widP, alpha, snake } = calcRiftAnim(rf.state, rf.t);
      drawRift(R, { x: rf.x, y: rf.y, size: rf.size, seed: rf.seed, rot: rf.rot, time: 0 }, lenP, widP, alpha, snake);
    }
  }

  private drawMenuEnemies(R: IRenderer, enemies: MenuEnemy[], time: number): void {
    for (const e of enemies) {
      this.drawMenuEnemy(R, e, time);
    }
  }

  private drawMenuEnemy(R: IRenderer, e: MenuEnemy, time: number): void {
    drawShipPoly(R, e.x, e.y, e.angle, [[12, 0], [-6, 6], [-3, 0], [-6, -6]], rgba(C.drone, 0.7));

    const pulse = 0.7 + 0.3 * Math.sin(time * 4 + e.seed);
    R.circle(e.x, e.y, 3 * pulse, rgba(C.riftCore, 0.3), 8);
  }
}
