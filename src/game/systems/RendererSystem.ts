/**
 * RendererSystem — система отрисовки всех игровых объектов.
 * Извлечена из game.ts (~700 строк draw-методов).
 * Читает состояние из переданных данных и рисует через Renderer.
 */

import type { AsteroidField } from "../asteroids";
import { C, GUN_OFFS, MINE_LIFE, MINE_RADIUS, RATE_BOOST_TIME, type EnemyKind, type PickupKind } from "../balance";
import type { Fx } from "../fx";
import { clamp, rgba, TAU } from "../math";
import type { Renderer, RGBA } from "../render";
import { RiftField } from "../rifts";
import type { Starfield } from "../starfield";

/* ============================== config ============================== */

export interface RendererSystemConfig {
  fx: Fx;
  starfield: Starfield;
  asteroidField: AsteroidField;
  riftField: RiftField;
}

/* ============================== render state interfaces ============================== */

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

export interface EnemyRenderState {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  dead: boolean;
  parent: EnemyRenderState | null;
}

export interface PickupRenderState {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  seed: number;
}

export interface MineRenderState {
  x: number;
  y: number;
  fuse: number;
  seed: number;
}

export interface AllyDroneRenderState {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
  phase: number;
  hp: number;
  maxHp: number;
  target: EnemyRenderState | null;
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
}

/* ============================== RendererSystem ============================== */

export class RendererSystem {
  private config: RendererSystemConfig;

  constructor(config: RendererSystemConfig) {
    this.config = config;
  }

  /* ============================== main draw ============================== */

  draw(
    R: Renderer,
    time: number,
    camX: number,
    camY: number,
    zoom: number,
    state: "menu" | "playing" | "active" | "cleared" | "dying" | "over",
    player: PlayerRenderState | null,
    enemies: EnemyRenderState[],
    bullets: BulletRenderState[],
    ebullets: EBulletRenderState[],
    pickups: PickupRenderState[],
    mines: MineRenderState[],
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
      this.drawPickups(R, pickups, time);
      this.drawMines(R, mines, time);
      this.drawEnemies(R, enemies, time);
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

  /* ============================== pickups ============================== */

  private drawPickups(R: Renderer, pickups: PickupRenderState[], time: number) {
    for (const p of pickups) {
      const blinkA = p.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(p.life * 7)) : 1;
      const rot = time * 1.4 + p.seed;
      const col =
        p.kind === "heal25" || p.kind === "heal50" || p.kind === "heal100"
          ? C.heal
          : p.kind === "rate20" || p.kind === "rate40" || p.kind === "rate60"
            ? C.fighter
            : p.kind === "gun"
              ? C.player
              : p.kind === "dash"
                ? C.dash
                : p.kind === "miner"
                  ? C.mine
                  : p.kind === "mineral"
                    ? C.heal
                    : C.mint;
      const pr = 15 + Math.sin(time * 4 + p.seed) * 2;
      R.circle(p.x, p.y, pr, rgba(col, 0.35 * blinkA), 26);
      const c1 = Math.cos(rot);
      const s1 = Math.sin(rot);
      switch (p.kind) {
        case "heal25":
        case "heal50":
        case "heal100": {
          const s = p.kind === "heal100" ? 7.5 : p.kind === "heal50" ? 6.5 : 5.5;
          R.pushLine(p.x - s * c1, p.y - s * s1, p.x + s * c1, p.y + s * s1, rgba(col, blinkA));
          R.pushLine(p.x + s * s1, p.y - s * c1, p.x - s * s1, p.y + s * c1, rgba(col, blinkA));
          break;
        }
        case "rate20":
        case "rate40":
        case "rate60": {
          R.pushLine(p.x + 3, p.y - 8, p.x - 4, p.y + 1, rgba(col, blinkA));
          R.pushLine(p.x - 4, p.y + 1, p.x + 1, p.y + 1, rgba(col, blinkA));
          R.pushLine(p.x + 1, p.y + 1, p.x - 3, p.y + 8, rgba(col, blinkA));
          break;
        }
        case "gun": {
          R.pushLine(p.x - 6, p.y - 3, p.x + 7, p.y - 3, rgba(col, blinkA));
          R.pushLine(p.x - 6, p.y + 3, p.x + 7, p.y + 3, rgba(col, blinkA));
          R.pushLine(p.x - 6, p.y - 3, p.x - 6, p.y + 3, rgba(col, blinkA));
          break;
        }
        case "drone": {
          this.drawShipPoly(R, p.x, p.y, rot, [[6, 0], [-4, 4], [-4, -4]], rgba(col, blinkA));
          R.circle(p.x, p.y, 9.5, rgba(col, 0.4 * blinkA), 18);
          break;
        }
        case "dash": {
          const L = 10;
          const Wd = 7;
          const tx = p.x + L * c1;
          const ty = p.y + L * s1;
          R.pushLine(tx, ty, p.x - L * 0.5 * c1 - Wd * s1, p.y - L * 0.5 * s1 + Wd * c1, rgba(col, blinkA));
          R.pushLine(tx, ty, p.x - L * 0.5 * c1 + Wd * s1, p.y - L * 0.5 * s1 - Wd * c1, rgba(col, blinkA));
          break;
        }
        case "miner": {
          const s = 5.5;
          R.polyline(
            [[p.x, p.y - s], [p.x + s, p.y], [p.x, p.y + s], [p.x - s, p.y]],
            true,
            rgba(col, blinkA)
          );
          const sp = s + 3.5;
          R.pushLine(p.x, p.y - s, p.x, p.y - sp, rgba(col, blinkA));
          R.pushLine(p.x + s, p.y, p.x + sp, p.y, rgba(col, blinkA));
          R.pushLine(p.x, p.y + s, p.x, p.y + sp, rgba(col, blinkA));
          R.pushLine(p.x - s, p.y, p.x - sp, p.y, rgba(col, blinkA));
          break;
        }
        case "mineral": {
          const s = 6.5;
          R.polyline(
            [[p.x, p.y - s], [p.x + s, p.y - s * 0.3], [p.x + s * 0.6, p.y + s], [p.x - s * 0.6, p.y + s], [p.x - s, p.y - s * 0.3]],
            true,
            rgba(col, blinkA)
          );
          R.pushLine(p.x, p.y - s, p.x, p.y + s, rgba(col, 0.4 * blinkA));
          break;
        }
      }
    }
  }

