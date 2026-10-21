/**
 * RendererSystem — система отрисовки всех игровых объектов.
 * Извлечена из game.ts (~700 строк draw-методов).
 * Читает состояние из переданных данных и рисует через Renderer.
 */

import type { AsteroidField } from "../asteroids";
import {
  C,
  RATE_BOOST_TIME,
  EnemyKind,
} from "../balance";
import type { Fx } from "../fx";
import { clamp, rgba, TAU } from "../math";
import type { Renderer, RGBA } from "../render";
import { RiftField } from "../rifts";
import type { Starfield } from "../starfield";
import { CANNON_BARREL_OFFSETS } from "../weapons/CannonWeapon";
import { DRONE_ORBIT_RADIUS } from "../weapons/DroneWeapon";
import { renderPickups, type PickupRenderState as PRS } from "./Renderers/PickupRenderer";
import { renderEnemies, type EnemyRenderState as ERS } from "./Renderers/EnemyRenderer";
import { drawShipPoly } from "./Renderers/ShipRenderer";
import { calcMenuRiftAnim, calcRiftAnim, drawRift } from "./Renderers/RiftAnimation";

/* ============================== config ============================== */

export interface RendererSystemConfig {
  fx: Fx;
  starfield: Starfield;
  asteroidField: AsteroidField;
  riftField: RiftField;
}

/* ============================== render state interfaces ============================== */

/* EnemyRenderState and PickupRenderState are imported from ./Renderers */

export interface PlayerRenderState {
  x: number;
  y: number;
  angle: number;
  aimA: number | null;
  hp: number;
  maxHp: number;
  invuln: number;
  guns: number;
  rateT: number;
  rateBoost: number;
  dashT: number;
  thrusting: boolean;
  pvx: number;
  pvy: number;
}

export interface ZoneRenderState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
}

export interface AllyDroneRenderState {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
  phase: number;
  hp: number;
  maxHp: number;
  target: ERS | null;
  retargetT: number;
  flash: number;
}

export interface BulletRenderState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
}

export interface EBulletRenderState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  heavy: boolean;
  cruiser: boolean;
}

/* ============================== RendererSystem ============================== */

export class RendererSystem {
  private config: RendererSystemConfig;

  constructor(config: RendererSystemConfig) {
    this.config = config;
  }

  /* ============================== main draw ============================== */

  render(
    R: Renderer,
    gameState: { type: string; time: number; wave: number; score: number },
    player: PlayerRenderState | null,
    enemies: ERS[],
    bullets: BulletRenderState[],
    ebullets: EBulletRenderState[],
    pickups: PRS[],
    allyDrones: AllyDroneRenderState[],
    zone: ZoneRenderState | null,
    camX: number,
    camY: number,
    zoom: number,
    viewW: number,
    viewH: number
  ) {
    this.draw(
      R,
      gameState.time,
      camX,
      camY,
      zoom,
      gameState.type as "menu" | "playing" | "active" | "cleared" | "dying" | "over",
      player,
      enemies,
      bullets,
      ebullets,
      pickups,
      allyDrones,
      zone,
      viewW,
      viewH
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
    state: "menu" | "playing" | "active" | "cleared" | "dying" | "over",
    player: PlayerRenderState | null,
    enemies: ERS[],
    bullets: BulletRenderState[],
    ebullets: EBulletRenderState[],
    pickups: PRS[],
    allyDrones: AllyDroneRenderState[],
    zone: ZoneRenderState | null,
    viewW: number,
    viewH: number
  ) {
    R.resize(viewW, viewH);
    R.beginFrame();
    R.setMode("world");
    R.setCamera(camX, camY, zoom, this.config.fx.shakeX, this.config.fx.shakeY);

    this.drawStars(R, camX, camY, zoom, time, viewW, viewH);
    this.config.asteroidField.draw(R, time);

    if (state === "menu") {
      this.drawMenuScene(R, time);
    } else {
      if (zone) this.drawZone(R, zone, time);
      this.drawRifts(R, time);
      renderPickups(R, pickups, time);
      renderEnemies(R, enemies, time);
      this.drawAllyDrones(R, allyDrones, time, player);
      if (player && state !== "dying" && state !== "over") {
        this.drawPlayer(R, player, time);
      }
      this.drawBullets(R, bullets, ebullets);
      this.drawFx(R);
    }

    R.finish(time);
  }

  /* ============================== stars ============================== */

  private drawStars(
    R: Renderer,
    camX: number,
    camY: number,
    zoom: number,
    time: number,
    viewW: number,
    viewH: number
  ) {
    this.config.starfield.draw(R, camX, camY, zoom, time, viewW, viewH);
  }

  /* ============================== zone ============================== */

  private drawZone(R: Renderer, zone: ZoneRenderState, time: number) {
    if (!zone.active || zone.alpha <= 0) return;
    const a = zone.alpha;
    const zr = zone.radius;
    const segs = 90;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * TAU;
      const wob =
        Math.sin(ang * 6 + time * 2.2) * 4 +
        Math.sin(ang * 11 - time * 3.1) * 2.5 +
        Math.sin(ang * 3 + time * 1.3) * 3;
      const rr = zr + wob;
      const x = zone.x + Math.cos(ang) * rr;
      const y = zone.y + Math.sin(ang) * rr;
      if (i > 0) R.pushLine(px, py, x, y, rgba(C.zone, 0.5 * a));
      px = x;
      py = y;
    }
    R.dashedCircle(zone.x, zone.y, zr * 0.96, rgba(C.zone, 0.3 * a), 24, time * 0.8);
  }

