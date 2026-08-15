import { Renderer, RGBA } from "./render";
import { AudioEngine, Volumes } from "./audio";
import { t } from "../i18n";
import {
  TAU,
  rand,
  clamp,
  ramp01,
  lerpAngle,
  easeOutCubic,
  rgba,
  mulberry32,
} from "./math";
import {
  C,
  PLAYER_MAX_SPEED,
  ZONE_EXPAND_SPEED,
  MAX_GUNS,
  MAX_ALLY_DRONES,
  GUN_OFFS,
  RATE_BOOST_TIME,
  DASH_TIME,
  DASH_ACCEL,
  DASH_SPEED,
  DASH_DMG,
  MINE_DELAY,
  MINE_RADIUS,
  MINE_DMG,
  MINE_LIFE,
  STAR_LAYERS,
  enemyDefFor,
  waveTotalFor,
  zoneRadiusFor,
  pickKindFor,
  dropChanceFor,
  type EnemyDef,
} from "./balance";
export type { EnemyKind } from "./balance";
import type { EnemyKind } from "./balance";

/* ============================== types ============================== */

export interface HudData {
  wave: number;
  score: number;
  best: number;
  hp: number;
  maxHp: number;
  killed: number;
  total: number;
  enemies: number;
  comboMult: number;
  time: number;
  guns: number;
  rateMult: number;
  rateT: number;
  drones: number;
  minerals: number;
}

export interface BannerData {
  title: string;
  sub?: string;
  color?: string;
}

export interface ToastData {
  text: string;
  color?: string;
}

export interface PopupData {
  id: number;
  x: number;
  y: number;
  text: string;
  color: string;
}

export interface CountData {
  id: number;
  label: string;
  value: string;
}

export interface StatsData {
  score: number;
  best: number;
  isBest: boolean;
  wave: number;
  kills: number;
  time: number;
}

interface Enemy {
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
  parent: Enemy | null;
}

interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
}

interface EBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  heavy: boolean;
}

type PickupKind =
  | "heal25"
  | "heal50"
  | "heal100"
  | "rate20"
  | "rate40"
  | "rate60"
  | "gun"
  | "drone"
  | "dash"
  | "miner"
  | "mineral";

export type AsteroidKind = "small" | "medium" | "large";

interface Asteroid {
  id: string;
  kind: AsteroidKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  spin: number;
  verts: number[];
  hp: number;
  maxHp: number;
}

interface Mine {
  x: number;
  y: number;
  /** safety timeout — the mine never lingers forever */
  fuse: number;
  seed: number;
}

interface Pickup {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  seed: number;
}

interface AllyDrone {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
  phase: number;
  hp: number;
  maxHp: number;
  target: Enemy | null;
  retargetT: number;
  flash: number;
}

interface Rift {
  x: number;
  y: number;
  t: number;
  state: "opening" | "spawning" | "closing";
  queue: EnemyKind[];
  timer: number;
  seed: number;
  rot: number;
  size: number;
}

interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  c: RGBA;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  c: RGBA;
  size: number;
}

interface Star {
  x: number;
  y: number;
  s: number;
  a: number;
  tw: number;
  ph: number;
  tint: number;
}

interface Hooks {
  onHud: (h: HudData) => void;
  onBanner: (b: BannerData | null) => void;
  onToast: (toast: ToastData | null) => void;
  onCountdown: (c: CountData | null) => void;
  onPopup: (p: PopupData) => void;
  onStats: (s: StatsData) => void;
  onPause: (p: boolean) => void;
}

/* ============================== constants ============================== */

const BEST_KEY = "rift9_best";

/* ============================== game ============================== */

export class Game {
  readonly audio = new AudioEngine();
  private renderer: Renderer;
  private hooks: Hooks;

  private raf = 0;
  private lastT = 0;
  private time = 0;
  private timeScale = 1;

  /* dev tools */
  private debugGod = false;
  private fpsEma = 60;
  private startWave = 1;

  private state: "menu" | "playing" | "active" | "cleared" | "dying" | "over" = "menu";
  private paused = false;
  private keys = new Set<string>();

  /* touch */
  private touchX = 0;
  private touchY = 0;
  private touchActive = false;

  /* player */
  private px = 0;
  private py = 0;
  private pvx = 0;
  private pvy = 0;
  private pAngle = -Math.PI / 2;
  private aimA: number | null = null;
  private hp = 100;
  private maxHp = 100;
  private invuln = 0;
  private fireCd = 0;
  private guns = 1;
  private rateBoost = 0;
  private rateT = 0;
  private thrusting = false;
  private dieT = 0;

  /* camera */
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private shakeMag = 0;
  private shakeX = 0;
  private shakeY = 0;
  private viewW = 800;
  private viewH = 600;

  /* entities */
  private enemies: Enemy[] = [];
  private bullets: Bullet[] = [];
  private ebullets: EBullet[] = [];
  private pickups: Pickup[] = [];
  private allyDrones: AllyDrone[] = [];

  /* dash & mines */
  private dashT = 0;
  private mines: Mine[] = [];
  private mineDropT = -1;

  /* minerals & asteroid field (chunk-generated, always around the ship) */
  private minerals = 0;
  private asteroids: Asteroid[] = [];
  private astChunks = new Map<string, Asteroid[]>();
  private astBoundsKey = "";
  private astGone = new Set<string>();
  private astFragSeq = 0;

  private rifts: Rift[] = [];
  private rings: Ring[] = [];
  private particles: Particle[] = [];

  /* waves & zone */
  private wave = 1;
  private waveTotal = 0;
  private allocated = 0;
  private killedWave = 0;
  private peakAlive = 0;
  private stepSize = 1;
  private dropThreshold = 1;

  private zoneOn = false;
  private zoneX = 0;
  private zoneY = 0;
  private zoneR = 0;
  private zoneTarget = 0;
  private zoneAlpha = 0;
  private zoneCollapse = -1;
  /* zone-edge danger */
  private edgeOutT = 0;
  private edgeTickT = 0;
  private edgeWarned = false;

  private cdT = 0;
  private cdLast = -1;
  private clearT = 0;
  /** guards the clear banner from ever firing twice for one wave */
  private waveClearSent = false;

  /* scoring */
  private score = 0;
  private best = 0;
  private killed = 0;
  private combo = 0;
  private comboT = 0;
  private runTime = 0;

  /* stars (infinite chunked field) */
  private starChunks = new Map<string, Star[]>();
  private starBoundsKey = "";

  private popupId = 0;
  private countId = 0;
  private announcedKinds = new Set<EnemyKind>();
  private flock: Enemy[] = [];