  /* ============================== mines ============================== */

  private drawMines(R: Renderer, mines: MineRenderState[], time: number) {
    for (const m of mines) {
      R.dashedCircle(m.x, m.y, MINE_RADIUS, rgba(C.mine, 0.16), 14, time * 0.5);

      const urgency = clamp(1 - m.fuse / MINE_LIFE, 0, 1);
      const blink = Math.sin(time * (6 + urgency * 14) + m.seed) > -0.2 ? 1 : 0.45;
      const s = 9 + Math.sin(time * 3 + m.seed) * 1.2;
      const c = rgba(C.mine, 0.95 * blink);

      R.polyline(
        [[m.x, m.y - s], [m.x + s, m.y], [m.x, m.y + s], [m.x - s, m.y]],
        true,
        c
      );
      const sp = s + 5;
      R.pushLine(m.x, m.y - s, m.x, m.y - sp, c);
      R.pushLine(m.x + s, m.y, m.x + sp, m.y, c);
      R.pushLine(m.x, m.y + s, m.x, m.y + sp, c);
      R.pushLine(m.x - s, m.y, m.x - sp, m.y, c);
      R.pushLine(m.x - 2.5, m.y, m.x + 2.5, m.y, rgba(C.white, 0.9 * blink));
      R.pushLine(m.x, m.y - 2.5, m.x, m.y + 2.5, rgba(C.white, 0.9 * blink));
    }
  }

  /* ============================== enemies ============================== */