  /* ============================== rifts ============================== */

  private drawRifts(R: Renderer, time: number) {
    this.config.riftField.draw(R, time);
  }

  /* ============================== ally drones ============================== */

  private drawAllyDrones(
    R: Renderer,
    drones: AllyDroneRenderState[],
    time: number,
    player: PlayerRenderState | null
  ) {
    const n = drones.length;
    if (n === 0) return;
    if (player) {
      R.dashedCircle(player.x, player.y, DRONE_ORBIT_RADIUS, rgba(C.mint, 0.12), 20, time * 0.7);
    }
    for (const d of drones) {
      const hpF = clamp(d.hp / d.maxHp, 0, 1);
      const cr = 0.62 + (1 - hpF) * 0.38;
      const cg = 1 - (1 - hpF) * 0.5;
      const cb = 0.91 - (1 - hpF) * 0.6;
      const flash = d.flash > 0 ? 1 : 0;
      const col: RGBA = [
        Math.min(1, cr + flash * 0.5),
        Math.min(1, cg + flash * 0.5),
        Math.min(1, cb + flash * 0.5),
        0.95,
      ];
      drawShipPoly(
        R, d.x, d.y, d.angle,
        [[7, 0], [-5, 5], [-2, 0], [-5, -5]],
        col
      );
      if (hpF < 1) {
        R.dashedCircle(d.x, d.y, 11, [cr, cg, cb, 0.5], 10, time, 0.35);
      }
      R.pushLine(
        d.x - Math.cos(d.angle) * 5,
        d.y - Math.sin(d.angle) * 5,
        d.x - Math.cos(d.angle) * (8 + Math.random() * 3),
        d.y - Math.sin(d.angle) * (8 + Math.random() * 3),
        rgba(C.mint, 0.5)
      );
    }
  }

  /* ============================== player ============================== */

  private drawPlayer(R: Renderer, player: PlayerRenderState, time: number) {
    const blink = player.invuln > 0 ? (Math.sin(time * 30) > 0 ? 0.35 : 1) : 1;

    // thruster
    if (player.thrusting) {
      const cos = Math.cos(player.angle);
      const sin = Math.sin(player.angle);
      const len = 10 + Math.random() * 8;
      R.pushLine(
        player.x - cos * 12, player.y - sin * 12,
        player.x - cos * (12 + len), player.y - sin * (12 + len),
        rgba(C.player, 0.6 * blink)
      );
    }

    // dash shell
    if (player.dashT > 0) {
      this.drawDashShell(R, player, time);
    }

    // hull
    drawShipPoly(
      R, player.x, player.y, player.angle,
      [[16, 0], [-11, 10], [-6, 0], [-11, -10]],
      rgba(C.player, blink)
    );

    // turret
    this.drawTurret(R, player, blink);

    // fire-rate boost ring
    if (player.rateT > 0) {
      this.drawRateRing(R, player, time);
    }
  }

  private drawDashShell(R: Renderer, player: PlayerRenderState, time: number) {
    const a = player.angle;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const pulse = 1 + Math.sin(time * 16) * 0.08;
    const L = 30 * pulse;
    const Wd = 20 * pulse;
    const tipX = player.x + ca * L;
    const tipY = player.y + sa * L;
    const w1x = player.x - ca * L * 0.55 - sa * Wd;
    const w1y = player.y - sa * L * 0.55 + ca * Wd;
    const w2x = player.x - ca * L * 0.55 + sa * Wd;
    const w2y = player.y - sa * L * 0.55 - ca * Wd;
    let glow = Math.min(1, player.dashT / 0.4);
    if (player.dashT < 1.0) {
      const hz = 6 + (1 - player.dashT) * 12;
      glow *= 0.55 + 0.45 * Math.sin(time * hz);
    }
    R.pushLine(tipX, tipY, w1x, w1y, rgba(C.dash, 0.95 * glow));
    R.pushLine(tipX, tipY, w2x, w2y, rgba(C.dash, 0.95 * glow));
    const L2 = L * 0.62;
    const W2 = Wd * 0.62;
    R.pushLine(
      player.x + ca * L2, player.y + sa * L2,
      player.x - ca * L2 * 0.55 - sa * W2, player.y - sa * L2 * 0.55 + ca * W2,
      rgba(C.dash, 0.4 * glow)
    );
    R.pushLine(
      player.x + ca * L2, player.y + sa * L2,
      player.x - ca * L2 * 0.55 + sa * W2, player.y - sa * L2 * 0.55 - ca * W2,
      rgba(C.dash, 0.4 * glow)
    );
  }

