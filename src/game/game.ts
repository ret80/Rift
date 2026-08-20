/**
 * Game - чистый оркестратор игровых систем.
 * Координирует работу модульных систем через EventBus и GameState.
 * Не содержит бизнес-логики - вся логика вынесена в системы.
 */

import { t } from "../i18n";
import { AudioEngine } from "./audio";
import {
  PickupKind,
  waveTotalFor,
  ZONE_EXPAND_SPEED,
  massForRadius,
  type EnemyKind,
  // Zone constants
  ZONE_INITIAL_RADIUS,
  ZONE_EDGE_MARGIN,
  ZONE_EDGE_WARNING_DELAY,
  ZONE_EDGE_DAMAGE_INTERVAL,
  ZONE_EDGE_DAMAGE_AMOUNT,
  ZONE_EDGE_SHAKE_STRENGTH,
  ZONE_EARLY_DAMAGE_THRESHOLD,
  ZONE_CLEAR_BANNER_DELAY,
  ZONE_CLEAR_EXPAND_START,
  ZONE_CLEAR_NEXT_WAVE,
  ZONE_CLEAR_EXPAND_DURATION,
  ZONE_CLEAR_EXPAND_MULTIPLIER,
  ZONE_ASTEROID_PUSH_FORCE,
  ZONE_ENEMY_PUSH_FORCE_COEFF,
  ZONE_ENEMY_PUSH_FORCE_MAX,
  ZONE_GUN_RANGE,
  // Death animation
  DEATH_ANIMATION_DURATION,
  DEATH_EXPLOSION_PARTICLES,
  DEATH_EXPLOSION_MIN_SPEED,
  DEATH_EXPLOSION_MAX_SPEED,
  DEATH_EXPLOSION_MIN_LIFE,
  DEATH_EXPLOSION_MAX_LIFE,
  // Menu animation
  MENU_ASTEROID_COUNT,
  MENU_RIFT_OPEN_TIME,
  MENU_RIFT_SPAWN_DELAY,
  MENU_RIFT_SPAWN_TIME,
  MENU_RIFT_CLOSE_TIME,
  MENU_RIFT_MIN_INTERVAL,
  MENU_RIFT_MAX_INTERVAL,
  MENU_ENEMY_MIN_SPEED,
  MENU_ENEMY_MAX_SPEED,
  MENU_EDGE_MARGIN as MENU_EDGE_MARGIN_PX,
  // Camera
  CAMERA_SMOOTHING,
  // FPS
  FPS_SMOOTHING_FACTOR,
} from "./balance";
import { clamp, easeOutCubic } from "./math";
import { Renderer } from "./render";

/* Core systems */
import { Camera } from "./core/Camera";
import { EventBus } from "./core/EventBus";
import { GameState } from "./core/GameState";

/* Wave & zone management */
import { WaveManager } from "./wave/WaveManager";
import { ZoneManager } from "./wave/ZoneManager";

/* Subsystems */
import { AsteroidField } from "./asteroids";
import { Fx } from "./fx";
import { InputManager } from "./input";
import { RiftField } from "./rifts";
import { Starfield } from "./starfield";

/* Entity types */
import type { AllyDrone, Bullet, EBullet, Enemy, Mine, Pickup } from "./types";

