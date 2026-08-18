/**
 * Game - чистый оркестратор игровых систем.
 * Координирует работу модульных систем через EventBus и GameState.
 * Не содержит бизнес-логики - вся логика вынесена в системы.
 */

import { t } from "../i18n";
import { AudioEngine } from "./audio";
import { waveTotalFor, type EnemyKind, PickupKind, PLAYER_MAX_SPEED, ZONE_EXPAND_SPEED } from "./balance";
import { Renderer } from "./render";
import { clamp, easeOutCubic } from "./math";

/* Core systems */
import { EventBus } from "./core/EventBus";
import { GameState } from "./core/GameState";

/* Subsystems */
import { AsteroidField } from "./asteroids";
import { Fx } from "./fx";
import { InputManager } from "./input";
import { RiftField } from "./rifts";
import { Starfield } from "./starfield";

/* Entity types */
import type { Enemy, Bullet, EBullet, Pickup, Mine, AllyDrone } from "./types";

/* Game systems */
import { RendererSystem, type PlayerRenderState, type ZoneRenderState, type EnemyRenderState, type PickupRenderState, type MineRenderState, type AllyDroneRenderState, type BulletRenderState, type EBulletRenderState } from "./systems/RendererSystem";
import { BulletSystem } from "./systems/BulletSystem";
import { SpawnSystem } from "./systems/SpawnSystem";
import { CountdownSystem } from "./systems/CountdownSystem";
import { MineSystem } from "./systems/MineSystem";
import { DroneSystem } from "./systems/DroneSystem";
import { PickupSystem } from "./systems/PickupSystem";
import { PlayerSystem } from "./systems/PlayerSystem";
import { EnemySystem } from "./systems/EnemySystem";
import { CollisionSystem } from "./systems/CollisionSystem";

/* ============================== UI types ============================== */

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

interface Hooks {
  onHud: (h: HudData) => void;
  onBanner: (b: BannerData | null) => void;
  onToast: (toast: ToastData | null) => void;
  onCountdown: (c: CountData | null) => void;
  onPopup: (p: PopupData) => void;
  onStats: (s: StatsData) => void;
  onPause: (p: boolean) => void;
}

const BEST_KEY = "voxbest";

/* ============================== Game Orchestrator ============================== */

export class Game {
  readonly audio = new AudioEngine();
  private renderer: Renderer;
  private hooks: Hooks;
  private touchActive = false;
  private touchX = 0;
  private touchY = 0;
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;

  private raf = 0;
  private lastT = 0;
  private time = 0;
  private timeScale = 1;

  private debugGod = false;
  private debugShow = false;
  private debugToggleTimer = 0;
  private fpsEma = 60;
  private startWave = 1;

  private state: "menu" | "playing" | "active" | "cleared" | "dying" | "over" = "menu";
  private paused = false;

  /* Core systems */
  private eventBus: EventBus;
  private gameState: GameState;

  /* Input + presentation subsystems */
  private input: InputManager;
  private fx: Fx;
  private starfield: Starfield;
  private asteroidField: AsteroidField;
  private riftField: RiftField;
  private rendererSystem: RendererSystem;

  /* Game logic systems */
  private playerSystem: PlayerSystem;
  private enemySystem: EnemySystem;
  private bulletSystem: BulletSystem;
  private spawnSystem: SpawnSystem;
  private countdownSystem: CountdownSystem;
  private mineSystem: MineSystem;
  private droneSystem: DroneSystem;
  private pickupSystem: PickupSystem;
  private collisionSystem: CollisionSystem;

  /* Wave & zone management */
  private wave = 1;
  private waveTotal = 0;
  private allocated = 0;
  private killedWave = 0;
  private peakAlive = 0;

  private zoneOn = false;
  private zoneX = 0;
  private zoneY = 0;
  private zoneR = 0;
  private zoneTarget = 0;
  private zoneAlpha = 0;
  private zoneCollapse = -1;

  private edgeOutT = 0;
  private edgeTickT = 0;
  private edgeWarned = false;

  private clearT = 0;
  private waveClearSent = false;
  private spawnQueue: string[] = [];
  private spawnIdx = 0;

  /* Scoring */
  private score = 0;
  private best = 0;
  private killed = 0;
  private combo = 0;
  private comboT = 0;
  private runTime = 0;

  private popupId = 0;
  private countId = 0;

  /* Camera */
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private viewW = 800;
  private viewH = 600;

  /* Entity arrays */
  private enemyList: Enemy[] = [];
  private bullets: Bullet[] = [];
  private enemyBulletList: EBullet[] = [];
  private pickups: Pickup[] = [];
  private allyDrones: AllyDrone[] = [];
  private mines: Mine[] = [];
  private mineDropT = -1;
  private minerals = 0;