  private onResize = () => {
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
  };

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyP" || e.code === "Escape") {
      this.togglePause();
      return;
    }
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.keys.clear();
    this.touchActive = false;
    if (
      (this.state === "playing" ||
        this.state === "active" ||
        this.state === "cleared" ||
        this.state === "dying") &&
      !this.paused
    ) {
      this.togglePause();
      this.audio.setSuspended(true);
    }
  };

  private onVis = () => {
    if (document.hidden) this.onBlur();
  };

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.renderer = new Renderer(canvas);
    this.hooks = hooks;
    this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    this.onResize();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("resize", this.onResize);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);

    this.lastT = performance.now();
    const loop = (now: number) => {
      const rdt = clamp((now - this.lastT) / 1000, 0, 0.05);
      this.lastT = now;
      if (rdt > 0) this.fpsEma = this.fpsEma * 0.92 + (1 / rdt) * 0.08;
      this.step(rdt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  destroy() {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("resize", this.onResize);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
    this.audio.dispose();
  }

  /* ---------------- dev tools ---------------- */

  setDebugGod(v: boolean) {
    if (this.debugGod === v) return;
    this.debugGod = v;
    if (this.state !== "menu") {
      this.popup(this.px, this.py - 34, t(v ? "debug.godOn" : "debug.godOff"), "#ffb84d");
      if (v) this.burst(this.px, this.py, 10, "#ffb84d", 180, 0.35);
    }
  }

  isDebugGod() {
    return this.debugGod;
  }

  fps() {
    return this.fpsEma;
  }

  setStartWave(w: number) {
    this.startWave = clamp(Math.round(w), 1, 50);
  }

  setVolumes(v: Volumes) {
    this.audio.setVolumes(v);
  }

  setTouch(active: boolean, x: number, y: number) {
    this.touchActive = active;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    const dz = 0.12;
    this.touchX = Math.abs(x) < dz ? 0 : x;
    this.touchY = Math.abs(y) < dz ? 0 : y;
  }

  togglePause() {
    if (this.state === "menu" || this.state === "over") return;
    this.paused = !this.paused;
    if (this.paused) {
      this.audio.setCombat(false);
    } else {
      this.audio.setSuspended(false);
      if (this.state === "active") this.audio.setCombat(true);
    }
    this.hooks.onPause(this.paused);
  }

  /* ---------------- run control ---------------- */

  startRun() {
    this.state = "playing";
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.rifts = [];
    this.pickups = [];
    this.allyDrones = [];
    this.mines = [];
    this.mineDropT = -1;
    this.dashT = 0;
    this.minerals = 0;
    this.asteroids = [];
    this.astChunks.clear();
    this.astGone.clear();
    this.astBoundsKey = "";
    this.particles = [];
    this.rings = [];
    this.px = 0;
    this.py = 0;
    this.pvx = 0;
    this.pvy = 0;
    this.pAngle = -Math.PI / 2;
    this.camX = 0;
    this.camY = 0;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.guns = 1;
    this.rateBoost = 0;
    this.rateT = 0;
    this.score = 0;
    this.killed = 0;
    this.combo = 0;
    this.comboT = 0;
    this.runTime = 0;
    this.timeScale = 1;
    this.shakeMag = 0;
    this.zoneOn = false;
    this.zoneAlpha = 0;
    this.zoneCollapse = -1;
    this.announcedKinds.clear();
    this.paused = false;
    this.audio.setSuspended(false);
    this.audio.setCombat(false);
    this.hooks.onPause(false);
    this.wave = this.startWave;
    this.beginCountdown();
  }

  toMenu() {
    this.state = "menu";
    this.paused = false;
    this.audio.setSuspended(false);
    this.audio.setCombat(false);
    this.enemies = [];
    this.bullets = [];
    this.ebullets = [];
    this.rifts = [];
    this.pickups = [];
    this.allyDrones = [];
    this.mines = [];
    this.mineDropT = -1;
    this.dashT = 0;
    this.particles = [];
    this.rings = [];
    this.zoneOn = false;
    this.zoneAlpha = 0;
    this.zoneCollapse = -1;
    this.timeScale = 1;
    this.hooks.onPause(false);
    this.hooks.onCountdown(null);
    this.hooks.onBanner(null);
  }

  private beginCountdown() {
    this.cdT = 15;
    this.cdLast = -1;
    this.audio.setCombatWave(this.wave);
  }

  /* ---------------- wave config ---------------- */

  private waveTotalCount(w: number) {
    return waveTotalFor(w);
  }

  private zoneRadius(w: number) {
    return zoneRadiusFor(w);
  }

  private rampW(w: number, s: number, f: number) {
    return ramp01(w, s, f);
  }

  /** Gradual introduction of enemy classes across waves. */
  private pickKind(): EnemyKind {
    return pickKindFor(this.wave);
  }

  private buildQueue(count: number): EnemyKind[] {
    const q: EnemyKind[] = [];
    for (let i = 0; i < count; i++) q.push(this.pickKind());
    // guarantee at least one of each unlocked class so the player meets them
    const need: Array<[EnemyKind, number]> = [
      ["fighter", 2],
      ["hunter", 4],
      ["cruiser", 5],
      ["carrier", 9],
    ];
    for (const [kind, minW] of need) {
      if (this.wave >= minW && !q.includes(kind)) {
        const di = q.indexOf("drone");
        if (di >= 0) q[di] = kind;
      }
    }
    return q;
  }

  private riftCountFor(w: number) {
    if (w === 1) return 2;
    if (w < 6) return 3;
    if (w < 12) return 4;
    if (w < 20) return 4 + (Math.random() < 0.5 ? 1 : 0);
    return 5;
  }

  private initWave() {
    const total = this.waveTotalCount(this.wave);
    this.waveTotal = total;
    this.allocated = 0;
    this.killedWave = 0;
    this.waveClearSent = false;
    this.stepSize = Math.max(1, Math.round(total * 0.05));
    this.dropThreshold = Math.max(1, Math.round(total * 0.05));

    const initial = Math.round(total * 0.3);
    this.allocated = initial;
    this.peakAlive = initial;

    const queue = this.buildQueue(initial);
    const riftCount = Math.min(this.riftCountFor(this.wave), Math.max(1, initial));

    // announce any newly-introduced target classes
    for (const k of queue) {
      if (!this.announcedKinds.has(k)) {
        this.announcedKinds.add(k);
        const key = ("toast." + k) as "toast.drone";
        this.hooks.onToast({ text: t(key), color: C.rift });
      }
    }

    // split the initial batch across the rifts round-robin
    const queues: EnemyKind[][] = Array.from({ length: riftCount }, () => []);
    queue.forEach((k, i) => queues[i % riftCount].push(k));
    for (let i = 0; i < riftCount; i++) {
      this.spawnRift(queues[i], 0.15 + i * 0.5);
    }
  }

  private spawnRiftPoint(): { x: number; y: number } {
    const inner = this.zoneTarget * 0.25;
    const outer = Math.max(
      inner + 80,
      Math.min(this.zoneTarget * 0.62, this.zoneTarget - 115)
    );
    let bestP = { x: this.zoneX, y: this.zoneY - this.zoneTarget * 0.5 };
    let bestScore = -1;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const rr = rand(inner, outer);
      const x = this.zoneX + Math.cos(a) * rr;
      const y = this.zoneY + Math.sin(a) * rr;
      const dPlayer = Math.hypot(x - this.px, y - this.py);
      const dEdge = this.zoneTarget - Math.hypot(x - this.zoneX, y - this.zoneY);
      if (dPlayer < 220 || dEdge < 100) continue;
      let dRifts = 1e9;
      for (const rf of this.rifts) dRifts = Math.min(dRifts, Math.hypot(x - rf.x, y - rf.y));
      let dEnemies = 1e9;
      for (const e of this.enemies) dEnemies = Math.min(dEnemies, Math.hypot(x - e.x, y - e.y));
      const score = Math.min(dPlayer, 400) + Math.min(dRifts, 300) * 1.5 + Math.min(dEnemies, 250);
      if (score > bestScore) {
        bestScore = score;
        bestP = { x, y };
      }
    }
    return bestP;
  }

  private spawnRift(queue: EnemyKind[], delay = 0) {
    const p = this.spawnRiftPoint();
    // size the crack for the biggest ship it will release: 60% larger than
    // that ship's diameter, floored at the fighter-rift size (52)
    let maxR = 0;
    for (const k of queue) maxR = Math.max(maxR, this.enemyDef(k).r);
    const size = Math.max(maxR * 2 * 1.6, 52);
    this.rifts.push({
      x: p.x,
      y: p.y,
      t: -delay,
      state: "opening",
      queue,
      timer: 0.8,
      seed: Math.random() * 100,
      rot: Math.random() * TAU,
      size,
    });
    this.audio.riftOpen();
  }

  private enemyDef(kind: EnemyKind): EnemyDef {
    return enemyDefFor(kind, this.wave);
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null) {
    const def = this.enemyDef(kind);
    this.enemies.push({
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle: rand(0, TAU),
      hp: def.hp,
      maxHp: def.hp,
      r: def.r,
      speed: def.speed,
      contact: def.contact,
      score: def.score,
      boltDmg: def.bolt,
      fireCd: rand(0.3, 1),
      mode: 0,
      modeT: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 100,
      spawnCd: rand(1, 2),
      flash: 0,
      hitCd: 0,
      dead: false,
      parent,
    });
  }

  private waveCleared() {
    if (this.waveClearSent) return; // one banner per wave, guaranteed
    this.waveClearSent = true;
    this.state = "cleared";
    this.clearT = 2.2;
    this.audio.setCombat(false);
    this.audio.waveClear();
    this.zoneCollapse = 0;
    this.hooks.onBanner({ title: t("game.waveCleared"), color: C.heal });
    const bonus = 100 + this.wave * 25;
    this.score += bonus;
    this.popup(this.px, this.py - 40, `+${bonus}`, C.heal);
  }

  /* ---------------- update ---------------- */

  private step(rdt: number) {
    this.time += rdt;

    if (this.state === "menu") {
      this.updateCamera(rdt);
      this.updateAsteroids(rdt);
      this.draw();
      return;
    }

    const dt = this.paused ? 0 : rdt * this.timeScale;
    if (dt > 0) this.runTime += dt;

    this.updateCamera(rdt);
    this.comboT = Math.max(0, this.comboT - dt);
    if (this.comboT === 0) this.combo = 0;

    if (this.state === "playing" || this.state === "active" || this.state === "cleared") {
      this.updatePlayer(dt);
      this.updateAllyDrones(dt);
      this.updateBullets(dt);
      this.updateEBullets(dt);
      this.updatePickups(dt);
      this.updateMines(dt);
      this.updateAsteroids(dt);
      this.updateRifts(dt);
      this.updateZoneAndWaves(dt);
    }
    if (this.state === "active" || this.state === "cleared") {
      this.updateEnemies(dt);
    }
    if (this.state === "dying") {
      this.dieT -= rdt;
      if (this.dieT <= 0) {
        this.state = "over";
        const isBest = this.score > this.best;
        if (isBest) {
          this.best = this.score;
          localStorage.setItem(BEST_KEY, String(this.best));
        }
        this.hooks.onStats({
          score: this.score,
          best: this.best,
          isBest,
          wave: this.wave,
          kills: this.killed,
          time: this.runTime,
        });
      }
    }

    this.updateParticles(dt);
    this.emitHud();
    this.draw();
  }

  private updateCamera(rdt: number) {
    const k = 1 - Math.exp(-5 * rdt);
    this.camX += (this.px - this.camX) * k;
    this.camY += (this.py - this.camY) * k;
    this.shakeMag = Math.max(0, this.shakeMag - rdt * 40);
    this.shakeX = (Math.random() - 0.5) * 2 * this.shakeMag;
    this.shakeY = (Math.random() - 0.5) * 2 * this.shakeMag;
  }

  private addShake(v: number) {
    this.shakeMag = Math.min(26, this.shakeMag + v);
  }

  private updatePlayer(dt: number) {
    let ax = 0;
    let ay = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) ay -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) ay += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) ax -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) ax += 1;
    if (this.touchActive) {
      ax += this.touchX;
      ay += this.touchY;
    }
    const l = Math.hypot(ax, ay);
    this.thrusting = l > 0;
    this.dashT = Math.max(0, this.dashT - dt);
    const dashing = this.dashT > 0;
    if (l > 0) {
      const norm = l > 1 ? l : 1;
      ax /= norm;
      ay /= norm;
      this.pvx += ax * 1500 * (dashing ? DASH_ACCEL : 1) * dt;
      this.pvy += ay * 1500 * (dashing ? DASH_ACCEL : 1) * dt;
    }
    const fr = Math.exp(-2.4 * dt);
    this.pvx *= fr;
    this.pvy *= fr;
    const sp = Math.hypot(this.pvx, this.pvy);
    const cap = PLAYER_MAX_SPEED * (dashing ? DASH_SPEED : 1);
    if (sp > cap) {
      this.pvx *= cap / sp;
      this.pvy *= cap / sp;
    }
    this.px += this.pvx * dt;
    this.py += this.pvy * dt;

    // dash speed-trail
    if (dashing && sp > 60) {
      for (let i = 0; i < 2; i++) {
        this.particles.push({
          x: this.px - (this.pvx / sp) * 10 + rand(-5, 5),
          y: this.py - (this.pvy / sp) * 10 + rand(-5, 5),
          vx: -(this.pvx / sp) * rand(40, 130),
          vy: -(this.pvy / sp) * rand(40, 130),
          life: rand(0.2, 0.4),
          maxLife: 0.4,
          c: rgba(C.dash, 0.8),
          size: rand(1, 2.2),
        });
      }
    }

    if (sp > 20) {
      this.pAngle = lerpAngle(this.pAngle, Math.atan2(this.pvy, this.pvx), 1 - Math.exp(-8 * dt));
    }

    this.invuln = Math.max(0, this.invuln - dt);
    const pObj = { x: this.px, y: this.py, vx: this.pvx, vy: this.pvy, r: 13 };
    // the pilot may overshoot the dashed edge line — the wall beyond it
    // is what hurts, not the line itself
    this.clampToZone(pObj, 56);
    this.px = pObj.x;
    this.py = pObj.y;
    this.pvx = pObj.vx;
    this.pvy = pObj.vy;

    this.updateEdgeDanger(dt);

    // turret: aim & fire at the nearest target (enemies preferred over rocks).
    // During a live wave the gun only locks onto targets INSIDE the zone.
    const zoneLive = this.zoneOn && this.zoneAlpha > 0.4 && this.zoneR > 60;
    const inZone = (x: number, y: number) =>
      !zoneLive || Math.hypot(x - this.zoneX, y - this.zoneY) <= this.zoneR;
    const rate = Math.min(8.5, 4.4 + this.wave * 0.12) * (1 + this.rateBoost);
    let bestX = 0;
    let bestY = 0;
    let bestVX = 0;
    let bestVY = 0;
    let bestD = 1e9;
    for (const e of this.enemies) {
      if (e.dead || !inZone(e.x, e.y)) continue;
      // slight preference for living targets, but a clearly-closer rock still wins
      const d = Math.hypot(e.x - this.px, e.y - this.py) * 0.85;
      if (d < bestD) {
        bestD = d;
        bestX = e.x;
        bestY = e.y;
        bestVX = e.vx;
        bestVY = e.vy;
      }
    }
    for (const a of this.asteroids) {
      if (!inZone(a.x, a.y)) continue;
      const d = Math.hypot(a.x - this.px, a.y - this.py);
      if (d < bestD) {
        bestD = d;
        bestX = a.x;
        bestY = a.y;
        bestVX = a.vx;
        bestVY = a.vy;
      }
    }
    if (bestD < 620) {
      const leadT = (bestD / 560) * 0.6;
      const tx = bestX + bestVX * leadT - this.px;
      const ty = bestY + bestVY * leadT - this.py;
      this.aimA = Math.atan2(ty, tx);
      this.fireCd -= dt;
      while (this.fireCd <= 0) {
        this.fireCd += 1 / rate;
        this.fireAll(this.aimA);
      }
    } else {
      this.aimA = null;
      if (this.fireCd < 0) this.fireCd = 0;
    }
  }

  private fireAll(angle: number) {
    for (let i = 0; i < this.guns; i++) {
      this.fireBullet(GUN_OFFS[i], (Math.random() - 0.5) * 0.06, angle);
    }
    this.audio.shoot();
  }

  private fireBullet(offset: number, spread: number, targetAngle: number) {
    const a = targetAngle + spread;
    const nx = this.px + Math.cos(targetAngle) * 14 - Math.sin(targetAngle) * offset;
    const ny = this.py + Math.sin(targetAngle) * 14 + Math.cos(targetAngle) * offset;
    const sp = 560;
    this.bullets.push({
      x: nx,
      y: ny,
      vx: Math.cos(a) * sp + this.pvx * 0.25,
      vy: Math.sin(a) * sp + this.pvy * 0.25,
      life: 0.85,
      dmg: 14,
    });
    this.burst(nx, ny, 2, C.mint, 90, 0.15);
  }

  private enemyFire(e: Enemy, speed: number, heavy: boolean, spread: number, life: number) {
    const aa =
      Math.atan2(this.py - e.y, this.px - e.x) + (Math.random() - 0.5) * 2 * spread;
    this.ebullets.push({
      x: e.x + Math.cos(aa) * (e.r + 6),
      y: e.y + Math.sin(aa) * (e.r + 6),
      vx: Math.cos(aa) * speed,
      vy: Math.sin(aa) * speed,
      life,
      dmg: e.boltDmg,
      heavy,
    });
    if (heavy) this.audio.heavyShoot();
    else this.audio.enemyShoot();
  }

  private updateAllyDrones(dt: number) {
    const n = this.allyDrones.length;
    if (n === 0) return;
    const orbitR = 58;
    for (let i = 0; i < n; i++) {
      const d = this.allyDrones[i];
      d.flash = Math.max(0, d.flash - dt * 4);
      const baseA = this.time * 1.1 + d.phase;
      const tx = this.px + Math.cos(baseA) * orbitR;
      const ty = this.py + Math.sin(baseA) * orbitR;
      const k = 1 - Math.exp(-6 * dt);
      d.x += (tx - d.x) * k;
      d.y += (ty - d.y) * k;

      // autonomous target selection
      d.retargetT -= dt;
      const t0 = d.target;
      const targetOk =
        t0 &&
        !t0.dead &&
        t0.hp > 0 &&
        Math.hypot(t0.x - d.x, t0.y - d.y) < 430;
      if (!targetOk || d.retargetT <= 0) {
        d.retargetT = 1.2;
        let bestE: Enemy | null = null;
        let bestD = 430;
        for (const e of this.enemies) {
          if (e.dead) continue;
          const dd = Math.hypot(e.x - d.x, e.y - d.y);
          if (dd < bestD) {
            bestD = dd;
            bestE = e;
          }
        }
        d.target = bestE;
      }

      if (d.target) {
        d.angle = lerpAngle(
          d.angle,
          Math.atan2(d.target.y - d.y, d.target.x - d.x),
          1 - Math.exp(-9 * dt)
        );
        d.fireCd -= dt;
        if (d.fireCd <= 0) {
          d.fireCd = 0.5;
          const a = d.angle + (Math.random() - 0.5) * 0.08;
          this.bullets.push({
            x: d.x + Math.cos(d.angle) * 8,
            y: d.y + Math.sin(d.angle) * 8,
            vx: Math.cos(a) * 520,
            vy: Math.sin(a) * 520,
            life: 0.8,
            dmg: 8,
          });
          this.audio.droneShot();
        }
      } else {
        d.angle = lerpAngle(d.angle, baseA + Math.PI / 2, 1 - Math.exp(-4 * dt));
      }
    }
  }

  private updateEnemies(dt: number) {
    // gather live drones for the boids flock
    this.flock.length = 0;
    for (const e of this.enemies) {
      if (e.kind === "drone" && !e.dead) this.flock.push(e);
    }

    for (const e of this.enemies) {
      if (e.dead) continue;
      e.flash = Math.max(0, e.flash - dt * 5);
      e.hitCd = Math.max(0, e.hitCd - dt);
      const dx = this.px - e.x;
      const dy = this.py - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      const alive = this.state === "active";

      switch (e.kind) {
        case "drone": {
          /* Boids swarm: separation + alignment + cohesion, still seeking the player. */
          const SEP_R = 36;
          const SEP_R2 = SEP_R * SEP_R;
          const ALI_R2 = 85 * 85;
          const SEP_W = 320;
          const ALIGN = 0.35;
          const COH = 0.7;

          let sepX = 0,
            sepY = 0,
            aliX = 0,
            aliY = 0,
            aliN = 0,
            cohX = 0,
            cohY = 0,
            cohN = 0;
          for (const o of this.flock) {
            if (o === e || o.dead) continue;
            const ddx = e.x - o.x;
            const ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            if (d2 < ALI_R2 && d2 > 0.0001) {
              aliX += o.vx;
              aliY += o.vy;
              aliN++;
              cohX += o.x;
              cohY += o.y;
              cohN++;
              if (d2 < SEP_R2) {
                const d = Math.sqrt(d2);
                const w = 1 - d / SEP_R;
                sepX += (ddx / d) * w;
                sepY += (ddy / d) * w;
              }
            }
          }

          let desX = dirX * e.speed;
          let desY = dirY * e.speed;
          desX += sepX * SEP_W;
          desY += sepY * SEP_W;
          if (aliN > 0) {
            desX += (aliX / aliN - desX) * ALIGN;
            desY += (aliY / aliN - desY) * ALIGN;
          }
          if (cohN > 0) {
            desX += (cohX / cohN - e.x) * COH;
            desY += (cohY / cohN - e.y) * COH;
          }

          const k = 1 - Math.exp(-3.2 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const dsp2 = e.vx * e.vx + e.vy * e.vy;
          const dspMax = e.speed * 1.5;
          if (dsp2 > dspMax * dspMax) {
            const s = dspMax / Math.sqrt(dsp2);
            e.vx *= s;
            e.vy *= s;
          }
          const dsp = Math.sqrt(dsp2);
          if (dsp > 5) {
            e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-9 * dt));
          }
          break;
        }

        case "hunter": {
          /* The seeker aims at the point where the player WILL be in 1s.
             It is a hair slower than the ship, so it never wins a straight
             chase — but the moment the pilot turns or slows, the predicted
             point swings round and the hunter cuts in for the ram. */
          const leadX = this.px + this.pvx * 1.0;
          const leadY = this.py + this.pvy * 1.0;
          const hx = leadX - e.x;
          const hy = leadY - e.y;
          const hd = Math.hypot(hx, hy) || 1;
          // steer a little harder when the intercept point is close so it
          // actually commits to the collision instead of orbiting it
          const k = 1 - Math.exp(-(hd < 120 ? 7.5 : 4.5) * dt);
          e.vx += ((hx / hd) * e.speed - e.vx) * k;
          e.vy += ((hy / hd) * e.speed - e.vy) * k;
          const hv = Math.hypot(e.vx, e.vy);
          if (hv > 5) {
            e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-10 * dt));
          }
          break;
        }

        case "fighter": {
          e.modeT -= dt;
          if (e.mode === 0) {
            e.vx += (dirX * e.speed - e.vx) * (1 - Math.exp(-4 * dt));
            e.vy += (dirY * e.speed - e.vy) * (1 - Math.exp(-4 * dt));
            if (dist < 300) {
              e.mode = 1;
              e.modeT = rand(1.3, 2);
              e.strafeDir = Math.random() < 0.5 ? -1 : 1;
            }
          } else if (e.mode === 1) {
            const tx = -dirY * e.strafeDir;
            const ty = dirX * e.strafeDir;
            const radial = (dist - 265) * 2.2;
            e.vx += (tx * e.speed * 0.95 + dirX * radial - e.vx) * (1 - Math.exp(-5 * dt));
            e.vy += (ty * e.speed * 0.95 + dirY * radial - e.vy) * (1 - Math.exp(-5 * dt));
            if (e.modeT <= 0) {
              e.mode = 2;
              e.modeT = rand(0.9, 1.4);
            }
          } else {
            const tx = -dirX * 0.7 - dirY * e.strafeDir * 0.7;
            const ty = -dirY * 0.7 + dirX * e.strafeDir * 0.7;
            e.vx += (tx * e.speed - e.vx) * (1 - Math.exp(-4.5 * dt));
            e.vy += (ty * e.speed - e.vy) * (1 - Math.exp(-4.5 * dt));
            if (e.modeT <= 0) e.mode = 0;
          }
          e.angle = Math.atan2(e.vy, e.vx);
          // continuous fire at 50% of the player's base rate
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 420 && alive) {
            e.fireCd = 2 / (4.4 + this.wave * 0.12);
            this.enemyFire(e, 300, false, 0.15, 1.35);
          }
          break;
        }

        case "cruiser": {
          // escort a nearby carrier, otherwise hold a standoff ring around the player
          let escort: Enemy | null = null;
          let ed = 1e9;
          for (const o of this.enemies) {
            if (o.kind !== "carrier" || o.dead) continue;
            const dd = Math.hypot(e.x - o.x, e.y - o.y);
            if (dd < ed) {
              ed = dd;
              escort = o;
            }
          }
          let desX: number;
          let desY: number;
          if (escort && ed < 290) {
            const ox = e.x - escort.x;
            const oy = e.y - escort.y;
            const od = Math.hypot(ox, oy) || 1;
            const radial = (od - 150) * 1.2;
            desX = (ox / od) * radial + (-oy / od) * e.strafeDir * e.speed;
            desY = (oy / od) * radial + (ox / od) * e.strafeDir * e.speed;
          } else {
            const zr = this.zoneTarget > 0 ? this.zoneTarget : 420;
            const HOLD = Math.min(400, zr * 0.8);
            const radial = (dist - HOLD) * 1.0;
            desX = dirX * radial + -dirY * e.strafeDir * e.speed * 0.6;
            desY = dirY * radial + dirX * e.strafeDir * e.speed * 0.6;
          }
          for (const o of this.enemies) {
            if (o === e || o.dead) continue;
            if (o.kind !== "cruiser" && o.kind !== "carrier") continue;
            const sx = e.x - o.x;
            const sy = e.y - o.y;
            const sd = Math.hypot(sx, sy);
            if (sd < 130 && sd > 0.001) {
              const w = (1 - sd / 130) * 230;
              desX += (sx / sd) * w;
              desY += (sy / sd) * w;
            }
          }
          const k = 1 - Math.exp(-1.0 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const ksp = Math.hypot(e.vx, e.vy);
          const kmax = e.speed * 1.7;
          if (ksp > kmax) {
            e.vx *= kmax / ksp;
            e.vy *= kmax / ksp;
          }
          e.angle = lerpAngle(e.angle, Math.atan2(dy, dx), 1 - Math.exp(-1.2 * dt));
          e.fireCd -= dt;
          if (e.fireCd <= 0 && dist < 460 && alive) {
            e.fireCd = Math.max(2.0, 3.2 - this.wave * 0.04);
            for (let s = -1; s <= 1; s++) {
              const aa = Math.atan2(dy, dx) + s * 0.13;
              this.ebullets.push({
                x: e.x + Math.cos(aa) * (e.r + 6),
                y: e.y + Math.sin(aa) * (e.r + 6),
                vx: Math.cos(aa) * 200,
                vy: Math.sin(aa) * 200,
                life: 2.0,
                dmg: e.boltDmg,
                heavy: true,
              });
            }
            this.audio.heavyShoot();
          }
          break;
        }

        case "carrier": {
          const zr = this.zoneTarget > 0 ? this.zoneTarget : 420;
          const HOLD = Math.min(520, zr * 0.92);
          const radial = (dist - HOLD) * 1.0;
          let desX = dirX * radial + -dirY * e.strafeDir * e.speed * 0.7;
          let desY = dirY * radial + dirX * e.strafeDir * e.speed * 0.7;
          for (const o of this.enemies) {
            if (o === e || o.dead || o.kind !== "carrier") continue;
            const sx = e.x - o.x;
            const sy = e.y - o.y;
            const sd = Math.hypot(sx, sy);
            if (sd < 260 && sd > 0.001) {
              const w = (1 - sd / 260) * 170;
              desX += (sx / sd) * w;
              desY += (sy / sd) * w;
            }
          }
          const k = 1 - Math.exp(-1.1 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const ksp = Math.hypot(e.vx, e.vy);
          const kmax = e.speed * 1.5;
          if (ksp > kmax) {
            e.vx *= kmax / ksp;
            e.vy *= kmax / ksp;
          }
          e.angle = lerpAngle(e.angle, Math.atan2(dy, dx), 1 - Math.exp(-1.2 * dt));
          e.spawnCd -= dt;
          let droneCount = 0;
          for (const o of this.enemies) {
            if (o.kind === "drone" && o.parent === e && !o.dead) droneCount++;
          }
          if (e.spawnCd <= 0 && droneCount < 3 && alive) {
            e.spawnCd = rand(2.2, 3.4);
            this.spawnEnemy("drone", e.x + rand(-20, 20), e.y + rand(-20, 20), e);
            this.audio.riftSpawn();
          }
          break;
        }
      }

      e.x += e.vx * dt;
      e.y += e.vy * dt;
      this.clampToZone(e);

      // contact with the player: normal ram hurts the ship, but during a
      // dash the ship becomes the battering ram instead
      if (alive && this.state === "active") {
        const rr = e.r + 13;
        if (dist < rr) {
          if (this.dashT > 0) {
            if (e.hitCd <= 0) {
              e.hp -= DASH_DMG;
              e.hitCd = 0.18;
              e.flash = 1;
              // shove the victim away from the ship
              const kx = dist > 0.001 ? dx / dist : 1;
              const ky = dist > 0.001 ? dy / dist : 0;
              e.vx += kx * 420;
              e.vy += ky * 420;
              this.burst(e.x - kx * e.r, e.y - ky * e.r, 6, C.dash, 200, 0.3);
              this.addShake(3);
              this.audio.dashRam();
              if (e.hp <= 0 && !e.dead) {
                e.dead = true;
                this.killEnemy(e);
              }
            }
          } else if (this.invuln <= 0) {
            this.damagePlayer(e.contact, e.x, e.y);
            if (e.kind === "drone" || e.kind === "hunter") {
              e.hp = 0;
              e.dead = true;
              this.killEnemy(e);
            }
          }
        }
      }
    }

    // remove dead
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      if (this.enemies[i].dead) this.enemies.splice(i, 1);
    }
  }

  private updateBullets(dt: number) {
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      // bullets are free to leave the wave zone — that's what lets the
      // turret break the asteroids ringing the arena mid-wave. Their
      // 0.85s lifetime still bounds how far any shot can travel.
      let dead = b.life <= 0;
      if (!dead) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          const rr = e.r + 3;
          if (Math.hypot(b.x - e.x, b.y - e.y) < rr) {
            dead = true;
            e.hp -= b.dmg;
            e.flash = 1;
            this.burst(b.x, b.y, 3, C.white, 120, 0.2);
            if (e.hp <= 0) {
              e.dead = true;
              this.killEnemy(e);
            }
            break;
          }
        }
      }
      // rocks block shots too
      if (!dead) {
        for (let j = this.asteroids.length - 1; j >= 0; j--) {
          const a = this.asteroids[j];
          if (Math.hypot(b.x - a.x, b.y - a.y) < a.r) {
            dead = true;
            a.hp -= b.dmg;
            this.burst(b.x, b.y, 3, "#b9c4d6", 100, 0.2);
            if (a.hp <= 0) {
              this.asteroids.splice(j, 1);
              this.destroyAsteroid(a);
            }
            break;
          }
        }
      }
      if (dead) this.bullets.splice(i, 1);
    }
  }

  private updateEBullets(dt: number) {
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      b.life -= dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      let dead = b.life <= 0;
      if (!dead && this.zoneOn && this.zoneAlpha > 0.4) {
        if (Math.hypot(b.x - this.zoneX, b.y - this.zoneY) > this.zoneR + 10) dead = true;
      }
      // ally drones can be shot down
      const aliveNow = this.state === "active" || this.state === "cleared";
      if (!dead && aliveNow) {
        for (let j = this.allyDrones.length - 1; j >= 0; j--) {
          const d = this.allyDrones[j];
          const ddx = b.x - d.x;
          const ddy = b.y - d.y;
          if (ddx * ddx + ddy * ddy < 144) {
            dead = true;
            d.hp -= b.dmg;
            d.flash = 1;
            this.burst(d.x, d.y, 4, C.mint, 150, 0.25);
            this.audio.droneHit();
            if (d.hp <= 0) {
              this.allyDrones.splice(j, 1);
              this.burst(d.x, d.y, 18, C.mint, 280, 0.55);
              this.rings.push({ x: d.x, y: d.y, r: 6, vr: 320, life: 0.35, maxLife: 0.35, c: rgba(C.mint, 1) });
              this.addShake(4);
              this.audio.explode(0.8);
              this.popup(d.x, d.y - 14, t("game.droneLost"), C.zone);
            }
            break;
          }
        }
      }
      if (!dead && aliveNow && this.invuln <= 0) {
        if (Math.hypot(b.x - this.px, b.y - this.py) < 14) {
          dead = true;
          this.damagePlayer(b.dmg, b.x, b.y);
        }
      }
      if (dead) this.ebullets.splice(i, 1);
    }
  }

  private updatePickups(dt: number) {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-1.5 * dt);
      p.vy *= Math.exp(-1.5 * dt);

      // drift back toward the zone edge if knocked outside and unmagnetized
      if (this.zoneOn && this.zoneAlpha > 0.4 && this.zoneR > 60) {
        const zdx = p.x - this.zoneX;
        const zdy = p.y - this.zoneY;
        const zd = Math.hypot(zdx, zdy);
        const dToPlayer = Math.hypot(this.px - p.x, this.py - p.y);
        if (zd > this.zoneR && dToPlayer > 150) {
          const over = zd - this.zoneR;
          const pull = Math.min(320, 60 + over * 2.2);
          p.vx -= (zdx / zd) * pull * dt;
          p.vy -= (zdy / zd) * pull * dt;
        }
      }

      const dx = this.px - p.x;
      const dy = this.py - p.y;
      const d = Math.hypot(dx, dy);
      // bonuses are collected at any moment — no game mode blocks pickup
      const canPickup = this.state !== "menu";
      if (d < 150 && d > 0.001 && canPickup) {
        p.vx += (dx / d) * 900 * dt;
        p.vy += (dy / d) * 900 * dt;
      }

      let dead = p.life <= 0;
      if (!dead && canPickup && d < 26) {
        dead = true;
        this.applyPickup(p);
      }
      if (dead) this.pickups.splice(i, 1);
    }
    if (this.rateT > 0) {
      this.rateT = Math.max(0, this.rateT - dt);
      if (this.rateT === 0) this.rateBoost = 0;
    }
  }

  /* ---------------- mines ---------------- */

  private updateMines(dt: number) {
    // scheduled drop: the miner bonus releases its charge a couple of
    // seconds after being collected, right under the ship
    if (this.mineDropT > 0) {
      this.mineDropT -= dt;
      if (this.mineDropT <= 0) {
        this.mineDropT = -1;
        this.mines.push({
          x: this.px,
          y: this.py,
          fuse: MINE_LIFE,
          seed: Math.random() * 100,
        });
        this.popup(this.px, this.py - 22, t("game.minePlaced"), C.mine);
        this.burst(this.px, this.py, 8, C.mine, 130, 0.3);
        this.audio.minePlace();
      }
    }

    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      m.fuse -= dt;
      let boom = m.fuse <= 0;

      // primary trigger: the pilot flies out of the blast radius
      if (!boom && this.state !== "dying" && this.state !== "over") {
        const dp = Math.hypot(m.x - this.px, m.y - this.py);
        if (dp > MINE_RADIUS) boom = true;
      }
      // classic mine behavior: an enemy stepping on it also sets it off
      if (!boom) {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - m.x, e.y - m.y) < e.r + 9) {
            boom = true;
            break;
          }
        }
      }
      if (boom) {
        this.mines.splice(i, 1);
        this.detonateMine(m);
      }
    }
  }

  private detonateMine(m: Mine) {
    this.audio.mineBoom();
    this.addShake(12);
    this.burst(m.x, m.y, 42, C.mine, 430, 0.7);
    this.burst(m.x, m.y, 16, C.white, 280, 0.45);
    this.rings.push({ x: m.x, y: m.y, r: 8, vr: 720, life: 0.42, maxLife: 0.42, c: rgba(C.mine, 1) });
    this.rings.push({ x: m.x, y: m.y, r: 4, vr: 520, life: 0.3, maxLife: 0.3, c: rgba(C.white, 1) });

    const R = MINE_RADIUS * 1.15;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - m.x, e.y - m.y);
      if (d < R) {
        const fall = 1 - 0.6 * (d / R); // full at the center, 40% at the edge
        e.hp -= MINE_DMG * fall;
        e.flash = 1;
        // knock everyone away from ground zero
        const kx = d > 0.001 ? (e.x - m.x) / d : 1;
        const ky = d > 0.001 ? (e.y - m.y) / d : 0;
        const kb = 430 * fall;
        e.vx += kx * kb;
        e.vy += ky * kb;
        if (e.hp <= 0) {
          e.dead = true;
          this.killEnemy(e);
        }
      }
    }
    // the blast also clears enemy fire caught inside it
    for (let i = this.ebullets.length - 1; i >= 0; i--) {
      const b = this.ebullets[i];
      if (Math.hypot(b.x - m.x, b.y - m.y) < R) this.ebullets.splice(i, 1);
    }
  }

  /* ---------------- asteroid field ---------------- */

  private astDef(kind: AsteroidKind) {
    switch (kind) {
      case "small":
        return { rMin: 8, rMax: 12, hp: 22, score: 6 };
      case "medium":
        return { rMin: 17, rMax: 23, hp: 60, score: 15 };
      case "large":
        return { rMin: 30, rMax: 40, hp: 140, score: 30 };
    }
  }

  private makeAst(
    id: string,
    kind: AsteroidKind,
    x: number,
    y: number,
    rnd: () => number,
    vx: number,
    vy: number
  ): Asteroid {
    const d = this.astDef(kind);
    const r = d.rMin + rnd() * (d.rMax - d.rMin);
    const verts: number[] = [];
    const n = 9 + Math.floor(rnd() * 3);
    for (let i = 0; i < n; i++) verts.push(0.72 + rnd() * 0.3);
    return {
      id,
      kind,
      x,
      y,
      vx,
      vy,
      r,
      angle: rnd() * TAU,
      spin: (rnd() - 0.5) * 0.6,
      verts,
      hp: d.hp,
      maxHp: d.hp,
    };
  }

  private genAstChunk(cx: number, cy: number): Asteroid[] {
    const CH = 1000;
    const seed = (Math.imul(cx, 91733) ^ Math.imul(cy, 46511) ^ 0x5eed) >>> 0;
    const rnd = mulberry32(seed || 0x9e3779b9);
    const out: Asteroid[] = [];
    const count = 9 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) {
      const roll = rnd();
      const kind: AsteroidKind = roll < 0.18 ? "large" : roll < 0.52 ? "medium" : "small";
      const x = cx * CH + rnd() * CH;
      const y = cy * CH + rnd() * CH;
      const va = rnd() * TAU;
      const vs = 4 + rnd() * 14;
      out.push(this.makeAst(`${cx},${cy}:${i}`, kind, x, y, rnd, Math.cos(va) * vs, Math.sin(va) * vs));
    }
    return out;
  }

  private updateAsteroids(dt: number) {
    const CH = 1000;
    const W = this.viewW;
    const H = this.viewH;
    const x0 = Math.floor((this.camX - W / 2) / CH) - 1;
    const x1 = Math.floor((this.camX + W / 2) / CH) + 1;
    const y0 = Math.floor((this.camY - H / 2) / CH) - 1;
    const y1 = Math.floor((this.camY + H / 2) / CH) + 1;
    const key = `${x0},${x1},${y0},${y1}`;

    if (key !== this.astBoundsKey) {
      this.astBoundsKey = key;
      const keep = new Set<string>();
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = `${cx},${cy}`;
          keep.add(k);
          if (!this.astChunks.has(k)) this.astChunks.set(k, this.genAstChunk(cx, cy));
        }
      }
      for (const k of Array.from(this.astChunks.keys())) {
        if (!keep.has(k)) {
          this.astChunks.delete(k);
          // forget destroyed asteroids in evicted chunks so the field regrows
          for (const g of Array.from(this.astGone)) if (g.startsWith(k + ":")) this.astGone.delete(g);
        }
      }
    }

    // spawn any seeded asteroids that are not alive or destroyed
    const alive = new Set<string>();
    for (const a of this.asteroids) alive.add(a.id);
    for (const chunk of this.astChunks.values()) {
      for (const seedAst of chunk) {
        if (!alive.has(seedAst.id) && !this.astGone.has(seedAst.id)) {
          this.asteroids.push(seedAst);
          alive.add(seedAst.id);
        }
      }
    }

    const cap = 220;
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const a = this.asteroids[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
      a.angle += a.spin * dt;

      // the wave zone is sacred ground — shove rocks out and keep them out
      if (this.zoneOn && this.zoneAlpha > 0.4 && this.zoneR > 60) {
        const zdx = a.x - this.zoneX;
        const zdy = a.y - this.zoneY;
        const zd = Math.hypot(zdx, zdy) || 1;
        const lim = this.zoneR + a.r + 26;
        if (zd < lim) {
          const push = 260 * dt;
          a.vx += (zdx / zd) * push * 8;
          a.vy += (zdy / zd) * push * 8;
          if (zd < lim) {
            a.x = this.zoneX + (zdx / zd) * lim;
            a.y = this.zoneY + (zdy / zd) * lim;
          }
        }
      }

      // drift away from the player's immediate path so the field never clogs
      const dCam = Math.hypot(a.x - this.camX, a.y - this.camY);
      if (dCam > 2800) {
        this.asteroids.splice(i, 1);
        continue;
      }
    }
    if (this.asteroids.length > cap) this.asteroids.length = cap;
  }

  private destroyAsteroid(a: Asteroid) {
    this.astGone.add(a.id);
    const d = this.astDef(a.kind);
    this.score += d.score;
    this.burst(a.x, a.y, a.kind === "large" ? 26 : a.kind === "medium" ? 16 : 9, "#b9c4d6", a.kind === "large" ? 300 : 200, 0.5);
    this.audio.explode(a.kind === "large" ? 0.9 : 0.5);
    this.addShake(a.kind === "large" ? 4 : a.kind === "medium" ? 2.5 : 1);

    const rnd = Math.random;
    const spawnFrag = (kind: AsteroidKind) => {
      const ang = rnd() * TAU;
      const dist = a.r * 0.5;
      this.astFragSeq++;
      const frag = this.makeAst(
        `f${this.astFragSeq}`,
        kind,
        a.x + Math.cos(ang) * dist,
        a.y + Math.sin(ang) * dist,
        rnd,
        a.vx + Math.cos(ang) * (40 + rnd() * 60),
        a.vy + Math.sin(ang) * (40 + rnd() * 60)
      );
      this.asteroids.push(frag);
    };

    if (a.kind === "large") {
      const roll = rnd();
      if (roll < 0.5) {
        spawnFrag("medium");
        spawnFrag("small");
        spawnFrag("small");
      } else if (roll < 0.75) {
        spawnFrag("medium");
        spawnFrag("medium");
      } else {
        spawnFrag("small");
        spawnFrag("small");
        spawnFrag("small");
      }
    } else if (a.kind === "medium" && rnd() < 0.7) {
      spawnFrag("small");
      spawnFrag("small");
    }

    // minerals tumble out of every rock type
    const dropChance = a.kind === "large" ? 0.7 : a.kind === "medium" ? 0.4 : 0.25;
    if (rnd() < dropChance) {
      this.pickups.push({
        kind: "mineral",
        x: a.x + rand(-10, 10),
        y: a.y + rand(-10, 10),
        vx: rand(-40, 40),
        vy: rand(-40, 40),
        life: 13,
        seed: Math.random() * 100,
      });
    }
  }

  private drawAsteroids() {
    const R = this.renderer;
    for (const a of this.asteroids) {
      const n = a.verts.length;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const ang = a.angle + (i / n) * TAU;
        const rr = a.r * a.verts[i];
        pts.push([a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr]);
      }
      R.polyline(pts, true, rgba("#8d9ab0", 0.85));
      R.pushLine(
        a.x - a.r * 0.3,
        a.y - a.r * 0.2,
        a.x + a.r * 0.25,
        a.y + a.r * 0.35,
        rgba("#8d9ab0", 0.3)
      );
      if (a.hp < a.maxHp) {
        const f = clamp(a.hp / a.maxHp, 0, 1);
        R.dashedCircle(a.x, a.y, a.r + 5, rgba("#ffbf66", 0.4), Math.max(3, Math.round(8 * f)), this.time, 0.4);
      }
    }
  }

  private applyPickup(p: Pickup) {
    const heal = (f: number) => {
      const before = this.hp;
      this.hp = Math.min(this.maxHp, this.hp + this.maxHp * f);
      const healed = Math.round(this.hp - before);
      this.popup(
        p.x,
        p.y - 16,
        healed > 0 ? `+${healed} ${t("game.hull")}` : t("game.hullMax"),
        C.heal
      );
      this.burst(p.x, p.y, 10, C.heal, 160, 0.45);
      this.audio.pickupHeal();
    };
    const rateVal = (v: number) => {
      this.rateBoost = Math.min(1, this.rateBoost + v);
      this.rateT = RATE_BOOST_TIME;
      this.popup(
        p.x,
        p.y - 16,
        t("game.rate", { p: Math.round(this.rateBoost * 100), s: RATE_BOOST_TIME }),
        C.fighter
      );
      this.burst(p.x, p.y, 10, C.fighter, 170, 0.4);
      this.audio.pickupRate();
    };
    switch (p.kind) {
      case "heal25":
        heal(0.25);
        break;
      case "heal50":
        heal(0.5);
        break;
      case "heal100":
        heal(1);
        break;
      case "rate20":
        rateVal(0.2);
        break;
      case "rate40":
        rateVal(0.4);
        break;
      case "rate60":
        rateVal(0.6);
        break;
      case "gun":
        if (this.guns < MAX_GUNS) {
          this.guns++;
          this.popup(p.x, p.y - 16, t("game.gun", { g: this.guns }), C.player);
          this.burst(p.x, p.y, 12, C.player, 200, 0.5);
          this.audio.pickupGun();
        } else {
          this.score += 300;
          this.popup(p.x, p.y - 16, t("game.gunMax"), C.player);
          this.audio.pickupGun();
        }
        break;
      case "drone":
        if (this.allyDrones.length < MAX_ALLY_DRONES) {
          const droneHp = 45 + this.wave * 1.5;
          this.allyDrones.push({
            x: p.x,
            y: p.y,
            angle: 0,
            fireCd: 0.25,
            phase: Math.random() * TAU,
            hp: droneHp,
            maxHp: droneHp,
            target: null,
            retargetT: 0,
            flash: 0,
          });
          this.popup(p.x, p.y - 16, t("game.drone", { i: this.allyDrones.length }), C.mint);
          this.burst(p.x, p.y, 12, C.mint, 200, 0.5);
          this.audio.pickupDrone();
        } else {
          this.score += 400;
          this.popup(p.x, p.y - 16, t("game.droneMax"), C.mint);
          this.audio.pickupDrone();
        }
        break;
      case "dash":
        this.dashT = DASH_TIME;
        // instant kick along the current travel direction
        const psp = Math.hypot(this.pvx, this.pvy);
        if (psp > 1) {
          this.pvx += (this.pvx / psp) * 260;
          this.pvy += (this.pvy / psp) * 260;
        }
        this.popup(p.x, p.y - 16, t("game.dash"), C.dash);
        this.burst(p.x, p.y, 14, C.dash, 260, 0.5);
        this.rings.push({ x: p.x, y: p.y, r: 10, vr: 420, life: 0.35, maxLife: 0.35, c: rgba(C.dash, 1) });
        this.audio.pickupDash();
        break;
      case "miner":
        // the mine drops automatically a couple of seconds later
        this.mineDropT = MINE_DELAY;
        this.popup(p.x, p.y - 16, t("game.mineReady"), C.mine);
        this.burst(p.x, p.y, 10, C.mine, 170, 0.4);
        this.audio.minePlace();
        break;
      case "mineral":
        this.minerals++;
        this.popup(p.x, p.y - 14, `+1 ${t("game.mineral")}`, C.heal);
        this.burst(p.x, p.y, 6, C.heal, 110, 0.3);
        this.audio.pickupHeal();
        break;
    }
  }

  private maybeDrop(e: Enemy) {
    if (Math.random() > dropChanceFor(e.kind)) return;

    const w = this.wave;
    const ramp = (s: number, f: number) => this.rampW(w, s, f);
    const lowHull = this.hp / this.maxHp < 0.5 ? 2 : 1;
    const table: Array<[PickupKind, number]> = [
      ["heal25", 0.45 * lowHull],
      ["heal50", 0.2 * lowHull + 0.1 * ramp(1, 12)],
      ["heal100", 0.05 * lowHull + 0.15 * ramp(1, 25)],
      ["rate20", 0.3],
      ["rate40", 0.04 + 0.2 * ramp(2, 14)],
      ["rate60", 0.01 + 0.2 * ramp(4, 18)],
      ["gun", this.guns < MAX_GUNS ? 0.05 + 0.3 * ramp(1, 12) : 0],
      ["drone", this.allyDrones.length < MAX_ALLY_DRONES ? 0.06 + 0.3 * ramp(2, 14) : 0],
      ["dash", 0.12 + 0.18 * ramp(2, 12)],
      ["miner", 0.08 + 0.2 * ramp(3, 14)],
    ];
    let total = 0;
    for (const [, wt] of table) total += wt;
    if (total <= 0) return;
    let roll = Math.random() * total;
    let kind: PickupKind = "heal25";
    for (const [k, wt] of table) {
      roll -= wt;
      if (roll <= 0) {
        kind = k;
        break;
      }
    }
    this.pickups.push({
      kind,
      x: e.x,
      y: e.y,
      vx: rand(-70, 70),
      vy: rand(-70, 70),
      life: 13,
      seed: Math.random() * 100,
    });
  }

  private killEnemy(e: Enemy) {
    this.killed++;
    this.killedWave++;
    this.combo++;
    this.comboT = 2.5;
    const mult = this.comboMult();
    const gained = Math.round(e.score * mult);
    this.score += gained;
    this.popup(e.x, e.y - e.r - 6, t("game.points", { v: gained }), C.white);
    if (this.combo > 0 && this.combo % 8 === 0) this.audio.comboUp(mult);

    const col = this.kindColor(e.kind);
    this.burst(e.x, e.y, e.kind === "carrier" ? 30 : e.kind === "cruiser" ? 22 : 14, col, 260, 0.5);
    this.rings.push({ x: e.x, y: e.y, r: e.r * 0.5, vr: 380, life: 0.3, maxLife: 0.3, c: rgba(col, 1) });

    const shake =
      e.kind === "drone" ? 0 : e.kind === "hunter" ? 3 : e.kind === "fighter" ? 2.5 : e.kind === "cruiser" ? 6.5 : 9;
    this.addShake(shake);
    this.audio.explode(e.kind === "carrier" ? 1.6 : e.kind === "cruiser" ? 1.3 : 0.9);

    if (e.kind === "carrier") {
      for (let i = 0; i < 2; i++) {
        this.spawnEnemy("drone", e.x + rand(-20, 20), e.y + rand(-20, 20), null);
      }
    }

    this.maybeDrop(e);
  }

  private kindColor(kind: EnemyKind): string {
    switch (kind) {
      case "drone":
        return C.drone;
      case "hunter":
        return C.hunter;
      case "fighter":
        return C.fighter;
      case "cruiser":
        return C.cruiser;
      case "carrier":
        return C.carrier;
    }
  }

  private comboMult() {
    return 1 + Math.min(3, this.combo * 0.05);
  }

  /**
   * The dashed edge line of the wave zone is a hazard:
   * - crossing it deals hull damage that doubles every 2.5s the pilot
   *   lingers outside (1% → 2% → 4% → 8% → 16% of max hull per second).
   */
  private updateEdgeDanger(dt: number) {
    if (
      this.state === "menu" ||
      this.state === "dying" ||
      this.state === "over" ||
      !this.zoneOn ||
      this.zoneAlpha < 0.4 ||
      this.zoneR <= 60
    ) {
      this.edgeOutT = 0;
      this.edgeTickT = 0;
      this.edgeWarned = false;
      return;
    }
    const line = this.zoneR * 0.96; // the dashed edge line
    const pd = Math.hypot(this.px - this.zoneX, this.py - this.zoneY);
    if (pd > line) {
      if (this.edgeOutT === 0 && !this.edgeWarned) {
        this.edgeWarned = true;
        this.hooks.onToast({ text: t("game.zoneEdge"), color: "#ff3b52" });
      }
      this.edgeOutT += dt;
      // doubles every 2.5s outside, capped so it escalates but never one-shots
      const stage = Math.min(4, Math.floor(this.edgeOutT / 2.5));
      const pct = Math.pow(2, stage); // % of max hull per second
      if (!this.debugGod) {
        this.hp -= this.maxHp * (pct / 100) * dt;
      }
      this.edgeTickT -= dt;
      if (this.edgeTickT <= 0) {
        this.edgeTickT = 0.4;
        if (!this.debugGod) {
          this.audio.playerHit();
          this.addShake(3 + stage);
          this.burst(this.px, this.py, 8, C.zone, 190, 0.35);
        }
      }
      if (this.hp <= 0) this.onPlayerDeath();
    } else if (pd < line - 26) {
      // back in safety (with hysteresis so the timer doesn't flicker)
      this.edgeOutT = 0;
      this.edgeTickT = 0;
      this.edgeWarned = false;
    }
  }

  /** Shared death sequence — hull breaches from any source. */
  private onPlayerDeath() {
    if (this.state === "dying" || this.state === "over") return;
    this.hp = 0;
    this.state = "dying";
    this.dieT = 1.6;
    this.timeScale = 0.35;
    this.audio.setCombat(false);
    this.audio.gameOver();
    this.burst(this.px, this.py, 40, C.player, 380, 0.9);
    this.burst(this.px, this.py, 24, C.white, 260, 0.6);
    this.rings.push({
      x: this.px,
      y: this.py,
      r: 10,
      vr: 620,
      life: 0.7,
      maxLife: 0.7,
      c: rgba(C.player, 1),
    });
    this.addShake(26);
  }

  private damagePlayer(d: number, hx: number, hy: number) {
    if (this.debugGod) {
      this.burst(this.px, this.py, 4, "#ffb84d", 140, 0.2);
      return;
    }
    if (this.invuln > 0 || this.state === "dying" || this.state === "over") return;
    this.hp -= d;
    this.invuln = 0.75;
    this.addShake(12);
    this.audio.playerHit();
    this.burst(this.px, this.py, 14, C.zone, 260, 0.5);
    this.combo = 0;
    const dx = this.px - hx;
    const dy = this.py - hy;
    const dl = Math.hypot(dx, dy) || 1;
    this.pvx += (dx / dl) * 190;
    this.pvy += (dy / dl) * 190;
    if (this.hp <= 0) this.onPlayerDeath();
  }

  private updateRifts(dt: number) {
    for (let i = this.rifts.length - 1; i >= 0; i--) {
      const rf = this.rifts[i];
      rf.t += dt;
      if (rf.state === "opening") {
        if (rf.t >= 0.6) {
          rf.state = "spawning";
          rf.timer = 0.35;
        }
      } else if (rf.state === "spawning") {
        rf.timer -= dt;
        if (rf.timer <= 0 && rf.queue.length > 0) {
          rf.timer = 0.28;
          const kind = rf.queue.shift()!;
          this.spawnEnemy(kind, rf.x + rand(-14, 14), rf.y + rand(-14, 14), null);
          this.audio.riftSpawn();
          this.burst(rf.x, rf.y, 5, C.rift, 140, 0.3);
        }
        if (rf.queue.length === 0) {
          rf.state = "closing";
          rf.t = 0;
          this.audio.riftClose();
        }
      } else if (rf.state === "closing") {
        if (rf.t >= 0.5) this.rifts.splice(i, 1);
      }
    }
  }

  private updateZoneAndWaves(dt: number) {
    // collapse animation after a wave clear
    if (this.zoneCollapse >= 0) {
      // runs in parallel with the state machine below — the clear
      // banner must not hang while the zone animates away
      this.zoneCollapse = Math.min(1, this.zoneCollapse + dt / 1.0);
      const e = easeOutCubic(this.zoneCollapse);
      this.zoneR = this.zoneTarget * (1 + 0.9 * e);
      this.zoneAlpha = 1 - this.zoneCollapse;
      if (this.zoneCollapse >= 1) {
        this.zoneCollapse = -1;
        this.zoneOn = false;
        this.zoneAlpha = 0;
      }
    }

    switch (this.state) {
      case "playing": {
        if (!this.zoneOn) {
          // countdown 5 → 0, then anchor the zone at the player's position
          this.cdT -= dt;
          const c = Math.ceil(this.cdT);
          if (c !== this.cdLast && c > 0) {
            this.cdLast = c;
            this.hooks.onCountdown({
              id: this.countId++,
              label: t("game.waveN", { n: String(this.wave).padStart(2, "0") }),
              value: String(c),
            });
            this.audio.tick();
          }
          if (this.cdT <= 0) {
            this.zoneX = this.px;
            this.zoneY = this.py;
            this.zoneTarget = this.zoneRadius(this.wave);
            this.zoneR = 40;
            this.zoneOn = true;
            this.zoneAlpha = 0.4;
            this.hooks.onCountdown(null);
            this.audio.go();
            this.rings.push({ x: this.zoneX, y: this.zoneY, r: 30, vr: 500, life: 0.5, maxLife: 0.5, c: rgba(C.zone, 1) });
          }
        } else {
          this.zoneAlpha = Math.min(1, this.zoneAlpha + dt * 2);
          this.zoneR = Math.min(this.zoneTarget, this.zoneR + dt * ZONE_EXPAND_SPEED);
          if (this.zoneR >= this.zoneTarget) {
            this.state = "active";
            this.initWave();
            this.audio.setCombatWave(this.wave);
            this.audio.setCombat(true);
          }
        }
        break;
      }
      case "active": {
        const alive = this.allocated - this.killedWave;
        if (
          this.allocated < this.waveTotal &&
          alive <= this.peakAlive - this.dropThreshold &&
          this.rifts.length < 2
        ) {
          const batch = Math.min(this.stepSize, this.waveTotal - this.allocated);
          this.allocated += batch;
          this.peakAlive = alive + batch;
          this.spawnRift(this.buildQueue(batch));
        }
        if (
          this.allocated >= this.waveTotal &&
          this.enemies.length === 0 &&
          !this.rifts.some((r) => r.queue.length > 0)
        ) {
          this.waveCleared();
        }
        break;
      }
      case "cleared": {
        this.clearT -= dt;
        if (this.clearT <= 0) {
          this.wave++;
          this.hooks.onBanner(null);
          this.state = "playing";
          this.beginCountdown();
        }
        break;
      }
    }
  }

  private clampToZone(
    o: { x: number; y: number; vx: number; vy: number; r: number },
    wallOver = 0
  ) {
    if (!this.zoneOn || this.zoneAlpha < 0.4) return;
    const dx = o.x - this.zoneX;
    const dy = o.y - this.zoneY;
    const d = Math.hypot(dx, dy);
    const lim = this.zoneR - o.r + wallOver;
    if (lim > 10 && d > lim) {
      const nx = dx / d;
      const ny = dy / d;
      o.x = this.zoneX + nx * lim;
      o.y = this.zoneY + ny * lim;
      const vOut = o.vx * nx + o.vy * ny;
      if (vOut > 0) {
        o.vx -= vOut * nx * 1.4;
        o.vy -= vOut * ny * 1.4;
        if (Math.random() < 0.2) {
          this.burst(o.x, o.y, 2, C.zone, 120, 0.2);
        }
      }
    }
  }

  /* ---------------- fx ---------------- */

  private burst(x: number, y: number, n: number, hex: string, speed: number, life: number) {
    const c = rgba(hex, 1);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU;
      const sp = rand(speed * 0.3, speed);
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        life: rand(life * 0.5, life),
        maxLife: life,
        c,
        size: rand(2, 7),
      });
    }
  }

  private popup(x: number, y: number, text: string, color: string) {
    this.hooks.onPopup({ id: this.popupId++, x, y, text, color });
  }

  private updateParticles(dt: number) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-2.5 * dt);
      p.vy *= Math.exp(-2.5 * dt);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.life -= dt;
      r.r += r.vr * dt;
      if (r.life <= 0) this.rings.splice(i, 1);
    }
  }

  /* ---------------- stars ---------------- */

  private genStarChunk(li: number, cx: number, cy: number): Star[] {
    const L = STAR_LAYERS[li];
    const seed =
      (Math.imul(cx, 73856093) ^
        Math.imul(cy, 19349663) ^
        Math.imul(li + 1, 83492791)) >>>
      0;
    const rnd = mulberry32(seed || 0x9e3779b9);
    const out: Star[] = [];
    for (let i = 0; i < L.count; i++) {
      out.push({
        x: cx * L.chunk + rnd() * L.chunk,
        y: cy * L.chunk + rnd() * L.chunk,
        s: L.sMin + rnd() * (L.sMax - L.sMin),
        a: L.aMin + rnd() * (L.aMax - L.aMin),
        tw: 0.4 + rnd() * 2.2,
        ph: rnd() * TAU,
        tint: rnd(),
      });
    }
    return out;
  }

  private updateStarChunks() {
    const W = this.viewW;
    const H = this.viewH;
    const ranges: Array<[number, number, number, number]> = [];
    let key = "";
    for (let li = 0; li < STAR_LAYERS.length; li++) {
      const L = STAR_LAYERS[li];
      const ox = this.camX * L.f;
      const oy = this.camY * L.f;
      const x0 = Math.floor((ox - W / 2) / L.chunk) - 1;
      const x1 = Math.floor((ox + W / 2) / L.chunk) + 1;
      const y0 = Math.floor((oy - H / 2) / L.chunk) - 1;
      const y1 = Math.floor((oy + H / 2) / L.chunk) + 1;
      ranges.push([x0, x1, y0, y1]);
      key += `${x0},${x1},${y0},${y1};`;
    }
    if (key === this.starBoundsKey) return;
    this.starBoundsKey = key;

    const keep = new Set<string>();
    for (let li = 0; li < STAR_LAYERS.length; li++) {
      const [x0, x1, y0, y1] = ranges[li];
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = `${li}:${cx}:${cy}`;
          keep.add(k);
          if (!this.starChunks.has(k)) this.starChunks.set(k, this.genStarChunk(li, cx, cy));
        }
      }
    }
    for (const k of Array.from(this.starChunks.keys())) {
      if (!keep.has(k)) this.starChunks.delete(k);
    }
  }

  /* ---------------- hud ---------------- */

  private emitHud() {
    this.hooks.onHud({
      wave: this.wave,
      score: this.score,
      best: this.best,
      hp: Math.max(0, Math.round(this.hp)),
      maxHp: this.maxHp,
      killed: this.killedWave,
      total: this.waveTotal,
      enemies: this.enemies.length,
      comboMult: this.comboT > 0 ? this.comboMult() : 1,
      time: this.runTime,
      guns: this.guns,
      rateMult: 1 + this.rateBoost,
      rateT: this.rateT,
      drones: this.allyDrones.length,
      minerals: this.minerals,
    });
  }

  /* ============================== drawing ============================== */

  private draw() {
    const R = this.renderer;
    R.resize(window.innerWidth, window.innerHeight);
    R.beginFrame();
    R.setMode("world");
    R.setCamera(this.camX, this.camY, this.zoom, this.shakeX, this.shakeY);

    this.drawStars();
    this.drawAsteroids();

    if (this.state === "menu") {
      this.drawMenuScene();
    } else {
      this.drawZone();
      this.drawRifts();
      this.drawPickups();
      this.drawMines();
      this.drawEnemies();
      this.drawAllyDrones();
      this.drawPlayer();
      this.drawBullets();
      this.drawFx();
    }

    R.finish(this.time);
  }

  private drawStars() {
    const R = this.renderer;
    this.updateStarChunks();
    R.setMode("world");
    const W = this.viewW;
    const H = this.viewH;
    const camX = this.camX;
    const camY = this.camY;
    for (let li = 0; li < STAR_LAYERS.length; li++) {
      const L = STAR_LAYERS[li];
      const ox = camX * L.f;
      const oy = camY * L.f;
      const x0 = Math.floor((ox - W / 2) / L.chunk);
      const x1 = Math.floor((ox + W / 2) / L.chunk);
      const y0 = Math.floor((oy - H / 2) / L.chunk);
      const y1 = Math.floor((oy + H / 2) / L.chunk);
      const shiftX = camX * (1 - L.f);
      const shiftY = camY * (1 - L.f);
      const minX = camX - W / 2 - 8;
      const maxX = camX + W / 2 + 8;
      const minY = camY - H / 2 - 8;
      const maxY = camY + H / 2 + 8;
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const stars = this.starChunks.get(`${li}:${cx}:${cy}`);
          if (!stars) continue;
          for (const st of stars) {
            const wx = st.x + shiftX;
            const wy = st.y + shiftY;
            if (wx < minX || wx > maxX || wy < minY || wy > maxY) continue;
            const twk = 0.72 + 0.28 * Math.sin(this.time * st.tw + st.ph);
            const a = st.a * twk;
            const col: [number, number, number] =
              st.tint < 0.72 ? [0.78, 0.88, 1] : st.tint < 0.9 ? [1, 0.92, 0.78] : [0.82, 0.74, 1];
            R.pushLine(wx - st.s, wy, wx + st.s, wy, [col[0], col[1], col[2], a]);
            if (st.s > 1.8) {
              R.pushLine(wx, wy - st.s, wx, wy + st.s, [col[0], col[1], col[2], a * 0.5]);
            }
          }
        }
      }
    }
  }

  private drawZone() {
    if (!this.zoneOn || this.zoneAlpha <= 0) return;
    const R = this.renderer;
    const a = this.zoneAlpha;
    const zr = this.zoneR;
    // outer wavy "energy wall"
    const segs = 90;
    let px = 0;
    let py = 0;
    for (let i = 0; i <= segs; i++) {
      const ang = (i / segs) * TAU;
      const wob =
        Math.sin(ang * 6 + this.time * 2.2) * 4 +
        Math.sin(ang * 11 - this.time * 3.1) * 2.5 +
        Math.sin(ang * 3 + this.time * 1.3) * 3;
      const rr = zr + wob;
      const x = this.zoneX + Math.cos(ang) * rr;
      const y = this.zoneY + Math.sin(ang) * rr;
      if (i > 0) R.pushLine(px, py, x, y, rgba(C.zone, 0.5 * a));
      px = x;
      py = y;
    }
    // inner dashed ring
    R.dashedCircle(this.zoneX, this.zoneY, zr * 0.96, rgba(C.zone, 0.3 * a), 24, this.time * 0.8);
  }

  private drawRifts() {
    for (const rf of this.rifts) this.drawRift(rf);
  }

  /**
   * Two-stage lifecycle: point → line → writhing rift, and the reverse.
   */
  private drawRift(rf: Rift) {
    let lenP = 1;
    let widP = 1;
    let alpha = 1;
    let snake = 1;

    if (rf.state === "opening") {
      if (rf.t < 0) return;
      const p = clamp(rf.t / 0.6, 0, 1);
      if (p < 0.42) {
        const q = easeOutCubic(p / 0.42);
        lenP = q;
        widP = 0;
        snake = 0;
        alpha = 0.35 + 0.65 * q;
      } else {
        const q = easeOutCubic((p - 0.42) / 0.58);
        lenP = 1;
        widP = q;
        snake = 1.7 - 0.7 * q;
        alpha = 1;
      }
    } else if (rf.state === "closing") {
      const p = clamp(rf.t / 0.5, 0, 1);
      if (p < 0.6) {
        const q = easeOutCubic(p / 0.6);
        lenP = 1;
        widP = 1 - q;
        snake = 1 + q * 0.8;
        alpha = 1;
      } else {
        const q = easeOutCubic((p - 0.6) / 0.4);
        lenP = 1 - q;
        widP = 0;
        snake = 0;
        alpha = 1 - q;
      }
    } else {
      lenP = 1 + 0.04 * Math.sin(rf.t * 6);
      widP = 1 + 0.06 * Math.sin(rf.t * 6 + 1.4);
    }

    if (lenP <= 0.03) {
      const pr = 3 + 1.6 * Math.sin(this.time * 18 + rf.seed);
      this.renderer.circle(rf.x, rf.y, Math.max(1.5, pr), rgba(C.riftCore, 0.9 * alpha), 10);
      return;
    }

    this.drawRiftShape(
      rf.x,
      rf.y,
      rf.size * lenP,
      rf.size * 0.227 * widP,
      rf.seed,
      this.time,
      alpha,
      rf.rot,
      snake
    );
  }

  private drawRiftShape(
    x: number,
    y: number,
    len: number,
    wid: number,
    seed: number,
    tt: number,
    alpha: number,
    rot: number,
    snake: number
  ) {
    const R = this.renderer;
    const N = 12;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);
    const X = (lx: number, ly: number): [number, number] => [
      x + lx * cosR - ly * sinR,
      y + lx * sinR + ly * cosR,
    ];

    const center: Array<[number, number]> = [];
    const left: Array<[number, number]> = [];
    const right: Array<[number, number]> = [];
    for (let k = 0; k <= N; k++) {
      const s = k / N;
      const u = -len / 2 + len * s;
      const taper = Math.sin(Math.PI * s);
      const wob =
        (Math.sin(seed * 7.3 + s * 9.0 + tt * 4.4) * 0.6 +
          Math.sin(seed * 3.1 + s * 4.2 - tt * 2.7) * 0.4) *
        (5 + wid * 0.3) *
        snake *
        taper;
      const hw =
        wid * 0.5 * taper * (1 + 0.3 * Math.sin(s * 13.0 + seed * 5.0 + tt * 5.5) * Math.min(1, snake));
      center.push(X(wob, u));
      left.push(X(wob - hw, u));
      right.push(X(wob + hw, u));
    }

    if (wid <= 0.6) {
      R.polyline(center, false, rgba(C.riftCore, 0.95 * alpha));
      R.polyline(center, false, rgba(C.rift, 0.45 * alpha));
      R.circle(center[0][0], center[0][1], 3.2, rgba(C.riftCore, 0.85 * alpha), 10);
      R.circle(center[N][0], center[N][1], 3.2, rgba(C.riftCore, 0.85 * alpha), 10);
      return;
    }

    R.polyline(left, false, rgba(C.rift, 0.85 * alpha));
    R.polyline(right, false, rgba(C.rift, 0.85 * alpha));
    R.polyline(center, false, rgba(C.riftCore, 0.5 * alpha));
    for (let k = 2; k < N - 1; k += 2) {
      R.pushLine(left[k][0], left[k][1], right[k][0], right[k][1], rgba(C.riftCore, 0.22 * alpha));
    }
    R.circle(center[0][0], center[0][1], 4, rgba(C.riftCore, 0.6 * alpha), 12);
    R.circle(center[N][0], center[N][1], 4, rgba(C.riftCore, 0.6 * alpha), 12);
  }

  private drawShipPoly(
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
    this.renderer.polyline(world, true, c);
  }

  private drawPickups() {
    const R = this.renderer;
    for (const p of this.pickups) {
      const blinkA = p.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(p.life * 7)) : 1;
      const rot = this.time * 1.4 + p.seed;
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
                     : C.mint;      const pr = 15 + Math.sin(this.time * 4 + p.seed) * 2;
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
          this.drawShipPoly(p.x, p.y, rot, [[6, 0], [-4, 4], [-4, -4]], rgba(col, blinkA));
          R.circle(p.x, p.y, 9.5, rgba(col, 0.4 * blinkA), 18);
          break;
        }
        case "dash": {
          // open arrowhead — same shape as the dash shell
          const L = 10;
          const Wd = 7;
          const tx = p.x + L * c1;
          const ty = p.y + L * s1;
          R.pushLine(tx, ty, p.x - L * 0.5 * c1 - Wd * s1, p.y - L * 0.5 * s1 + Wd * c1, rgba(col, blinkA));
          R.pushLine(tx, ty, p.x - L * 0.5 * c1 + Wd * s1, p.y - L * 0.5 * s1 - Wd * c1, rgba(col, blinkA));
          break;
        }
        case "miner": {
          // little mine with detonator spikes
          const s = 5.5;
          R.polyline(
            [
              [p.x, p.y - s],
              [p.x + s, p.y],
              [p.x, p.y + s],
              [p.x - s, p.y],
            ],
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
          // faceted gem
          const s = 6.5;
          R.polyline(
            [
              [p.x, p.y - s],
              [p.x + s, p.y - s * 0.3],
              [p.x + s * 0.6, p.y + s],
              [p.x - s * 0.6, p.y + s],
              [p.x - s, p.y - s * 0.3],
            ],
            true,
            rgba(col, blinkA)
          );
          R.pushLine(p.x, p.y - s, p.x, p.y + s, rgba(col, 0.4 * blinkA));
          break;
        }
      }
    }
  }

  private drawMines() {
    const R = this.renderer;
    for (const m of this.mines) {
      // blast-radius hint so the pilot knows when the trap will spring
      R.dashedCircle(m.x, m.y, MINE_RADIUS, rgba(C.mine, 0.16), 14, this.time * 0.5);

      // blink faster as the failsafe fuse runs down
      const urgency = clamp(1 - m.fuse / MINE_LIFE, 0, 1);
      const blink = Math.sin(this.time * (6 + urgency * 14) + m.seed) > -0.2 ? 1 : 0.45;
      const s = 9 + Math.sin(this.time * 3 + m.seed) * 1.2;
      const c = rgba(C.mine, 0.95 * blink);

      // diamond body
      R.polyline(
        [
          [m.x, m.y - s],
          [m.x + s, m.y],
          [m.x, m.y + s],
          [m.x - s, m.y],
        ],
        true,
        c
      );
      // detonator spikes
      const sp = s + 5;
      R.pushLine(m.x, m.y - s, m.x, m.y - sp, c);
      R.pushLine(m.x + s, m.y, m.x + sp, m.y, c);
      R.pushLine(m.x, m.y + s, m.x, m.y + sp, c);
      R.pushLine(m.x - s, m.y, m.x - sp, m.y, c);
      // core
      R.pushLine(m.x - 2.5, m.y, m.x + 2.5, m.y, rgba(C.white, 0.9 * blink));
      R.pushLine(m.x, m.y - 2.5, m.x, m.y + 2.5, rgba(C.white, 0.9 * blink));
    }
  }

  private drawAllyDrones() {
    const R = this.renderer;
    const n = this.allyDrones.length;
    if (n === 0) return;
    if (this.state !== "dying" && this.state !== "over") {
      R.dashedCircle(this.px, this.py, 58, rgba(C.mint, 0.12), 20, this.time * 0.7);
    }
    for (const d of this.allyDrones) {
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
        d.x,
        d.y,
        d.angle,
        [
          [7, 0],
          [-5, 5],
          [-2, 0],
          [-5, -5],
        ],
        col
      );
      // hull integrity arc
      if (hpF < 1) {
        R.dashedCircle(d.x, d.y, 11, [cr, cg, cb, 0.5], 10, this.time, 0.35);
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

  private drawPlayer() {
    const R = this.renderer;
    if (this.state === "dying" || this.state === "over") return;
    const blink = this.invuln > 0 ? (Math.sin(this.time * 30) > 0 ? 0.35 : 1) : 1;

    // thruster
    if (this.thrusting) {
      const cos = Math.cos(this.pAngle);
      const sin = Math.sin(this.pAngle);
      const len = 10 + Math.random() * 8;
      R.pushLine(
        this.px - cos * 12,
        this.py - sin * 12,
        this.px - cos * (12 + len),
        this.py - sin * (12 + len),
        rgba(C.player, 0.6 * blink)
      );
    }

    // dash shell: a sharp chevron larger than the hull, open at the back
    if (this.dashT > 0) {
      const a = this.pAngle;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pulse = 1 + Math.sin(this.time * 16) * 0.08;
      const L = 30 * pulse; // tip length
      const Wd = 20 * pulse; // half-width at the wings
      const tipX = this.px + ca * L;
      const tipY = this.py + sa * L;
      // wings swept back, NO rear edge — an open arrowhead
      const w1x = this.px - ca * L * 0.55 - sa * Wd;
      const w1y = this.py - sa * L * 0.55 + ca * Wd;
      const w2x = this.px - ca * L * 0.55 + sa * Wd;
      const w2y = this.py - sa * L * 0.55 - ca * Wd;
      let glow = Math.min(1, this.dashT / 0.4);
      // blink faster as the overdrive is about to run out
      if (this.dashT < 1.0) {
        const hz = 6 + (1 - this.dashT) * 12;
        glow *= 0.55 + 0.45 * Math.sin(this.time * hz);
      }
      R.pushLine(tipX, tipY, w1x, w1y, rgba(C.dash, 0.95 * glow));
      R.pushLine(tipX, tipY, w2x, w2y, rgba(C.dash, 0.95 * glow));
      // faint inner chevron for depth
      const L2 = L * 0.62;
      const W2 = Wd * 0.62;
      R.pushLine(
        this.px + ca * L2,
        this.py + sa * L2,
        this.px - ca * L2 * 0.55 - sa * W2,
        this.py - sa * L2 * 0.55 + ca * W2,
        rgba(C.dash, 0.4 * glow)
      );
      R.pushLine(
        this.px + ca * L2,
        this.py + sa * L2,
        this.px - ca * L2 * 0.55 + sa * W2,
        this.py - sa * L2 * 0.55 - ca * W2,
        rgba(C.dash, 0.4 * glow)
      );
    }

    // hull — faces movement direction
    this.drawShipPoly(
      this.px,
      this.py,
      this.pAngle,
      [
        [16, 0],
        [-11, 10],
        [-6, 0],
        [-11, -10],
      ],
      rgba(C.player, blink)
    );

    // turret: barrels pivot toward the aim
    const ba = this.aimA !== null ? this.aimA : this.pAngle;
    const gcos = Math.cos(ba);
    const gsin = Math.sin(ba);
    for (let i = 0; i < this.guns; i++) {
      const o = GUN_OFFS[i];
      const bx = this.px + 8 * gcos - o * gsin;
      const by = this.py + 8 * gsin + o * gcos;
      R.pushLine(bx, by, bx + 8 * gcos, by + 8 * gsin, rgba(C.mint, 0.85 * blink));
    }
    if (this.aimA !== null) {
      R.pushLine(
        this.px + Math.cos(this.aimA) * 20,
        this.py + Math.sin(this.aimA) * 20,
        this.px + Math.cos(this.aimA) * 30,
        this.py + Math.sin(this.aimA) * 30,
        rgba(C.mint, 0.3 * blink)
      );
    }

    // fire-rate boost: a solid circular progress bar that drains with the timer
    if (this.rateT > 0) {
      const f = clamp(this.rateT / RATE_BOOST_TIME, 0, 1);
      const rr = 26;
      const segs = Math.max(6, Math.round(30 * f));
      const a0 = -Math.PI / 2; // start from the top, sweep clockwise
      let pxp = this.px + Math.cos(a0) * rr;
      let pyp = this.py + Math.sin(a0) * rr;
      const blink = f < 0.2 ? (Math.sin(this.time * 14) > 0 ? 1 : 0.45) : 1;
      for (let i = 1; i <= segs; i++) {
        const a = a0 + (i / segs) * f * TAU;
        const nx = this.px + Math.cos(a) * rr;
        const ny = this.py + Math.sin(a) * rr;
        R.pushLine(pxp, pyp, nx, ny, rgba(C.fighter, 0.75 * blink));
        pxp = nx;
        pyp = ny;
      }
    }
    // god mode halo
    if (this.debugGod) {
      R.circle(this.px, this.py, 22, rgba("#ffb84d", 0.4 + 0.2 * Math.sin(this.time * 5)), 32);
    }
  }

  private drawEnemies() {
    const R = this.renderer;
    for (const e of this.enemies) {
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
          const rot = e.angle + Math.sin(this.time * 3 + e.seed) * 0.12;
          this.drawShipPoly(
            e.x,
            e.y,
            rot,
            [
              [9, 0],
              [-7, 7],
              [-4, 0],
              [-7, -7],
            ],
            col
          );
          break;
        }
        case "hunter": {
          // sleek dart with a sensor eye — always pointed where it's going
          this.drawShipPoly(
            e.x,
            e.y,
            e.angle,
            [
              [13, 0],
              [-8, 6],
              [-4, 0],
              [-8, -6],
            ],
            col
          );
          R.circle(
            e.x + Math.cos(e.angle) * 5,
            e.y + Math.sin(e.angle) * 5,
            2,
            rgba(C.hunter, 0.95),
            8
          );
          // predictive targeting tick toward the intercept point
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
          this.drawShipPoly(
            e.x,
            e.y,
            e.angle,
            [
              [14, 0],
              [-10, 9],
              [-5, 0],
              [-10, -9],
            ],
            col
          );
          break;
        }
        case "cruiser": {
          this.drawShipPoly(
            e.x,
            e.y,
            e.angle,
            [
              [22, 0],
              [8, 14],
              [-18, 12],
              [-18, -12],
              [8, -14],
            ],
            col
          );
          R.circle(e.x, e.y, 8, rgba(base, 0.5), 16);
          break;
        }
        case "carrier": {
          this.drawShipPoly(
            e.x,
            e.y,
            e.angle,
            [
              [30, 0],
              [10, 20],
              [-24, 16],
              [-24, -16],
              [10, -20],
            ],
            col
          );
          R.circle(e.x, e.y, 12, rgba(base, 0.4), 20);
          R.dashedCircle(e.x, e.y, 20, rgba(base, 0.3), 8, this.time * 0.8);
          break;
        }
      }
      // hp arc for tougher ships
      if (e.maxHp > 40 && e.hp < e.maxHp) {
        const f = clamp(e.hp / e.maxHp, 0, 1);
        R.dashedCircle(e.x, e.y, e.r + 6, rgba(base, 0.4), Math.max(3, Math.round(10 * f)), this.time, 0.4);
      }
    }
  }

  private drawBullets() {
    const R = this.renderer;
    for (const b of this.bullets) {
      const l = 7;
      const d = Math.hypot(b.vx, b.vy) || 1;
      R.pushLine(
        b.x - (b.vx / d) * l,
        b.y - (b.vy / d) * l,
        b.x,
        b.y,
        rgba(C.bullet, 0.95)
      );
    }
    for (const b of this.ebullets) {
      if (b.heavy) {
        R.circle(b.x, b.y, 3.4, rgba(C.enemyBullet, 0.95), 10);
      } else {
        const l = 6;
        const d = Math.hypot(b.vx, b.vy) || 1;
        R.pushLine(
          b.x - (b.vx / d) * l,
          b.y - (b.vy / d) * l,
          b.x,
          b.y,
          rgba(C.enemyBullet, 0.9)
        );
      }
    }
  }

  private drawFx() {
    const R = this.renderer;
    for (const p of this.particles) {
      const f = clamp(p.life / p.maxLife, 0, 1);
      const l = p.size * f;
      const d = Math.hypot(p.vx, p.vy) || 1;
      R.pushLine(
        p.x - (p.vx / d) * l,
        p.y - (p.vy / d) * l,
        p.x,
        p.y,
        [p.c[0], p.c[1], p.c[2], p.c[3] * f]
      );
    }
    for (const r of this.rings) {
      const f = clamp(r.life / r.maxLife, 0, 1);
      R.circle(r.x, r.y, r.r, [r.c[0], r.c[1], r.c[2], r.c[3] * f], 40);
    }
  }

  private drawMenuScene() {
    const R = this.renderer;
    // a slow decorative rift with orbiting drone silhouettes
    const prog = 0.75 + 0.25 * Math.sin(this.time * 0.8);
    this.drawRiftShape(0, -30, 130 * prog, 40 * prog, 7, this.time, 1, this.time * 0.05, 1);
    for (let i = 0; i < 3; i++) {
      const a = this.time * (0.25 + i * 0.07) + (i * TAU) / 3;
      const ox = Math.cos(a) * (200 + i * 46);
      const oy = -30 + Math.sin(a) * (115 + i * 28);
      this.drawShipPoly(
        ox,
        oy,
        a + Math.PI / 2,
        [
          [10, 0],
          [-8, 8],
          [-4, 0],
          [-8, -8],
        ],
        rgba(C.drone, 0.35)
      );
    }
  }
}