/* Game systems */
import { BulletSystem } from "./systems/BulletSystem";
import { CollisionSystem } from "./systems/CollisionSystem";
import { CountdownSystem } from "./systems/CountdownSystem";
import { DroneSystem } from "./systems/DroneSystem";
import { EnemySystem } from "./systems/EnemySystem";
import { MineSystem } from "./systems/MineSystem";
import { PickupSystem } from "./systems/PickupSystem";
import { PlayerSystem } from "./systems/PlayerSystem";
import { RendererSystem } from "./systems/RendererSystem";
import { SpawnSystem } from "./systems/SpawnSystem";

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
  onGameOver: () => void;
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

  /* Menu rift & enemy animation */
  private menuRifts: Array<{
    x: number; y: number; t: number; state: "opening" | "spawning" | "closing";
    queue: EnemyKind[]; timer: number; seed: number; rot: number; size: number;
    nextSpawnT: number;
  }> = [];
  private menuEnemies: Array<{
    x: number; y: number; vx: number; vy: number;
    kind: EnemyKind; angle: number; seed: number;
  }> = [];
  private menuNextRiftTimer = 0;
  private _menuAstSpawned = false;

  private state: "menu" | "playing" | "active" | "cleared" | "dying" | "over" = "menu";
  private paused = false;
  private deathTimer = 0;

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
  private waveManager: WaveManager;
  private zoneManager: ZoneManager;
  
  // Wave tracking (used by SpawnSystem)
  private wave = 1;
  private waveTotal = 0;
  private allocated = 0;
  private killedWave = 0;
  private peakAlive = 0;

  private clearT = 0;
  private waveClearSent = false;
  
  // Edge danger tracking
  private edgeOutT = 0;
  private edgeTickT = 0;
  private edgeWarned = false;

  /* Scoring */
  private score = 0;
  private best = 0;
  private killed = 0;
  private combo = 0;
  private comboT = 0;
  private runTime = 0;

  private popupId = 0;
  private countId = 0;

  /* Camera - управляет миром и преобразованиями координат */
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private camera = new Camera();

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
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.camera.resize(w, h, Math.min(window.devicePixelRatio || 1, 1.75));
  };
  
  private updateAimAngle() {
    // Convert mouse screen position to world position
    const worldX = this.camX + (this.mouseX - window.innerWidth / 2) / this.zoom;
    const worldY = this.camY + (this.mouseY - window.innerHeight / 2) / this.zoom;
    
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

    /* Initialize wave & zone managers */
    this.waveManager = new WaveManager(this.eventBus, this.gameState);
    this.zoneManager = new ZoneManager({
      eventBus: this.eventBus,
      state: this.gameState,
    });

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
      (data: any) => this.enemyFire(data),
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
      if (rdt > 0) this.fpsEma = this.fpsEma * (1 - FPS_SMOOTHING_FACTOR) + (1 / rdt) * FPS_SMOOTHING_FACTOR;
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
    // Бridge: CollisionSystem.publish('player_hit') → playerSystem.hit()
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
        const waveData = event.payload as { wave: number };
        this.wave = waveData.wave;
        this.waveTotal = waveTotalFor(this.wave);
        this.allocated = 0;
        this.killedWave = 0;
      }
    });

    this.eventBus.on("zone_update", (event) => {
      const data = event.payload as { x: number; y: number; radius: number; targetRadius: number; alpha: number; active: boolean };
      const { x, y, radius, targetRadius, alpha, active } = data;
      this.gameState.zone.x = x;
      this.gameState.zone.y = y;
      this.gameState.zone.radius = radius;
      this.gameState.zone.targetRadius = targetRadius;
      this.gameState.zone.alpha = alpha;
      this.gameState.zone.active = active;
    });

    this.eventBus.on("spawn_enemy", (event) => {
      // Событие spawn_enemy публикуется из EnemySystem.spawn(),
      // который уже вызывается напрямую из Game.spawnEnemy().
      // Ничего не делаем чтобы избежать двойного спавна.
    });

    this.eventBus.on("carrierSpawnDrone", (event) => {
      const data = event.payload as { x: number; y: number; parent: Enemy | null };
      const { x, y, parent } = data;
      this.spawnEnemy("drone", x, y, parent);
    });

    this.eventBus.on("fire_bullet", (event) => {
      const data = event.payload as { x: number; y: number; vx: number; vy: number; life: number; dmg: number; isEnemy: boolean };
      const { x, y, vx, vy, life, dmg, isEnemy } = data;
      if (isEnemy) {
        this.enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy: false, cruiser: false });
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
      this.gameState.zone.x = x;
      this.gameState.zone.y = y;
      this.gameState.zone.radius = radius;
      this.gameState.zone.targetRadius = targetRadius;
      this.gameState.zone.alpha = alpha;
      this.gameState.zone.active = active;
    });

    this.eventBus.on("asteroid_hit", (event) => {
      const data = event.payload as { index: number; dmg: number; vx: number; vy: number; x: number; y: number };
      const { index, dmg, x, y } = data;
      // Delegate damage/destruction to asteroidField
      this.asteroidField.damageAt(index, dmg, x ?? 0, y ?? 0);
    });

    this.eventBus.on("game_over", (event) => {
      // Prevent double-trigger if already dying or over
      if (this.state === "dying" || this.state === "over") return;
      this.state = "dying";
      this.deathTimer = DEATH_ANIMATION_DURATION;
      // Clear all enemy bullets to prevent "orphan bullets" on restart
      // Use .length = 0 to clear in-place (EnemySystem.update() holds reference to these arrays)
      this.enemyBulletList.length = 0;
      this.bullets.length = 0;
      // Spawn death explosion particles
      const pos = this.getPlayerPosition();
      for (let i = 0; i < DEATH_EXPLOSION_PARTICLES; i++) {
        const angle = Math.random() * Math.PI * 2;
        const speed = DEATH_EXPLOSION_MIN_SPEED + Math.random() * (DEATH_EXPLOSION_MAX_SPEED - DEATH_EXPLOSION_MIN_SPEED);
        this.fx.emit({
          x: pos.x,
          y: pos.y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: DEATH_EXPLOSION_MIN_LIFE + Math.random() * (DEATH_EXPLOSION_MAX_LIFE - DEATH_EXPLOSION_MIN_LIFE),
          maxLife: DEATH_EXPLOSION_MAX_LIFE,
          c: Math.random() > 0.5 ? [1, 0.3, 0.1, 1] : [1, 0.8, 0.2, 1],
          size: 1 + Math.random() * 3,
        });
      }
      this.audio.explode();
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
    // Remove mouse-based aiming - auto-aim handles targeting via handleAutoFire
    this.playerSystem.update(dtScaled, (this.state as string) !== "menu" && this.state !== "over" && this.state !== "dying");
    
    // Handle dying → over transition
    if (this.state === "dying") {
      this.deathTimer -= dtScaled;
      if (this.deathTimer <= 0) {
        this.state = "over";
        const best = this.best;
        const isNewBest = this.score > best;
        this.hooks.onStats({
          score: this.score,
          best: Math.max(best, this.score),
          isBest: isNewBest,
          wave: this.wave,
          kills: this.killed,
          time: this.runTime,
        });
      }
    }
    
    // Жёсткий барьер зоны: отталкивает игрока обратно, если он вышел за границу
    if (this.gameState.zone.active && this.gameState.zone.radius > 0) {
      this.playerSystem.clampPlayerToZone(
        this.gameState.zone.x,
        this.gameState.zone.y,
        this.gameState.zone.radius,
        this.gameState.zone.active,
        0
      );
    }
    // Stop enemies and bullets during dying/over (prevent orphan bullets)
    const isDead = this.state === "dying" || this.state === "over";
    if (!isDead) {
      this.enemySystem.clampEnemiesToZone(
        this.gameState.zone.x,
        this.gameState.zone.y,
        this.gameState.zone.radius,
        this.gameState.zone.active
      );
      this.enemySystem.update(dtScaled, this.enemyList, this.getPlayerPosition(), this.enemyBulletList);
      this.bulletSystem.update(dtScaled, this.bullets, this.enemyBulletList, this.enemyList);
      this.mineSystem.update(dtScaled, this.mines);
      this.droneSystem.update(dtScaled, this.allyDrones, this.enemyList);
    }
    const playerState = this.playerSystem.getState();
    // Get asteroids from asteroid field for collision
    const asteroids = ((this.asteroidField as any).list || []) as Array<{ x: number; y: number; r: number; vx: number; vy: number; mass: number; kind: string }>;
    if (!isDead) {
      this.collisionSystem.update(
        dtScaled,
        { x: playerState.x, y: playerState.y, r: 16, hp: playerState.hp, invuln: playerState.invuln, mass: playerState.mass || 1, vx: playerState.vx || 0, vy: playerState.vy || 0 },
        this.enemyList as any,
        this.bullets as any,
        this.enemyBulletList as any,
        this.pickups as any,
        this.mines as any,
        this.allyDrones as any,
        asteroids as any
      );
      this.pickupSystem.update(dtScaled, this.pickups);
      this.spawnSystem.update(dtScaled, this.wave, this.allocated, this.killedWave, this);
    }
    this.riftField.update(dtScaled);
    this.fx.update(dtScaled, dtScaled); // Обновляем частицы и тряску экрана
    
    // Stop zone damage and autofire when dying or dead
    if (this.state !== "dying" && this.state !== "over") {
      this.updateZoneAndWaves(dtScaled);
      this.updateEdgeDanger(dtScaled);
      
      // Авто-стрельба по ближайшему врагу в зоне поражения
      if (this.state === "playing" || this.state === "active") {
        this.handleAutoFire(dtScaled);
      }
    } else {
      // Still render zone effects but don't damage player
      this.updateZoneAndWaves(dtScaled);
    }
    
    // Update asteroid field with camera and zone info
    this.asteroidField.update(dtScaled, {
      camX: this.camX,
      camY: this.camY,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      zone: this.gameState.zone.active ? { x: this.gameState.zone.x, y: this.gameState.zone.y, r: this.gameState.zone.radius } : null,
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
    this.camX += (targetCamX - this.camX) * Math.min(1, CAMERA_SMOOTHING * FPS_SMOOTHING_FACTOR);
    this.camY += (targetCamY - this.camY) * Math.min(1, CAMERA_SMOOTHING * FPS_SMOOTHING_FACTOR);
    
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
        active: this.gameState.zone.active,
        x: this.gameState.zone.x,
        y: this.gameState.zone.y,
        radius: this.gameState.zone.radius,
        targetRadius: this.gameState.zone.targetRadius,
        alpha: this.gameState.zone.alpha,
      },
      this.camX,
      this.camY,
      this.zoom,
      window.innerWidth,
      window.innerHeight
    );
  }

  private updateMenu(dt: number) {
    this.starfield.update(dt, 0, 0, 1, 0, window.innerWidth, window.innerHeight);
    this.asteroidField.update(dt, {
      camX: 0,
      camY: 0,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      zone: null,
    } as any);
    
    // Ensure initial asteroids are spawned near the menu screen center
    if (this.asteroidField.list.length < MENU_ASTEROID_COUNT && this.state === "menu") {
      this.ensureMenuAsteroids();
    }
    
    this.fx.update(dt, dt); // Обновляем частицы и тряску экрана
    
    this.updateMenuRifts(dt);
    this.updateMenuEnemies(dt);
    
    this.rendererSystem.renderMenu(
      this.renderer,
      this.starfield,
      this.asteroidField,
      this.riftField,
      this.menuRifts,
      this.menuEnemies,
      window.innerWidth,
      window.innerHeight
    );
  }

  /* ===== Menu rift & enemy animation ===== */

  private updateMenuRifts(dt: number) {
    // Только один разлом одновременно — ждём пока полностью закроется
    if (this.menuRifts.length === 0) {
      this.menuNextRiftTimer -= dt;
      if (this.menuNextRiftTimer <= 0) {
        // Spawn a new rift at random position
        // Рендерер использует WebGL координаты: центр (0,0), правый край = webGLWidth/2
        const dpr = this.camera.dpr;
        const margin = 120;
        const w = this.camera.webGLWidth;
        const h = this.camera.webGLHeight;
        const x = -w / 2 + margin * dpr + Math.random() * (w - margin * 2 * dpr);
        const y = -h / 2 + margin * dpr + Math.random() * (h - margin * 2 * dpr);
        const count = 1 + Math.floor(Math.random() * 3); // 1-3 ships
        const kinds: EnemyKind[] = [];
        for (let i = 0; i < count; i++) {
          kinds.push("drone");
        }
        this.menuRifts.push({
          x, y,
          t: 0,
          state: "opening",
          queue: kinds,
          timer: 0.8,
          seed: Math.random() * 100,
          rot: Math.random() * Math.PI * 2,
          size: (40 + Math.random() * 20) * dpr,
          nextSpawnT: MENU_RIFT_MIN_INTERVAL + Math.random() * (MENU_RIFT_MAX_INTERVAL - MENU_RIFT_MIN_INTERVAL), // 8-14 seconds
        });
        // Следующий разлом только через 8-14 секунд после этого
        this.menuNextRiftTimer = MENU_RIFT_MIN_INTERVAL + Math.random() * (MENU_RIFT_MAX_INTERVAL - MENU_RIFT_MIN_INTERVAL);
      }
    }

    // Update rifts (no sound)
    for (let i = this.menuRifts.length - 1; i >= 0; i--) {
      const rf = this.menuRifts[i];
      rf.t += dt;
      if (rf.state === "opening") {
        if (rf.t >= MENU_RIFT_OPEN_TIME) {
          rf.state = "spawning";
          rf.timer = MENU_RIFT_SPAWN_DELAY;
        }
      } else if (rf.state === "spawning") {
        rf.timer -= dt;
        if (rf.timer <= 0 && rf.queue.length > 0) {
          rf.timer = MENU_RIFT_SPAWN_TIME;
          const kind = rf.queue.shift()!;
          // Spawn enemy flying away from rift
          this.spawnMenuEnemy(kind, rf.x, rf.y);
        }
        // Only close if queue is truly empty and timer has expired
        if (rf.queue.length === 0 && rf.timer <= 0) {
          rf.state = "closing";
          rf.t = 0;
        }
      } else if (rf.state === "closing") {
        if (rf.t >= MENU_RIFT_CLOSE_TIME) {
          this.menuRifts.splice(i, 1);
        }
      }
    }
  }

  private spawnMenuEnemy(kind: EnemyKind, x: number, y: number) {
    // Enemy flies away from screen center (toward nearest edge)
    const dpr = this.camera.dpr;
    const cx = 0; // screen center = world (0,0)
    const cy = 0;
    let dx = x - cx;
    let dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) {
      dx = 1; dy = 0;
    } else {
      dx /= len; dy /= len;
    }
    const speed = (MENU_ENEMY_MIN_SPEED + Math.random() * MENU_ENEMY_MAX_SPEED) * dpr;
    const angle = Math.atan2(dy, dx);
    this.menuEnemies.push({
      x: x + dx * 30,
      y: y + dy * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      kind,
      angle,
      seed: Math.random() * 100,
    });
  }

  private updateMenuEnemies(dt: number) {
    const dpr = this.camera.dpr;
    const w = this.camera.webGLWidth;
    const h = this.camera.webGLHeight;
    const margin = MENU_EDGE_MARGIN_PX * dpr;
    
    for (const e of this.menuEnemies) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    // Remove enemies that are off screen (in WebGL coordinates)
    this.menuEnemies = this.menuEnemies.filter(e =>
      e.x > -w / 2 - margin && e.x < w / 2 + margin &&
      e.y > -h / 2 - margin && e.y < h / 2 + margin
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
    
    // R or Enter or Space to restart from "over" state
    if (this.state === "over") {
      const restartKey = this.input.isKey('KeyR') || this.input.isKey('Enter') || this.input.isKey('Space');
      if (restartKey && !keys['restart']) {
        this.startRun();
        keys['restart'] = true;
      }
    } else {
      keys['restart'] = false;
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
      `  active: ${this.gameState.zone.active}`,
      `  radius: ${this.gameState.zone.radius.toFixed(1)}`,
      `  target: ${this.gameState.zone.targetRadius.toFixed(1)}`,
      `  alpha: ${this.gameState.zone.alpha.toFixed(2)}`,
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
      `  pos: ${this.playerSystem.getPosition().x.toFixed(0)}, ${this.playerSystem.getPosition().y.toFixed(0)}`,
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
    this.menuRifts = [];
    this.menuEnemies = [];
    this.menuNextRiftTimer = 2 + Math.random() * 3; // First rift appears quickly
    this._menuAstSpawned = false;
    this.asteroidField.reset();
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
    this.playerSystem.reset();
    this.enemyList.length = 0;
    this.bullets.length = 0;
    this.enemyBulletList.length = 0;
    this.pickups.length = 0;
    this.allyDrones.length = 0;
    this.mines.length = 0;
    this.mineDropT = -1;
    this.minerals = 0;
    
    // Reset spawn and enemy system state for new game
    this.spawnSystem.clearAnnounced();
    this.enemySystem.reset();

    // Reset zone state
    this.gameState.zone.active = false;
    this.gameState.zone.x = 0;
    this.gameState.zone.y = 0;
    this.gameState.zone.radius = 0;
    this.gameState.zone.targetRadius = 0;
    this.gameState.zone.alpha = 0;
    this.gameState.zone.collapseT = -1;

    this.riftField.reset();
    this.asteroidField.hardReset();
    this.fx.reset();
    // Reset menu asteroid spawn flag for next time we return to menu
    this._menuAstSpawned = false;
    this.asteroidField.list.length = 0;

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
    return {
      x: this.gameState.zone.x,
      y: this.gameState.zone.y,
      radius: this.gameState.zone.radius,
      active: this.gameState.zone.active,
    };
  }

  private fireAll(angle: number) {
    this.bulletSystem.firePlayerBullets(this.playerSystem.getState(), angle, this.bullets);
  }

  private enemyFire(data: { x: number; y: number; angle: number; boltDmg: number; cruiser: boolean; heavy: boolean }) {
    const heavy = data.cruiser || data.heavy;
    const speed = data.cruiser ? 260 : 300;
    const life = data.cruiser ? 1.8 : 1.35;
    this.enemyBulletList.push({
      x: data.x + Math.cos(data.angle) * 14,
      y: data.y + Math.sin(data.angle) * 14,
      vx: Math.cos(data.angle) * speed,
      vy: Math.sin(data.angle) * speed,
      life,
      dmg: data.boltDmg,
      heavy,
      cruiser: data.cruiser,
    });
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
    if (!this.gameState.zone.active && !this.countdownSystem.isCountdownActive()) {
      // Initialize zone for this wave
      const p = this.playerSystem.getState();
      this.gameState.zone.x = p.x;
      this.gameState.zone.y = p.y;
      this.gameState.zone.targetRadius = Math.max(400, 200 + this.wave * 50);
      this.gameState.zone.radius = ZONE_INITIAL_RADIUS;
      this.gameState.zone.alpha = 0;
      this.gameState.zone.collapseT = -1;
      this.gameState.zone.active = true;
    }

    // Скорость расширения = ZONE_EXPAND_SPEED (ZONE_EXPAND_SPEED_MULT × PLAYER_MAX_SPEED)
    // Задается в balance.ts — игрок физически не может догнать зону
    const expandSpeed = ZONE_EXPAND_SPEED;
    
    // Зона расширяется ТОЛЬКО когда отсчёт завершён
    if (this.gameState.zone.radius < this.gameState.zone.targetRadius && !this.countdownSystem.isCountdownActive()) {
      this.gameState.zone.radius = Math.min(
        this.gameState.zone.targetRadius,
        this.gameState.zone.radius + expandSpeed * dt
      );
      this.gameState.zone.alpha = Math.min(0.5, this.gameState.zone.alpha + dt * 1.2);
    } else if (this.state === "cleared") {
      this.clearT += dt;
      if (this.clearT >= ZONE_CLEAR_BANNER_DELAY && !this.waveClearSent) {
        this.waveClearSent = true;
        this.hooks.onBanner({
          title: t("game.waveClear"),
          sub: t("game.nextWave", { wave: this.wave + 1 }),
          color: "#6f6",
        });
        setTimeout(() => this.hooks.onBanner(null), 2000);
      }
      // Плавно увеличиваем зону и уменьшаем альфа перед исчезновением
      if (this.clearT >= ZONE_CLEAR_EXPAND_START) {
        const expandProgress = clamp((this.clearT - ZONE_CLEAR_EXPAND_START) / ZONE_CLEAR_EXPAND_DURATION, 0, 1);
        const eased = easeOutCubic(expandProgress);
        // Зона расширяется в 1.5 раза
        this.gameState.zone.radius = this.gameState.zone.targetRadius * (1 + ZONE_CLEAR_EXPAND_MULTIPLIER * eased);
        // Альфа уменьшается от 0.5 до 0
        this.gameState.zone.alpha = 0.5 * (1 - eased);
      }
      // Переход к следующей волне только после полного исчезновения зоны
      if (this.clearT >= ZONE_CLEAR_NEXT_WAVE) {
        this.wave++;
        this.killedWave = 0;
        this.allocated = 0;
        this.clearT = 0;
        this.state = "active";
        // Сброс зоны — она начнёт раскрываться ПОСЛЕ отсчёта
        this.gameState.zone.active = false;
        this.countdownSystem.startWave(this.wave);
      }
    }
    
    // Apply zone boundary constraints
    this.applyZoneConstraints(dt);
  }

  // Zone boundary enforcement - keep enemies inside, asteroids outside
  private applyZoneConstraints(dt: number) {
    if (!this.gameState.zone.active || this.gameState.zone.radius <= 0) return;
    
    const zoneRadius = this.gameState.zone.radius;
    const zoneCenterX = this.gameState.zone.x;
    const zoneCenterY = this.gameState.zone.y;
    
    // Constrain asteroids - keep them outside the zone
    for (const asteroid of (this.asteroidField as any).list || []) {
      const dx = asteroid.x - zoneCenterX;
      const dy = asteroid.y - zoneCenterY;
      const dist = Math.hypot(dx, dy);
      
      // If asteroid is inside zone boundary, push it out strongly
      if (dist < zoneRadius - asteroid.r * 0.5) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const pushForce = (zoneRadius - asteroid.r * 0.5 - dist) * ZONE_ASTEROID_PUSH_FORCE;
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
        const pushForce = Math.min(penetration * ZONE_ENEMY_PUSH_FORCE_COEFF, ZONE_ENEMY_PUSH_FORCE_MAX);
        enemy.vx -= (dx * pushDir) * pushForce * dt;
        enemy.vy -= (dy * pushDir) * pushForce * dt;
      }
    }
  }

  private updateEdgeDanger(dt: number) {
    if (!this.gameState.zone.active) return;

    const p = this.playerSystem.getState();
    const dx = p.x - this.gameState.zone.x;
    const dy = p.y - this.gameState.zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    // Не наносим урон пока зона не раскрылась хотя бы наполовину
    if (this.gameState.zone.radius < this.gameState.zone.targetRadius * ZONE_EARLY_DAMAGE_THRESHOLD) return;
    
    if (dist > this.gameState.zone.radius - ZONE_EDGE_MARGIN) {
      this.edgeOutT += dt;
      this.edgeTickT += dt;
      if (!this.edgeWarned && this.edgeOutT > ZONE_EDGE_WARNING_DELAY) {
        this.edgeWarned = true;
        this.hooks.onToast({ text: t("game.zoneWarning"), color: "#fa5" });
        setTimeout(() => this.hooks.onToast(null), 1500);
      }
      if (this.edgeTickT > ZONE_EDGE_DAMAGE_INTERVAL) {
        this.edgeTickT = 0;
        this.playerSystem.hit(ZONE_EDGE_DAMAGE_AMOUNT);
        this.fx.shake(ZONE_EDGE_SHAKE_STRENGTH, 0.2);
      }
    } else {
      this.edgeOutT = 0;
      this.edgeTickT = 0;
      this.edgeWarned = false;
    }
  }
  
  /** Spawn initial asteroids around the menu screen center with proper physics */
  private ensureMenuAsteroids(): void {
    if (this._menuAstSpawned) return;
    this._menuAstSpawned = true;
    
    // Create asteroids around the menu screen center with proper physics
    const count = MENU_ASTEROID_COUNT;
    const rng = (Math.random() * 200000) | 0;
    const mulberry = (seed: number) => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
    
    for (let i = 0; i < count; i++) {
      const angle = mulberry(i * 7 + rng) * Math.PI * 2;
      const dist = 100 + mulberry(i * 13 + rng) * 500;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      
      // Random velocity - move across the screen
      const speed = 20 + mulberry(i * 17 + rng) * 80;
      const vAngle = mulberry(i * 23 + rng) * Math.PI * 2;
      const vx = Math.cos(vAngle) * speed;
      const vy = Math.sin(vAngle) * speed;
      
      // Random size - mix of all types
      const kindRoll = mulberry(i * 31 + rng);
      let kind: 'small' | 'medium' | 'large' = 'small';
      if (kindRoll < 0.2) kind = 'large';
      else if (kindRoll < 0.5) kind = 'medium';
      
      // Create asteroid directly in the list with all properties
      const r = kind === 'large' ? 30 + mulberry(i * 37 + rng) * 10 :
                kind === 'medium' ? 17 + mulberry(i * 41 + rng) * 6 :
                                   8 + mulberry(i * 43 + rng) * 4;
      const verts: number[] = [];
      const n = 9 + Math.floor(mulberry(i * 47 + rng) * 3);
      for (let j = 0; j < n; j++) verts.push(0.72 + mulberry(i * 53 + rng + j) * 0.3);
      
      const hp = kind === 'large' ? 140 : kind === 'medium' ? 60 : 22;
      
      this.asteroidField.list.push({
        id: `menu-${i}`,
        kind,
        x,
        y,
        vx,
        vy,
        r,
        angle: mulberry(i * 59 + rng) * Math.PI * 2,
        spin: (mulberry(i * 61 + rng) - 0.5) * 0.8,
        verts,
        hp,
        maxHp: hp,
        mass: massForRadius(r),
      });
    }
  }
  
  /** Авто-стрельба по ближайшему врагу в зоне поражения пушек игрока */
  private handleAutoFire(dt: number): void {
    const playerPos = this.playerSystem.getPosition();
    const playerAngle = this.playerSystem.getAngle();
    const gunRange = ZONE_GUN_RANGE; // Дистанция поражения пушек
    
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