  private onResize = () => {
    this.viewW = window.innerWidth;
    this.viewH = window.innerHeight;
    this.renderer.width = this.viewW;
    this.renderer.height = this.viewH;
  };
  
  private updateAimAngle() {
    // Convert mouse screen position to world position
    const worldX = this.camX + (this.mouseX - this.viewW / 2) / this.zoom;
    const worldY = this.camY + (this.mouseY - this.viewH / 2) / this.zoom;
    
    const playerPos = this.playerSystem.getState();
    const angle = Math.atan2(worldY - playerPos.y, worldX - playerPos.x);
    this.playerSystem.setAim(angle);
  }

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.renderer = new Renderer(canvas);
    this.hooks = hooks;
    this.best = (() => {
      try {
        return Number(localStorage.getItem(BEST_KEY)) || 0;
      } catch {
        return 0;
      }
    })();
    this.onResize();

    /* Initialize core systems */
    this.eventBus = new EventBus();
    this.gameState = new GameState();

    /* Initialize input */
    this.input = new InputManager({
      onPauseKey: () => this.togglePause(),
      onLoseFocus: () => {
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
      },
    });

    /* Initialize presentation subsystems */
    this.fx = new Fx();
    this.starfield = new Starfield();
    
    // Setup mouse/touch controls for aiming and firing
    const gameCanvas = this.renderer.canvas;
    gameCanvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.updateAimAngle();
    });
    canvas.addEventListener('mousedown', (e) => {
      this.mouseDown = true;
      this.playerSystem.setIsFiring(true);
    });
    canvas.addEventListener('mouseup', () => {
      this.mouseDown = false;
      this.playerSystem.setIsFiring(false);
    });
    canvas.addEventListener('mouseleave', () => {
      this.mouseDown = false;
      this.playerSystem.setIsFiring(false);
    });
    canvas.addEventListener('touchstart', (e) => {
      this.mouseDown = true;
      this.playerSystem.setIsFiring(true);
    }, { passive: true });
    canvas.addEventListener('touchend', () => {
      this.mouseDown = false;
      this.playerSystem.setIsFiring(false);
    });
    this.asteroidField = new AsteroidField({
      addScore: (n) => this.addScore(n),
      spawnPickup: (kind, x, y, vx, vy) => this.spawnPickup(kind, x, y, vx, vy),
      fx: this.fx,
      audio: this.audio,
    });
    this.riftField = new RiftField({
      spawnEnemy: (kind, x, y) => this.spawnEnemy(kind, x, y, null),
      fx: this.fx,
      audio: this.audio,
    });

    this.rendererSystem = new RendererSystem({
      fx: this.fx,
      starfield: this.starfield,
      asteroidField: this.asteroidField,
      riftField: this.riftField,
    });

    /* Initialize game logic systems with dependency injection */
    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.gameState,
      this.input,
      this.fx,
      this.audio,
      () => this.getZoneBounds(),
      (kind: string, x: number, y: number, vx: number, vy: number) => this.spawnPickup(kind as any, x, y, vx, vy),
      (angle: number) => this.fireAll(angle)
    );

    this.enemySystem = new EnemySystem(
      this.eventBus,
      this.gameState,
      this.fx,
      this.audio,
      (e: any) => this.enemyFire(e),
      () => this.getZoneBounds()
    );

    this.bulletSystem = new BulletSystem(
      this.eventBus,
      this.gameState,
      this.fx,
      this.audio
    );

    this.spawnSystem = new SpawnSystem({
      hooks: {
        fx: this.fx,
        audio: this.audio,
      },
      eventBus: this.eventBus,
      riftField: this.riftField,
      fx: this.fx,
      audio: this.audio,
    });

    this.countdownSystem = new CountdownSystem({
      hooks: {
        onBanner: (b) => this.hooks.onBanner(b),
        onToast: (t) => this.hooks.onToast(t),
        onCountdown: (c) => {
          if (c) {
            this.countId++;
            this.hooks.onCountdown({ id: this.countId, label: c.label, value: c.value });
          } else {
            this.hooks.onCountdown(null);
          }
        },
      },
      eventBus: this.eventBus,
    });

    this.mineSystem = new MineSystem(
      this.eventBus,
      this.gameState,
      this.fx,
      this.audio
    );

    this.droneSystem = new DroneSystem(
      this.eventBus,
      this.gameState,
      this.fx,
      this.audio,
      (kind: string, x: number, y: number, parent: any) => this.spawnEnemy(kind as any, x, y, parent)
    );

    this.pickupSystem = new PickupSystem(
      this.eventBus,
      this.gameState,
      this.audio,
      (kind) => this.applyPickup(kind),
      () => this.getPlayerPosition()
    );

    this.collisionSystem = new CollisionSystem(
      this.eventBus,
      this.gameState
    );

    /* Subscribe to events */
    this.setupEventListeners();

    window.addEventListener("resize", this.onResize);

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
    window.removeEventListener("resize", this.onResize);
    this.input.destroy();
    this.audio.destroy();
  }

  private setupEventListeners() {
    this.eventBus.on("player_hit", (event) => {
      const data = event.payload as { dmg: number };
      this.playerSystem.hit(data.dmg);
    });

    this.eventBus.on("enemy_killed", (event) => {
      const data = event.payload as { scoreValue: number };
      const { scoreValue } = data;
      this.score += scoreValue;
      this.killed++;
      this.killedWave++;
      this.combo++;
      this.comboT = 3;
      this.checkWaveClear();
    });

    this.eventBus.on("wave_started", (event) => {
      // Запускаем волну при начале обратного отсчёта
      if (this.state === "playing" || this.state === "active") {
        this.waveTotal = waveTotalFor(this.wave);
      }
    });

    this.eventBus.on("spawn_enemy", (event) => {
      const data = event.payload as { kind: string; x: number; y: number; parent: Enemy | null };
      const { kind, x, y, parent } = data;
      this.spawnEnemy(kind as any, x, y, parent);
    });

    this.eventBus.on("fire_bullet", (event) => {
      const data = event.payload as { x: number; y: number; vx: number; vy: number; life: number; dmg: number; isEnemy: boolean };
      const { x, y, vx, vy, life, dmg, isEnemy } = data;
      if (isEnemy) {
        this.enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy: false });
      } else {
        this.bullets.push({ x, y, vx, vy, life, dmg });
      }
    });

    this.eventBus.on("spawn_pickup", (event) => {
      const data = event.payload as { kind: string; x: number; y: number; vx: number; vy: number };
      const { kind, x, y, vx, vy } = data;
      this.spawnPickup(kind as any, x, y, vx, vy);
    });

    this.eventBus.on("pickup_collected", (event) => {
      const data = event.payload as { kind: string };
      this.applyPickup(data.kind as any);
    });

    this.eventBus.on("popup", (event) => {
      const data = event.payload as { x: number; y: number; text: string; color: string };
      const { x, y, text, color } = data;
      this.popupId++;
      this.hooks.onPopup({ id: this.popupId, x, y, text, color });
    });

    this.eventBus.on("camera_shake", (event) => {
      const data = event.payload as { strength: number; duration: number };
      const { strength, duration } = data;
      this.fx.addShake(strength);
    });

    this.eventBus.on("zone_update", (event) => {
      const data = event.payload as { x: number; y: number; radius: number; targetRadius: number; alpha: number; active: boolean };
      const { x, y, radius, targetRadius, alpha, active } = data;
      this.zoneX = x;
      this.zoneY = y;
      this.zoneR = radius;
      this.zoneTarget = targetRadius;
      this.zoneAlpha = alpha;
      this.zoneOn = active;
    });

    this.eventBus.on("asteroid_hit", (event) => {
      const data = event.payload as { index: number; dmg: number; vx: number; vy: number; x: number; y: number };
      const { index, dmg, x, y } = data;
      // Delegate damage/destruction to asteroidField
      this.asteroidField.damageAt(index, dmg, x ?? 0, y ?? 0);
    });
  }

  private step(dt: number) {
    const dtScaled = dt * this.timeScale;
    this.time += dtScaled;

    this.handleDebugKeys();

    this.gameState.setTime(this.time);
    this.gameState.setWave(this.wave);
    this.gameState.setScore(this.score);

    if (this.state === "menu") {
      this.updateMenu(dtScaled);
      return;
    }

    if (this.paused) {
      this.render();
      return;
    }

    /* Update all systems in order */
    this.countdownSystem.update(dtScaled);
    if (this.state === "playing" || this.state === "active") {
      this.updateAimAngle();
    }
    this.playerSystem.update(dtScaled, this.state !== "menu" && this.state !== "over" && this.state !== "dying");
    // Жёсткий барьер зоны: отталкивает игрока обратно, если он вышел за границу
    if (this.zoneOn && this.zoneR > 0) {
      this.playerSystem.clampPlayerToZone(this.zoneX, this.zoneY, this.zoneR, this.zoneOn, 0);
    }
    // Ограничиваем врагов пределами зоны волны
    this.enemySystem.clampEnemiesToZone(this.zoneX, this.zoneY, this.zoneR, this.zoneOn);
    this.enemySystem.update(dtScaled, this.enemyList, this.getPlayerPosition());
    this.bulletSystem.update(dtScaled, this.bullets, this.enemyBulletList, this.enemyList);
    this.mineSystem.update(dtScaled, this.mines);
    this.droneSystem.update(dtScaled, this.allyDrones, this.enemyList);
    const playerState = this.playerSystem.getState();
    // Get asteroids from asteroid field for collision
    const asteroids = ((this.asteroidField as any).list || []) as Array<{ x: number; y: number; r: number; vx: number; vy: number }>;
    this.collisionSystem.update(
      dtScaled,
      { x: playerState.x, y: playerState.y, r: 16, hp: playerState.hp, invuln: playerState.invuln },
      this.enemyList as any,
      this.bullets as any,
      this.enemyBulletList as any,
      this.pickups as any,
      this.mines as any,
      this.allyDrones as any,
      asteroids
    );
    // Collision spawns pickups, so update pickups AFTER collision
    this.pickupSystem.update(dtScaled, this.pickups);
    this.spawnSystem.update(dtScaled, this.wave, this.allocated, this.killedWave, this);
    this.riftField.update(dtScaled);
    this.fx.update(dtScaled, dtScaled); // Обновляем частицы и тряску экрана
    this.updateZoneAndWaves(dtScaled);
    this.updateEdgeDanger(dtScaled);
    
    // Авто-стрельба по ближайшему врагу в зоне поражения
    if (this.state === "playing" || this.state === "active") {
      this.handleAutoFire(dtScaled);
    }
    
    // Update asteroid field with camera and zone info
    this.asteroidField.update(dtScaled, {
      camX: this.camX,
      camY: this.camY,
      viewW: this.viewW,
      viewH: this.viewH,
      zone: this.zoneOn ? { x: this.zoneX, y: this.zoneY, r: this.zoneR } : null,
    } as any);

    this.render();
    this.renderDebug();
    this.updateHud();
  }

  private render() {
    const playerState = this.playerSystem.getState();
    
    // Camera follows player with smooth interpolation
    const targetCamX = playerState.x;
    const targetCamY = playerState.y;
    this.camX += (targetCamX - this.camX) * Math.min(1, 8 * (1/60));
    this.camY += (targetCamY - this.camY) * Math.min(1, 8 * (1/60));
    
    const playerRender = this.playerSystem.getRenderState();
    
    this.rendererSystem.render(
      this.renderer,
      {
        type: this.state,
        time: this.time,
        wave: this.wave,
        score: this.score,
      },
      playerRender,
      this.enemyList,
      this.bullets,
      this.enemyBulletList,
      this.pickups,
      this.mines,
      this.allyDrones,
      {
        active: this.zoneOn,
        x: this.zoneX,
        y: this.zoneY,
        radius: this.zoneR,
        targetRadius: this.zoneTarget,
        alpha: this.zoneAlpha,
      },
      this.camX,
      this.camY,
      this.zoom,
      this.viewW,
      this.viewH
    );
  }

  private updateMenu(dt: number) {
    this.starfield.update(dt, 0, 0, 1, 0, window.innerWidth, window.innerHeight);
    this.asteroidField.update(dt, {
      camX: 0,
      camY: 0,
      viewW: this.viewW,
      viewH: this.viewH,
      zone: null,
    } as any);
    this.fx.update(dt, dt); // Обновляем частицы и тряску экрана
    
    // Меню враги — полностью изолированы от игрового riftField
    this.updateMenuEnemies(dt);
    
    this.renderer.clear();
    this.rendererSystem.renderMenu(
      this.renderer,
      this.starfield,
      this.asteroidField,
      this.riftField,
      this.enemyMenuList,
      this.viewW,
      this.viewH
    );
  }
  
  // Menu scene enemy animation - enemies spawn from central rift
  private enemyMenuList: Array<{
    x: number; y: number; vx: number; vy: number;
    kind: EnemyKind; angle: number; seed: number;
  }> = [];
  private menuEnemyTimer = 0;
  
  private updateMenuEnemies(dt: number) {
    // ТОЛЬКО для меню — не вызываем в игре
    if (this.state !== "menu") return;
    
    // Меню враги — полностью изолированы от игрового riftField
    // Меню rift рендерится отдельно через drawMenuScene — не используем riftField
    const cx = this.viewW / 2;
    const cy = this.viewH / 2;
    
    // Spawn new enemy from rift periodically
    this.menuEnemyTimer -= dt;
    if (this.menuEnemyTimer <= 0 && this.enemyMenuList.length < 8) {
      this.menuEnemyTimer = 1.5 + Math.random() * 2;
      // ТОЛЬКО дроны в меню — они не стреляют
      const kind: EnemyKind = "drone";
      
      // Spawn from center of screen
      const angle = Math.random() * Math.PI * 2;
      const speed = 30 + Math.random() * 40;
      this.enemyMenuList.push({
        x: cx + Math.cos(angle) * 40,
        y: cy + Math.sin(angle) * 40,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        kind,
        angle: angle,
        seed: Math.random() * 100,
      });
    }
    
    // Update enemy positions
    for (const e of this.enemyMenuList) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      // Gentle sine wave motion
      e.x += Math.sin(this.time * 2 + e.seed) * 0.3;
      e.y += Math.cos(this.time * 1.5 + e.seed) * 0.3;
    }
    
    // Remove enemies that are off screen (outside camera visibility)
    const margin = 100;
    this.enemyMenuList = this.enemyMenuList.filter(e => 
      e.x > -margin || e.x < this.viewW + margin || e.y > -margin || e.y < this.viewH + margin
    );
  }

  private updateHud() {
    const hud: HudData = {
      wave: this.wave,
      score: this.score,
      best: this.best,
      hp: this.playerSystem.getHp(),
      maxHp: this.playerSystem.getMaxHp(),
      killed: this.killed,
      total: this.waveTotal,
      enemies: this.enemyList.length,
      comboMult: Math.min(10, 1 + Math.floor(this.combo / 5)),
      time: this.runTime,
      guns: this.playerSystem.getGuns(),
      rateMult: this.playerSystem.getRateMult(),
      rateT: this.playerSystem.getRateT(),
      drones: this.allyDrones.length,
      minerals: this.minerals,
    };
    this.hooks.onHud(hud);
  }

  public togglePause() {
    if (this.state === "menu" || this.state === "over") return;
    this.paused = !this.paused;
    this.hooks.onPause(this.paused);
    this.audio.setSuspended(this.paused);
  }

  // ===== Public methods for App.tsx =====

  setVolumes(vols: { master: number; sfx: number; music: number }): void {
    this.audio.setVolumes(vols);
  }

  setDebugGod(on: boolean): void {
    this.debugGod = on;
  }

  setStartWave(wave: number): void {
    this.startWave = wave;
  }

  fps(): number {
    return Math.round(this.fpsEma);
  }

  toggleDebug(): void {
    this.debugShow = !this.debugShow;
    this.debugToggleTimer = 1;
    console.log(`[DEBUG] Debug overlay: ${this.debugShow ? 'ON' : 'OFF'}`);
  }

  private handleDebugKeys() {
    // Simple key state tracking (no repeat for debug keys)
    if (!this._debugKeys) this._debugKeys = {};
    const keys = this._debugKeys;
    
    // Backtick (`) for debug overlay toggle
    if (this.input.isKey('Backquote')) {
      if (!keys['`']) {
        this.toggleDebug();
        keys['`'] = true;
      }
    } else {
      keys['`'] = false;
    }
    
    // G for god mode
    if (this.input.isKey('KeyG')) {
      if (!keys['G']) {
        this.debugGod = !this.debugGod;
        console.log(`[DEBUG] God mode: ${this.debugGod ? 'ON' : 'OFF'}`);
        keys['G'] = true;
      }
    } else {
      keys['G'] = false;
    }
  }
  
  private _debugKeys: Record<string, boolean> | null = null;

  private renderDebug() {
    if (!this.debugShow) return;
    const ctx = this.renderer.canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.save();
    ctx.resetTransform();
    
    // Background
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.fillRect(0, 0, 280, 320);
    
    // Title
    ctx.fillStyle = '#ff3b52';
    ctx.font = 'bold 14px monospace';
    ctx.fillText('DEBUG OVERLAY [Tab]', 10, 22);
    
    // Game state info
    ctx.fillStyle = '#eaffff';
    ctx.font = '12px monospace';
    let y = 50;
    
    const lines = [
      `state: ${this.state}`,
      `wave: ${this.wave}`,
      `time: ${this.runTime.toFixed(1)}s`,
      `fps: ${this.fps()}`,
      ``,
      `ZONE:`,
      `  active: ${this.zoneOn}`,
      `  radius: ${this.zoneR.toFixed(1)}`,
      `  target: ${this.zoneTarget.toFixed(1)}`,
      `  alpha: ${this.zoneAlpha.toFixed(2)}`,
      ``,
      `SPAWN:`,
      `  countdown: ${this.countdownSystem?.isCountdownActive?.() ? 'YES' : 'NO'}`,
      `  enemies: ${this.enemyList.length}`,
      `  rifts: ${this.riftField?.list?.length ?? 0}`,
      `  total: ${this.waveTotal}`,
      `  killed: ${this.killed}`,
      `  allocated: ${this.allocated}`,
      ``,
      `PLAYER:`,
      `  pos: ${this.playerSystem.getPos().x.toFixed(0)}, ${this.playerSystem.getPos().y.toFixed(0)}`,
      `  hp: ${this.playerSystem.getHp()}/${this.playerSystem.getMaxHp()}`,
      ``,
      `INPUT:`,
      `  axis: ${this.input.axis.x.toFixed(2)}, ${this.input.axis.y.toFixed(2)}`,
      `  mouse: [${this.mouseX}, ${this.mouseY}]`,
      ``,
      `CONTROLS:`,
      `  Tab: toggle debug`,
      `  G: god mode`,
    ];
    
    for (const line of lines) {
      // Color coding
      if (line.includes('YES') || line.includes('ON')) ctx.fillStyle = '#ff5d7e';
      else if (line.includes('NO') || line.includes('OFF')) ctx.fillStyle = '#d8ff3e';
      else if (line.includes('ZONE:') || line.includes('S') || line.includes('PLAYER:') || line.includes('INPUT:') || line.includes('CONTROLS:')) ctx.fillStyle = '#c06bff';
      else ctx.fillStyle = '#eaffff';
      
      ctx.fillText(line, 10, y);
      y += 16;
    }
    
    ctx.restore();
  }

  toMenu(): void {
    if (this.state === "menu") return;
    this.state = "menu";
    this.paused = false;
    this.hooks.onPause(false);
    // Reset menu state
    this.riftField.reset();
    this.enemyMenuList = [];
  }

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }

  startRun() {
    this.state = "playing";
    this.time = 0;
    this.runTime = 0;
    this.score = 0;
    this.killed = 0;
    this.wave = this.startWave;
    this.waveTotal = 0;
    this.allocated = 0;
    this.killedWave = 0;
    this.peakAlive = 0;
    this.combo = 0;
    this.comboT = 0;
    this.clearT = 0;
    this.waveClearSent = false;
    this.edgeOutT = 0;
    this.edgeTickT = 0;
    this.edgeWarned = false;

    // Spawn player at center of screen (not from rift)
    this.playerSystem.reset(0, 0);
    this.enemyList = [];
    this.bullets = [];
    this.enemyBulletList = [];
    this.pickups = [];
    this.allyDrones = [];
    this.mines = [];
    this.mineDropT = -1;
    this.minerals = 0;

    this.zoneOn = false;
    this.zoneX = 0;
    this.zoneY = 0;
    this.zoneR = 0;
    this.zoneTarget = 0;
    this.zoneAlpha = 0;
    this.zoneCollapse = -1;

    this.riftField.reset();
    this.asteroidField.hardReset();
    this.fx.reset();

    this.hooks.onBanner(null);
    this.hooks.onCountdown(null);
    this.hooks.onToast(null);

    // Start countdown immediately
    this.countdownSystem.startWave(this.wave);
    
    setTimeout(() => {
      this.state = "active";
    }, 1000);
  }

  private addScore(n: number) {
    this.score += n;
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number) {
    this.pickups.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null) {
    this.enemySystem.spawn(kind, x, y, parent, this.enemyList);
    this.allocated++;
  }

  private getPlayerPosition(): { x: number; y: number } {
    const state = this.playerSystem.getState();
    return { x: state.x, y: state.y };
  }

  private getZoneBounds(): { x: number; y: number; radius: number; active: boolean } {
    return { x: this.zoneX, y: this.zoneY, radius: this.zoneR, active: this.zoneOn };
  }

  private fireAll(angle: number) {
    this.bulletSystem.firePlayerBullets(this.playerSystem.getState(), angle, this.bullets);
  }

  private enemyFire(e: Enemy) {
    this.bulletSystem.fireEnemyBullet(e, this.enemyBulletList);
  }

  private applyPickup(kind: PickupKind) {
    switch (kind) {
      // Heals
      case "heal25":
        this.playerSystem.heal(25);
        this.audio.pickupHeal();
        break;
      case "heal50":
        this.playerSystem.heal(50);
        this.audio.pickupHeal();
        break;
      case "heal100":
        this.playerSystem.heal(100);
        this.audio.pickupHeal();
        break;
      case "hp":
        this.playerSystem.heal(25);
        this.audio.pickupHeal();
        break;
      // Rate boosts
      case "rate20":
        this.playerSystem.boostRate();
        this.audio.pickupRate();
        break;
      case "rate40":
        this.playerSystem.boostRate();
        this.audio.pickupRate();
        break;
      case "rate60":
        this.playerSystem.boostRate();
        this.audio.pickupRate();
        break;
      case "rate":
        this.playerSystem.boostRate();
        this.audio.pickupRate();
        break;
      // Other
      case "gun":
        this.playerSystem.addGun();
        this.audio.pickupGun();
        break;
      case "drone":
        this.droneSystem.spawn(this.allyDrones, this.getPlayerPosition());
        this.audio.pickupDrone();
        break;
      case "dash":
        this.playerSystem.setDashT(5);
        this.audio.pickupDash();
        break;
      case "miner":
        this.mineDropT = 0;
        this.audio.pickupDash();
        break;
      case "mine":
        this.mineDropT = 0;
        this.audio.pickupDash();
        break;
      case "mineral":
        this.minerals++;
        this.score += 50;
        break;
    }
  }

  private showCountdown(data: { label: string; value: string }) {
    this.countId++;
    this.hooks.onCountdown({ id: this.countId, label: data.label, value: data.value });
    setTimeout(() => this.hooks.onCountdown(null), 1400);
  }

  private checkWaveClear() {
    // Не проверяем завершение если всё ещё спавнятся враги
    if (this.state !== "active") return;
    
    const alive = this.enemyList.filter((e) => !e.dead).length;
    if (alive === 0) {
      // Проверяем что все враги действительно спавнятся (спавновая очередь пуста)
      // и все враги убиты
      const allSpawned = this.allocated >= this.waveTotal;
      const allKilled = this.killedWave >= this.waveTotal;
      
      if (allSpawned && allKilled) {
        this.state = "cleared";
        this.clearT = 0;
        this.waveClearSent = false;
      }
    }
  }

  private updateZoneAndWaves(dt: number) {
    if (this.state !== "active" && this.state !== "cleared") return;

    this.runTime += dt;

    // Zone activates AFTER countdown ends (not during countdown)
    if (!this.zoneOn && !this.countdownSystem.isCountdownActive()) {
      this.zoneOn = true;
      const p = this.playerSystem.getState();
      // Зона начинается вокруг игрока с радиусом 1.5 * размер игрока (10px radius)
      this.zoneX = p.x;
      this.zoneY = p.y;
      this.zoneTarget = Math.max(400, 200 + this.wave * 50);
      this.zoneR = 17.25; // Начальный радиус: 1.5 * 10 * 1.15 (увеличен на 15%)
      this.zoneAlpha = 0;
      this.zoneCollapse = -1;
    }

    // Скорость расширения = ZONE_EXPAND_SPEED (ZONE_EXPAND_SPEED_MULT × PLAYER_MAX_SPEED)
    // Задается в balance.ts — игрок физически не может догнать зону
    const expandSpeed = ZONE_EXPAND_SPEED;
    
    // Зона расширяется ТОЛЬКО когда отсчёт завершён
    if (this.zoneR < this.zoneTarget && !this.countdownSystem.isCountdownActive()) {
      this.zoneR = Math.min(this.zoneTarget, this.zoneR + expandSpeed * dt);
      this.zoneAlpha = Math.min(0.5, this.zoneAlpha + dt * 1.2);
    } else if (this.state === "cleared") {
      this.clearT += dt;
      if (this.clearT >= 1.5 && !this.waveClearSent) {
        this.waveClearSent = true;
        this.hooks.onBanner({
          title: t("game.waveClear"),
          sub: t("game.nextWave", { wave: this.wave + 1 }),
          color: "#6f6",
        });
        setTimeout(() => this.hooks.onBanner(null), 2000);
      }
      // Плавно увеличиваем зону и уменьшаем альфу перед исчезновением
      if (this.clearT >= 2) {
        const expandDuration = 1.0; // 1 секунда на расширение
        const expandProgress = clamp((this.clearT - 2) / expandDuration, 0, 1);
        const eased = easeOutCubic(expandProgress);
        // Зона расширяется в 1.5 раза
        this.zoneR = this.zoneTarget * (1 + 0.5 * eased);
        // Альфа уменьшается от 0.5 до 0
        this.zoneAlpha = 0.5 * (1 - eased);
      }
      // Переход к следующей волне только после полного исчезновения зоны
      if (this.clearT >= 3) {
        this.wave++;
        this.killedWave = 0;
        this.allocated = 0;
        this.clearT = 0;
        this.state = "active";
        // Сброс зоны — она начнёт раскрываться ПОСЛЕ отсчёта
        this.zoneOn = false; // <-- Сбрасываем zoneOn чтобы активация прошла снова
        this.countdownSystem.startWave(this.wave);
      }
    }
    
    // Apply zone boundary constraints
    this.applyZoneConstraints(dt);
  }
  
  // Zone boundary enforcement - keep enemies inside, asteroids outside
  private applyZoneConstraints(dt: number) {
    if (!this.zoneOn || this.zoneR <= 0) return;
    
    const zoneRadius = this.zoneR;
    const zoneCenterX = this.zoneX;
    const zoneCenterY = this.zoneY;
    
    // Constrain asteroids - keep them outside the zone
    for (const asteroid of (this.asteroidField as any).list || []) {
      const dx = asteroid.x - zoneCenterX;
      const dy = asteroid.y - zoneCenterY;
      const dist = Math.hypot(dx, dy);
      
      // If asteroid is inside zone boundary, push it out strongly
      if (dist < zoneRadius - asteroid.r * 0.5) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const pushForce = (zoneRadius - asteroid.r * 0.5 - dist) * 15;
        asteroid.vx += (dx * pushDir) * pushForce;
        asteroid.vy += (dy * pushDir) * pushForce;
      }
    }
    
    // Constrain enemies - keep them inside the zone
    for (const enemy of this.enemyList) {
      if (enemy.dead) continue;
      const dx = enemy.x - zoneCenterX;
      const dy = enemy.y - zoneCenterY;
      const dist = Math.hypot(dx, dy);
      const enemyR = enemy.r || 15;
      
      // If enemy is outside zone boundary, push it back inside
      // Используем мягкую силу отталкивания, чтобы не вызывать колебания скорости/угла
      if (dist > zoneRadius - enemyR) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const penetration = dist - (zoneRadius - enemyR);
        // Снижен коэффициент с 20 до 8 для плавности
        const pushForce = Math.min(penetration * 8, 200);
        enemy.vx -= (dx * pushDir) * pushForce * dt;
        enemy.vy -= (dy * pushDir) * pushForce * dt;
      }
    }
  }

  private updateEdgeDanger(dt: number) {
    if (!this.zoneOn) return;

    const p = this.playerSystem.getState();
    const dx = p.x - this.zoneX;
    const dy = p.y - this.zoneY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const margin = 40;

    // Не наносим урон пока зона не раскрылась хотя бы наполовину
    if (this.zoneR < this.zoneTarget * 0.3) return;
    
    if (dist > this.zoneR - margin) {
      this.edgeOutT += dt;
      this.edgeTickT += dt;
      if (!this.edgeWarned && this.edgeOutT > 0.3) {
        this.edgeWarned = true;
        this.hooks.onToast({ text: t("game.zoneWarning"), color: "#fa5" });
        setTimeout(() => this.hooks.onToast(null), 1500);
      }
      if (this.edgeTickT > 0.5) {
        this.edgeTickT = 0;
        this.playerSystem.hit(10);
        this.fx.shake(4, 0.2);
      }
    } else {
      this.edgeOutT = 0;
      this.edgeTickT = 0;
      this.edgeWarned = false;
    }
  }
  
  /** Авто-стрельба по ближайшему врагу в зоне поражения пушек игрока */
  private handleAutoFire(dt: number): void {
    const playerPos = this.playerSystem.getPosition();
    const playerAngle = this.playerSystem.getAngle();
    const gunRange = 420; // Дистанция поражения пушек
    
    // Находим ближайшего врага в зоне поражения
    let nearestEnemy: { x: number; y: number; dist: number } | null = null;
    let nearestDist = gunRange;
    
    for (const e of this.enemyList) {
      if (e.dead) continue;
      const dx = e.x - playerPos.x;
      const dy = e.y - playerPos.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestEnemy = { x: e.x, y: e.y, dist };
      }
    }
    
    // Если есть враг в зоне поражения, стреляем автоматически
    if (nearestEnemy) {
      const targetAngle = Math.atan2(nearestEnemy.y - playerPos.y, nearestEnemy.x - playerPos.x);
      this.playerSystem.setAim(targetAngle);
      this.playerSystem.setIsFiring(true);
    } else if (!this.mouseDown) {
      // Если нет врагов и игрок не нажал кнопку мыши, прекращаем стрельбу
      this.playerSystem.setIsFiring(false);
    }
  }
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}