  private drawEnemies(R: Renderer, enemies: EnemyRenderState[], time: number) {
    for (const e of enemies) {
      if (e.dead) continue;
      const base = this.kindColor(e.kind);
      const flash = e.flash > 0 ? 1 : 0;
      const [r, g, b] = rgba(base, 1);
      const col: RGBA = [
        Math.min(1, r + flash * 0.6),
        Math.min(1, g + flash * 0.6),
        Math.min(1, b + flash * 0.6),
        1,
      ];
      switch (e.kind) {
        case "drone": {
          const rot = e.angle + Math.sin(time * 3 + e.seed) * 0.12;
          this.drawShipPoly(R, e.x, e.y, rot, [[9, 0], [-7, 7], [-4, 0], [-7, -7]], col);
          break;
        }
        case "hunter": {
          this.drawShipPoly(R, e.x, e.y, e.angle, [[13, 0], [-8, 6], [-4, 0], [-8, -6]], col);
          R.circle(
            e.x + Math.cos(e.angle) * 5,
            e.y + Math.sin(e.angle) * 5,
            2,
            rgba(C.hunter, 0.95),
            8
          );
          R.pushLine(
            e.x + Math.cos(e.angle) * 16,
            e.y + Math.sin(e.angle) * 16,
            e.x + Math.cos(e.angle) * 24,
            e.y + Math.sin(e.angle) * 24,
            rgba(C.hunter, 0.45)
          );
          break;
        }
        case "fighter": {
          this.drawShipPoly(R, e.x, e.y, e.angle, [[14, 0], [-10, 9], [-5, 0], [-10, -9]], col);
          break;
        }
        case "cruiser": {
          this.drawShipPoly(R, e.x, e.y, e.angle, [[22, 0], [8, 14], [-18, 12], [-18, -12], [8, -14]], col);
          R.circle(e.x, e.y, 8, rgba(base, 0.5), 16);
          break;
        }
        case "carrier": {
          this.drawShipPoly(R, e.x, e.y, e.angle, [[30, 0], [10, 20], [-24, 16], [-24, -16], [10, -20]], col);
          R.circle(e.x, e.y, 12, rgba(base, 0.4), 20);
          R.dashedCircle(e.x, e.y, 20, rgba(base, 0.3), 8, time * 0.8);
          break;
        }
      }
      if (e.maxHp > 40 && e.hp < e.maxHp) {
        const f = clamp(e.hp / e.maxHp, 0, 1);
        R.dashedCircle(e.x, e.y, e.r + 6, rgba(base, 0.4), Math.max(3, Math.round(10 * f)), time, 0.4);
      }
    }
  }

  private kindColor(kind: EnemyKind): string {
    switch (kind) {
      case "drone": return C.drone;
      case "hunter": return C.hunter;
      case "fighter": return C.fighter;
      case "cruiser": return C.cruiser;
      case "carrier": return C.carrier;
    }
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
      R.dashedCircle(player.x, player.y, 58, rgba(C.mint, 0.12), 20, time * 0.7);
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
      this.drawShipPoly(
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
    this.drawShipPoly(
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
      const o = GUN_OFFS[i] ?? 0;
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
      if (b.heavy) {
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
    const prog = 0.75 + 0.25 * Math.sin(time * 0.8);
    RiftField.drawShape(R, 0, -30, 130 * prog, 40 * prog, 7, time, 1, time * 0.05, 1);
    for (let i = 0; i < 3; i++) {
      const a = time * (0.25 + i * 0.07) + (i * TAU) / 3;
      const ox = Math.cos(a) * (200 + i * 46);
      const oy = -30 + Math.sin(a) * (115 + i * 28);
      this.drawShipPoly(
        R, ox, oy, a + Math.PI / 2,
        [[10, 0], [-8, 8], [-4, 0], [-8, -8]],
        rgba(C.drone, 0.35)
      );
    }
  }

  /* ============================== helpers ============================== */

  private drawShipPoly(
    R: Renderer,
    x: number,
    y: number,
    angle: number,
    pts: Array<[number, number]>,
    c: RGBA
  ) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const world: Array<[number, number]> = pts.map(([px, py]) => [
      x + px * cos - py * sin,
      y + px * sin + py * cos,
    ]);
    R.polyline(world, true, c);
  }
}