  private drawTurret(R: Renderer, player: PlayerRenderState, blink: number) {
    const ba = player.aimA !== null ? player.aimA : player.angle;
    const gcos = Math.cos(ba);
    const gsin = Math.sin(ba);
    for (let i = 0; i < player.guns; i++) {
      const o = CANNON_BARREL_OFFSETS[i] ?? 0;
      const bx = player.x + 8 * gcos - o * gsin;
      const by = player.y + 8 * gsin + o * gcos;
      R.pushLine(bx, by, bx + 8 * gcos, by + 8 * gsin, rgba(C.mint, 0.85 * blink));
    }
    if (player.aimA !== null) {
      R.pushLine(
        player.x + Math.cos(player.aimA) * 20, player.y + Math.sin(player.aimA) * 20,
        player.x + Math.cos(player.aimA) * 30, player.y + Math.sin(player.aimA) * 30,
        rgba(C.mint, 0.3 * blink)
      );
    }
  }

  private drawRateRing(R: Renderer, player: PlayerRenderState, time: number) {
    const f = clamp(player.rateT / RATE_BOOST_TIME, 0, 1);
    const rr = 26;
    const segs = Math.max(6, Math.round(30 * f));
    const a0 = -Math.PI / 2;
    let pxp = player.x + Math.cos(a0) * rr;
    let pyp = player.y + Math.sin(a0) * rr;
    const blink = f < 0.2 ? (Math.sin(time * 14) > 0 ? 1 : 0.45) : 1;
    for (let i = 1; i <= segs; i++) {
      const a = a0 + (i / segs) * f * TAU;
      const nx = player.x + Math.cos(a) * rr;
      const ny = player.y + Math.sin(a) * rr;
      R.pushLine(pxp, pyp, nx, ny, rgba(C.fighter, 0.75 * blink));
      pxp = nx;
      pyp = ny;
    }
  }

  /* ============================== bullets ============================== */

  private drawBullets(R: Renderer, bullets: BulletRenderState[], ebullets: EBulletRenderState[]) {
    for (const b of bullets) {
      const l = 7;
      const d = Math.hypot(b.vx, b.vy) || 1;
      R.pushLine(
        b.x - (b.vx / d) * l, b.y - (b.vy / d) * l,
        b.x, b.y,
        rgba(C.bullet, 0.95)
      );
    }
    for (const b of ebullets) {
      if (b.cruiser) {
        // Cruiser bullets: large and ominous
        R.circle(b.x, b.y, 5.5, rgba(C.enemyBullet, 1), 12);
        R.circle(b.x, b.y, 3.2, rgba(C.white, 0.5), 8);
      } else if (b.heavy) {
        R.circle(b.x, b.y, 3.4, rgba(C.enemyBullet, 0.95), 10);
      } else {
        const l = 6;
        const d = Math.hypot(b.vx, b.vy) || 1;
        R.pushLine(
          b.x - (b.vx / d) * l, b.y - (b.vy / d) * l,
          b.x, b.y,
          rgba(C.enemyBullet, 0.9)
        );
      }
    }
  }

  /* ============================== fx ============================== */

  private drawFx(R: Renderer) {
    this.config.fx.draw(R);
  }

  /* ============================== menu scene ============================== */

  private drawMenuScene(R: Renderer, time: number) {
    // Animate rift through opening → spawning → closing lifecycle
    const cyclePos = time % 4.0;
    const { lenP, widP, alpha, snake } = calcMenuRiftAnim(cyclePos, time);
    
    drawRift(R, { x: 0, y: -30, size: 130, seed: 7, rot: time * 0.05, time }, lenP, widP, alpha, snake);
    
    for (let i = 0; i < 3; i++) {
      const a = time * (0.5 + i * 0.12) + (i * TAU) / 3;
      const ox = Math.cos(a) * (200 + i * 46);
      const oy = -30 + Math.sin(a) * (115 + i * 28);
      drawShipPoly(
        R, ox, oy, a + Math.PI / 2,
        [[10, 0], [-8, 8], [-4, 0], [-8, -8]],
        rgba(C.drone, 0.35)
      );
    }
  }

  /* ============================== menu rifts & enemies ============================== */

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
