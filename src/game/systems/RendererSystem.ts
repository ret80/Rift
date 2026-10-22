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
 */

import type { AsteroidField } from "../asteroids";
import { EnemyKind } from "../balance";
import type { Fx } from "../fx";
import type { RenderScene } from "../types/render";import type { Renderer } from "../render";
import { RiftField } from "../rifts";
import type { Starfield } from "../starfield";
import { renderPickups, buildPickupState, type PickupRenderState as PRS } from "./Renderers/PickupRenderer";
import { renderEnemies, buildEnemyState, type EnemyRenderState as ERS } from "./Renderers/EnemyRenderer";
import { renderPlayer, buildPlayerState, type PlayerRenderState } from "./Renderers/PlayerRenderer";
import { renderAllyDrones, buildDroneState, type AllyDroneRenderState } from "./Renderers/DroneRenderer";
import { renderBullets, buildBulletState, buildEBulletState, type BulletRenderState, type EBulletRenderState } from "./Renderers/BulletRenderer";
import { renderZone, buildZoneState, type ZoneRenderState } from "./Renderers/ZoneRenderer";
import { calcRiftAnim, drawRift } from "./Renderers/RiftAnimation";
import { calcMenuRiftAnim } from "./Renderers/RiftAnimation";
import { drawShipPoly } from "./Renderers/ShipRenderer";
import { C } from "../balance";
import { rgba } from "../math";

/* ============================== config ============================== */

export interface RendererSystemConfig {
  fx: Fx;
  starfield: Starfield;
  asteroidField: AsteroidField;
  riftField: RiftField;
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
  render(
    R: Renderer,
    scene: RenderScene
  ) {
    const {
      state, time,
      player, aim, guns, bonus,
      enemies, bullets, enemyBullets: ebullets, pickups, allyDrones: drones, weaves, beams,
      zone: zoneState, camera, view, phantomLevel,
    } = scene;

    // Build render states — each renderer owns its transformation
    const playerRender = player
      ? buildPlayerState(
          player.x, player.y, player.angle,
          player.hp, player.maxHp, player.invuln,
          player.thrusting, player.vx, player.vy,
          aim, guns, bonus, phantomLevel
        )
      : null;

    const enemyRender = buildEnemyState(enemies);
    const bulletRender = buildBulletState(bullets);
    const ebulletRender = buildEBulletState(ebullets);
    const pickupRender = buildPickupState(pickups as never[] as Parameters<typeof buildPickupState>[0]);
    const droneRender = buildDroneState(drones);
    const zoneRender = zoneState ? buildZoneState(
      zoneState.active, zoneState.x, zoneState.y,
      zoneState.radius, zoneState.targetRadius, zoneState.alpha
    ) : null;

    this.draw(
      R,
      time,
      camera.x,
      camera.y,
      camera.zoom,
      state as "menu" | "playing" | "active" | "dying" | "over",
      playerRender,
      enemyRender,
      bulletRender,
      ebulletRender,
      pickupRender,
      droneRender,
      zoneRender,
      view.width,
      view.height,
      weaves as Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number }>,
      beams as Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number; seed: number }>
    );
  }

  renderMenu(
    R: Renderer,
    starfield: Starfield,
    asteroidField: AsteroidField,
    riftField: RiftField,
    menuRifts: Array<{
      x: number; y: number; t: number; state: "opening" | "spawning" | "closing";
      queue: EnemyKind[]; timer: number; seed: number; rot: number; size: number;
      nextSpawnT: number;
    }>,
    menuEnemies: Array<{
      x: number; y: number; vx: number; vy: number;
      kind: EnemyKind; angle: number; seed: number;
    }>,
    cssWidth: number,
    cssHeight: number
  ) {
    R.resize(cssWidth, cssHeight);
    R.beginFrame();
    R.setMode("world");
    R.setCamera(0, 0, 1, 0, 0);
    starfield.draw(R, 0, 0, 1, 0, cssWidth, cssHeight);
    asteroidField.draw(R, 0);
    this.drawMenuScene(R, 0);
    this.drawMenuRifts(R, menuRifts, 0);
    this.drawMenuEnemies(R, menuEnemies, 0);
    R.finish(0);
  }

  draw(
    R: Renderer,
    time: number,
    camX: number,
    camY: number,
    zoom: number,
    state: "menu" | "playing" | "active" | "dying" | "over",
    player: PlayerRenderState | null,
    enemies: ERS[],
    bullets: BulletRenderState[],
    ebullets: EBulletRenderState[],
    pickups: PRS[],
    allyDrones: AllyDroneRenderState[],
    zone: ZoneRenderState | null,
    viewW: number,
    viewH: number,
    weaves: Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number }> = [],
    beams: Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number; seed: number }> = []
  ) {
    R.resize(viewW, viewH);
    R.beginFrame();
    R.setMode("world");
    R.setCamera(camX, camY, zoom, this.config.fx.shakeX, this.config.fx.shakeY);

    this.config.starfield.draw(R, camX, camY, zoom, time, viewW, viewH);
    this.config.asteroidField.draw(R, time);

    if (state === "menu") {
      this.drawMenuScene(R, time);
    } else {
      if (zone) renderZone(R, zone, time);
      this.drawRifts(R, time);
      renderPickups(R, pickups, time);
      renderEnemies(R, enemies, time);
      renderAllyDrones(R, allyDrones, time, player);
      if (player && state !== "dying" && state !== "over") {
        renderPlayer(R, player, time);
      }
      renderBullets(R, bullets, ebullets);
      this.drawWeaves(R, weaves, time);
      this.drawBeams(R, beams, time);
      this.config.fx.draw(R);
    }

    R.finish(time);
  }

  /* ============================== weaves ============================== */

  private drawWeaves(
    R: Renderer,
    weaves: Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number }>,
    _time: number
  ): void {
    for (const w of weaves) {
      const t = w.maxLife > 0 ? Math.max(0, w.life / w.maxLife) : 0;
      const a = t * 0.7;
      if (a <= 0) continue;
      R.pushLine(w.x1, w.y1, w.x2, w.y2, rgba("#c06bff", a));
    }
  }

  /* ============================== beams ============================== */

  private drawBeams(
    R: Renderer,
    beams: Array<{ x1: number; y1: number; x2: number; y2: number; life: number; maxLife: number; seed: number }>,
    _time: number
  ): void {
    for (const b of beams) {
      const t = b.maxLife > 0 ? Math.max(0, b.life / b.maxLife) : 0;
      const a = t;
      if (a <= 0) continue;
      R.pushBeam(b.x1, b.y1, b.x2, b.y2, 5, rgba("#ff2d55", a), b.seed);
      // Внутреннее яркое ядро — оно даёт «белый» центр луча.
      R.pushBeam(b.x1, b.y1, b.x2, b.y2, 1.6, rgba("#ffd9e0", a), b.seed + 1);
    }
  }

  /* ============================== rifts ============================== */

  private drawRifts(R: Renderer, time: number): void {
    this.config.riftField.draw(R, time);
  }

  /* ============================== menu scene ============================== */

  private drawMenuScene(R: Renderer, time: number): void {
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

  private drawMenuRifts(
    R: Renderer,
    rifts: Array<{
      x: number; y: number; t: number; state: "opening" | "spawning" | "closing";
      seed: number; rot: number; size: number;
    }>,
    time: number
  ) {
    for (const rf of rifts) {
      const { lenP, widP, alpha, snake } = calcRiftAnim(rf.state, rf.t);
      drawRift(R, { x: rf.x, y: rf.y, size: rf.size, seed: rf.seed, rot: rf.rot, time }, lenP, widP, alpha, snake);
    }
  }

  private drawMenuEnemies(
    R: Renderer,
    enemies: Array<{
      x: number; y: number; vx: number; vy: number;
      kind: EnemyKind; angle: number; seed: number;
    }>,
    time: number
  ) {
    for (const e of enemies) {
      this.drawMenuEnemy(R, e, time);
    }
  }

  private drawMenuEnemy(
    R: Renderer,
    e: { x: number; y: number; vx: number; vy: number; kind: EnemyKind; angle: number; seed: number },
    time: number
  ) {
    drawShipPoly(R, e.x, e.y, e.angle, [[12, 0], [-6, 6], [-3, 0], [-6, -6]], rgba(C.drone, 0.7));

    const pulse = 0.7 + 0.3 * Math.sin(time * 4 + e.seed);
    R.circle(e.x, e.y, 3 * pulse, rgba(C.riftCore, 0.3), 8);
  }
}
