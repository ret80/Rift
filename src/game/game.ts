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
  massForRadius,
  PLAYER_MAX_SPEED,
  EnemyKind,
} from "./balance";
import {
  loadUpgrades,
  saveUpgrades,
  applyUpgrades,
  defaultUpgrades,
  UPGRADE_TIERS,
  type PlayerUpgrades,
  type AppliedUpgrades,
} from "./upgrades";

import { CRUISER_BULLET_SPEED } from "./balance";

import {
  // Missile
  MISSILE_DURATION,
  MISSILE_LAUNCH_INTERVAL,
  MISSILE_TURN_RATE,
  // Death animation
  DEATH_ANIMATION_DURATION,
  DEATH_EXPLOSION_PARTICLES,
  DEATH_EXPLOSION_MIN_SPEED,
  DEATH_EXPLOSION_MAX_SPEED,
  DEATH_EXPLOSION_MIN_LIFE,
  DEATH_EXPLOSION_MAX_LIFE,
  // Camera
  CAMERA_SMOOTHING,
  // FPS
  FPS_SMOOTHING_FACTOR,
  // Zone gun range (still used by Game for autofire)
  ZONE_GUN_RANGE,
} from "./balance";
import { clamp } from "./math";
import { Renderer } from "./render";
import { MenuScene } from "./systems/MenuScene";
import { ScoringSystem } from "./systems/ScoringSystem";

/* Core systems */
import { Camera } from "./core/Camera";
import { EventBus } from "./core/EventBus";
import { GameState } from "./core/GameState";
import { GameStateMachine } from "./core/StateMachine";

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
import { WaveOrchestrator } from "./systems/WaveOrchestrator";

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
  parts: number;
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

  /* Menu animation */
  private menuScene: MenuScene;

  private paused = false;
  private deathTimer = 0;

  /* FSM */
  private fsm: ReturnType<typeof createGameFSM>;

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
  private waveOrchestrator: WaveOrchestrator;

  /* Scoring */
  private scoringSystem: ScoringSystem;

  // Wave tracking (used by SpawnSystem)
  private wave = 1;
  private waveTotal = 0;
  private allocated = 0;
  private killedWave = 0;
  private peakAlive = 0;

  /* Persistent upgrades */
  private playerUpgrades: PlayerUpgrades = defaultUpgrades();
  private appliedUpgrades: AppliedUpgrades | null = null;

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
    this.scoringSystem = new ScoringSystem();
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

    /* Initialize wave orchestrator */
    this.waveOrchestrator = new WaveOrchestrator({
      hooks: {
        onBanner: (title, sub, color) => {
          this.hooks.onBanner({ title, sub, color });
        },
        onToast: (text, color) => {
          this.hooks.onToast({ text, color });
        },
        hitPlayer: (amount) => {
          this.playerSystem.hit(amount);
        },
        shakeScreen: (strength, duration) => {
          this.fx.shake(strength, duration);
        },
        onWaveAdvanced: (wave) => {
          // Wave orchestrator triggers this when clear transition is done
          // Go from cleared → playing for new wave countdown
          this.wave = wave;
          this.fsm.fire("next_wave");
          this.countdownSystem.startWave(this.wave);
        },
      },
      playerMaxSpeed: PLAYER_MAX_SPEED,
    });

    /* Initialize input */
    this.input = new InputManager({
      onPauseKey: () => this.togglePause(),
      onLoseFocus: () => {
        if (
          (this.fsm.is("playing", "active", "cleared", "dying")) &&
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
      addScore: (n) => this.scoringSystem.add(n),
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

    /* Initialize menu scene */
    this.menuScene = new MenuScene(
      this.starfield,
      this.asteroidField,
      this.riftField,
      this.rendererSystem,
      this.renderer,
      this.camera,
    );

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

    /* Subscribe to events */
    // Load persistent upgrades
    this.playerUpgrades = loadUpgrades();
    this.appliedUpgrades = applyUpgrades(this.playerUpgrades);
    
    // Create fsmContext BEFORE CountdownSystem so it can reference it
    const fsmContext: GameFSMContext = {
      onPlayerDeath: () => {},
      onDeathAnimationEnd: () => {},
      onGameOver: () => {},
      onReturnToMenu: () => {},
      onStartRun: () => {},
      onWaveStart: () => {},
      countdownDone: () => {},
      onPause: () => {},
      onWaveComplete: () => {},
      onWaveAdvanced: () => {},
    };

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
        countdownDone: () => {
          if (fsmContext.countdownDone) fsmContext.countdownDone();
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
      this.gameState,
      (amount: number, x: number, y: number) => this.spawnParts(amount, x, y)
    );

    /* Subscribe to events */
    // Load persistent upgrades
    this.playerUpgrades = loadUpgrades();
    this.appliedUpgrades = applyUpgrades(this.playerUpgrades);
    
    // Initialize FSM — используем уже созданный fsmContext
    this.fsm = new GameStateMachine<GameFSMContext>("menu", 
      [
        { trigger: "start", target: "playing", guard: () => true, onEnter: () => {} },
        { trigger: "to_menu", target: "menu", guard: () => true, onEnter: () => fsmContext.onReturnToMenu() },
        { trigger: "countdown_done", target: "active", guard: () => this.fsm.is("playing"), onEnter: () => {} },
        { trigger: "wave_cleared", target: "cleared", guard: () => true, onEnter: () => fsmContext.onWaveComplete() },
        { trigger: "next_wave", target: "playing", guard: () => true, onEnter: () => {} },
        { trigger: "player_died", target: "dying", guard: () => true, onEnter: () => fsmContext.onPlayerDeath() },
        { trigger: "death_anim_done", target: "over", guard: () => true, onEnter: () => fsmContext.onDeathAnimationEnd() },
        { trigger: "restart", target: "playing", guard: () => true, onEnter: () => fsmContext.onStartRun(1) },
      ] as any,
      fsmContext
    );
    
    // Теперь когда fsm создан, заполняем контекст
    fsmContext.onPlayerDeath = () => {
      this.deathTimer = DEATH_ANIMATION_DURATION;
      // Save persistent upgrades (parts) before death animation
      saveUpgrades(this.playerUpgrades);
      // Clear all enemy bullets to prevent "orphan bullets" on restart
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
    };
    fsmContext.onDeathAnimationEnd = () => {
      const best = this.scoringSystem.checkNewBest();
      const s = this.scoringSystem.getState();
      this.hooks.onStats({
        score: s.score,
        best: s.best,
        isBest: best,
        wave: this.wave,
        kills: s.killed,
        time: s.runTime,
      });
    };
    fsmContext.onGameOver = () => {
      this.hooks.onGameOver();
    };
    fsmContext.onReturnToMenu = () => {
      // Menu state is handled by toMenu() caller
    };
    fsmContext.onStartRun = (wave: number) => {
      this.startRun();
    };
    fsmContext.onWaveStart = (wave: number) => {
      this.countdownSystem.startWave(this.wave);
    };
    fsmContext.countdownDone = () => {
      this.fsm.fire("countdown_done");
    };
    fsmContext.onPause = (paused: boolean) => {
      this.hooks.onPause(paused);
      this.audio.setSuspended(paused);
    };
    fsmContext.onWaveComplete = () => {
      // Wave complete handled by WaveOrchestrator
    };
    fsmContext.onWaveAdvanced = (wave: number) => {
      // Handled by waveOrchestrator hooks
    };
    
    // Subscribe to FSM events for wave lifecycle
    this.fsm.on("countdown_done", () => {
      // Countdown finished, game is now active
    });
    this.fsm.on("wave_cleared", () => {
      // Wave cleared, orchestrator will advance after delay
    });
    
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
      this.killedWave = this.scoringSystem.onKill(scoreValue, this.killedWave);
      this.checkWaveClear();
    });

    this.eventBus.on("wave_started", (event) => {
      // Запускаем волну при начале обратного отсчёта
      if (this.fsm.is("playing")) {
        const waveData = event.payload as { wave: number };
        this.wave = waveData.wave;
        this.waveTotal = waveTotalFor(this.wave);
        // Сброс счётчиков для новой волны
        this.allocated = 0;
        this.killedWave = 0;
        // Initialize orchestrator for this wave
        const pos = this.getPlayerPosition();
        this.waveOrchestrator.initWave(pos.x, pos.y, this.wave, this.waveTotal);
        this.waveOrchestrator.setSpeedMult(this.appliedUpgrades?.speedMult ?? 1.0);
      }
    });

    this.eventBus.on("wave_cleared", (event) => {
      // Wave completed - FSM handles transition to cleared state
      if (this.fsm.is("active")) {
        this.fsm.fire("wave_cleared");
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
      this.spawnEnemy(EnemyKind.Drone, x, y, parent);
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

    this.eventBus.on("drone_fired", (event) => {
      const data = event.payload as { x: number; y: number; vx: number; vy: number; damage: number };
      this.enemyBulletList.push({
        x: data.x,
        y: data.y,
        vx: data.vx,
        vy: data.vy,
        life: 1.5,
        dmg: data.damage,
        heavy: false,
        cruiser: false,
      });
    });

    this.eventBus.on("drone_hit", (event) => {
      const data = event.payload as { x: number; y: number; dead: boolean };
      if (data.dead) {
        const idx = this.allyDrones.findIndex(d => Math.abs(d.x - data.x) < 2 && Math.abs(d.y - data.y) < 2);
        if (idx !== -1) this.allyDrones.splice(idx, 1);
      }
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
      // FSM handles the transition — no double-entry possible
      this.fsm.fire("player_died");
    });
  }

  private step(dt: number) {
    const dtScaled = dt * this.timeScale;
    this.time += dtScaled;

    this.handleDebugKeys();

    this.gameState.setTime(this.time);
    this.gameState.setWave(this.wave);
    this.gameState.setScore(this.scoringSystem.getState().score);

    if (this.fsm.is("menu")) {
      this.updateMenu(dtScaled);
      return;
    }

    if (this.paused) {
      this.render();
      return;
    }

    /* Update all systems in order */
    this.countdownSystem.update(dtScaled);
    this.scoringSystem.updateCombo(dtScaled);
    // Remove mouse-based aiming - auto-aim handles targeting via handleAutoFire
    this.playerSystem.update(dtScaled, this.fsm.not("menu", "over", "dying"));
    // Автоматический запуск ракет с левого и правого борта
    if (this.fsm.is("active", "dying")) {
      this.playerSystem.launchMissiles(dtScaled, this.enemyList);
    }
    
    // Handle dying → over transition
    if (this.fsm.is("dying")) {
      this.deathTimer -= dtScaled;
      if (this.deathTimer <= 0) {
        this.fsm.fire("death_anim_done");
      }
    }
    
    // Жёсткий барьер зоны: отталкивает игрока обратно, если он вышел за границу
    // clamp происходит ТОЛЬКО когда зона достигла целевого радиуса (перестала расширяться)
    // Пока зона расширяется — игрок движется свободно, так как зона быстрее (1.7× PLAYER_MAX_SPEED)
    if (this.gameState.zone.active && 
        this.gameState.zone.radius >= this.gameState.zone.targetRadius && 
        this.gameState.zone.radius > 0) {
      this.playerSystem.clampPlayerToZone(
        this.gameState.zone.x,
        this.gameState.zone.y,
        this.gameState.zone.radius,
        this.gameState.zone.active,
        0
      );
    }
    // Stop enemies and bullets during dying/over (prevent orphan bullets)
    const isDead = this.fsm.is("dying", "over");
    if (!isDead) {
      this.enemySystem.clampEnemiesToZone(
        this.gameState.zone.x,
        this.gameState.zone.y,
        this.gameState.zone.radius,
        this.gameState.zone.active
      );
      this.enemySystem.update(dtScaled, this.enemyList, this.getPlayerPosition(), this.enemyBulletList);
      this.bulletSystem.update(dtScaled, this.bullets, this.enemyBulletList, this.enemyList);
      // Обработка самонаведения ракет
      this.updateHomingMissiles(dtScaled);
      this.mineSystem.update(dtScaled, this.mines);
      // Orbit drones around player (droneSystem.update handles AI/firing only)
      const pState = this.playerSystem.getState();
      for (const d of this.allyDrones) {
        d.phase += dtScaled * 0.5;
        d.x = pState.x + Math.cos(d.phase) * 58;
        d.y = pState.y + Math.sin(d.phase) * 58;
        if (d.r == null) d.r = 10;
      }
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
    if (this.fsm.not("dying", "over")) {
      this.updateZoneAndWaves(dtScaled);
      
      // Авто-стрельба по ближайшему врагу в зоне поражения
      if (this.fsm.is("playing", "active")) {
        this.handleAutoFire(dtScaled);
      }
    } else {
      // Still render zone effects but don't damage player
      this.updateZoneAndWaves(dtScaled);
    }
    
    // Sync zone state from orchestrator to gameState for rendering
    const wz = this.waveOrchestrator.zoneState;
    this.gameState.zone.x = wz.x;
    this.gameState.zone.y = wz.y;
    this.gameState.zone.radius = wz.radius;
    this.gameState.zone.targetRadius = wz.targetRadius;
    this.gameState.zone.alpha = wz.alpha;
    this.gameState.zone.active = wz.active;
    this.gameState.zone.collapseT = wz.collapseT;
    
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
        type: this.fsm.state as any,
        time: this.time,
        wave: this.wave,
        score: this.scoringSystem.score,
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
    this.menuScene.update(dt);
    this.fx.update(dt, dt); // Обновляем частицы и тряску экрана
    this.menuScene.render(this.renderer);
  }

  private updateHud() {
    const s = this.scoringSystem.getState();
    const hud: HudData = {
      wave: this.wave,
      score: s.score,
      best: s.best,
      hp: this.playerSystem.getHp(),
      maxHp: this.playerSystem.getMaxHp(),
      killed: this.killedWave,
      total: this.waveTotal,
      enemies: this.enemyList.length,
      comboMult: s.comboMult,
      time: s.runTime,
      guns: this.playerSystem.getGuns(),
      rateMult: this.playerSystem.getRateMult(),
      rateT: this.playerSystem.getRateT(),
      drones: this.allyDrones.length,
      minerals: this.minerals,
      parts: this.playerUpgrades.parts,
    };
    this.hooks.onHud(hud);
  }

  public togglePause() {
    if (this.fsm.is("menu", "over")) return;
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

  /** Get persistent player upgrades */
  getPlayerUpgrades(): PlayerUpgrades {
    return this.playerUpgrades;
  }

  /** Re-apply upgrades from localStorage (called after purchasing in menu) */
  refreshUpgrades(): void {
    this.playerUpgrades = loadUpgrades();
    this.appliedUpgrades = applyUpgrades(this.playerUpgrades);
    // Re-apply to active systems
    if (this.appliedUpgrades) {
      const up = this.appliedUpgrades;
      this.playerSystem.setMaxHp(up.baseHp);
      this.playerSystem.setGuns(up.gunCount);
      this.bulletSystem.setBulletDmg(up.bulletDmg);
    }
  }

  /** Force reload from localStorage (called after reset in settings) */
  forceReloadUpgrades(): void {
    this.playerUpgrades = loadUpgrades();
    this.appliedUpgrades = applyUpgrades(this.playerUpgrades);
    // Re-apply to active systems
    if (this.appliedUpgrades) {
      const up = this.appliedUpgrades;
      this.playerSystem.setMaxHp(up.baseHp);
      this.playerSystem.setGuns(up.gunCount);
      this.bulletSystem.setBulletDmg(up.bulletDmg);
    }
  }

  /** Purchase upgrade bypassing cost check (debug: +1000 details) */
  purchaseUpgradeNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    const level = this.playerUpgrades[key];
    if (level >= UPGRADE_TIERS[key].maxLevel) return false;
    this.playerUpgrades[key]++;
    saveUpgrades(this.playerUpgrades);
    this.refreshUpgrades();
    return true;
  }

  toggleDebug(): void {
    this.debugShow = !this.debugShow;
    this.debugToggleTimer = 1;
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
        keys['G'] = true;
      }
    } else {
      keys['G'] = false;
    }
    
    // R or Enter or Space to restart from "over" state
    if (this.fsm.is("over")) {
      const restartKey = this.input.isKey('KeyR') || this.input.isKey('Enter') || this.input.isKey('Space');
      if (restartKey && !keys['restart']) {
        this.fsm.fire("restart");
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
      `state: ${this.fsm.state}`,
      `wave: ${this.wave}`,
      `time: ${this.scoringSystem.runTime.toFixed(1)}s`,
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
      `  killed: ${this.scoringSystem.getState().killed}`,
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
    if (this.fsm.is("menu")) return;
    this.fsm.fire("to_menu");
    this.paused = false;
    this.hooks.onPause(false);
    // Reset menu state
    this.menuScene.reset();
    this.asteroidField.reset();
  }

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }

  startRun() {
    // FSM will fire "start" which transitions to "playing" state
    this.fsm.fire("start");
    
    this.time = 0;
    this.scoringSystem.reset();
    this.wave = this.startWave;
    this.waveTotal = 0;
    this.allocated = 0;
    this.killedWave = 0;
    this.peakAlive = 0;

    // Spawn player at center of screen (not from rift)
    this.playerSystem.reset();
    
    // Apply persistent upgrades to the player
    if (this.appliedUpgrades) {
      const up = this.appliedUpgrades;
      this.playerSystem.setMaxHp(up.baseHp);
      this.playerSystem.setGuns(up.gunCount);
      this.bulletSystem.setBulletDmg(up.bulletDmg);
      // Refill HP to new max
      this.playerSystem.resetHp();
    }
    
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

    // Reset zone state via orchestrator
    const pos = this.getPlayerPosition();
    this.waveOrchestrator.reset();

    this.riftField.reset();
    this.asteroidField.hardReset();
    this.fx.reset();
    this.asteroidField.list.length = 0;

    this.hooks.onBanner(null);
    this.hooks.onCountdown(null);
    this.hooks.onToast(null);

    // Start countdown immediately
    this.countdownSystem.startWave(this.wave);
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number) {
    this.pickups.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
  }

  private spawnParts(amount: number, x: number, y: number) {
    this.playerUpgrades.parts += amount;
    saveUpgrades(this.playerUpgrades);
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

  /** Обновить самонаведение ракет */
  private updateHomingMissiles(dt: number) {
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i] as any;
      if (!b.homingTarget) continue;

      const target = b.homingTarget;
      const dx = target.x - b.x;
      const dy = target.y - b.y;
      const dist = Math.hypot(dx, dy) || 1;

      // Вектор к цели
      const tx = dx / dist;
      const ty = dy / dist;

      // Текущий вектор скорости
      const speed = Math.hypot(b.vx, b.vy) || 1;
      const cvx = b.vx / speed;
      const cvy = b.vy / speed;

      // Lerp текущего направления к цели
      const turnRate = (b.homingTurnRate ?? MISSILE_TURN_RATE) * dt;
      const lerpFactor = Math.min(turnRate, 1);
      const nx = cvx + (tx - cvx) * lerpFactor;
      const ny = cvy + (ty - cvy) * lerpFactor;
      const nLen = Math.hypot(nx, ny) || 1;

      b.vx = (nx / nLen) * speed;
      b.vy = (ny / nLen) * speed;
    }
  }

  private enemyFire(data: { x: number; y: number; angle: number; boltDmg: number; cruiser: boolean; heavy: boolean; boltSpeed?: number }) {
    const heavy = data.cruiser || data.heavy;
    const speed = data.boltSpeed ?? (data.cruiser ? CRUISER_BULLET_SPEED : 300);
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
        this.playerSystem.addGunBonus(2, 15);
        this.audio.pickupGun();
        break;
      case "drone":
        this.droneSystem.spawn(this.allyDrones, this.getPlayerPosition(), this.playerSystem.getMaxHp());
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
        this.scoringSystem.add(50);
        break;
      case "missile":
        this.playerSystem.activateMissileLauncher(MISSILE_DURATION);
        this.audio.pickupGun();
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
    if (this.fsm.not("active")) return;
    
    // Если оркестратор уже в cleared — переход к следующей волне, игнорируем убийства
    if (this.waveOrchestrator.waveState === "cleared") return;
    
    const alive = this.enemyList.filter((e) => !e.dead).length;
    if (alive === 0) {
      // Проверяем что все враги действительно спавнятся (спавновая очередь пуста)
      // и все враги убиты
      const allSpawned = this.allocated >= this.waveTotal;
      const allKilled = this.killedWave >= this.waveTotal;
      
      this.waveOrchestrator.tryCheckWaveClear(allSpawned, allKilled);
    }
  }

  private updateZoneAndWaves(dt: number) {
    if (this.fsm.not("active", "cleared")) return;

    this.scoringSystem.addRunTime(dt);

    // Apply speed multiplier
    this.waveOrchestrator.setSpeedMult(this.appliedUpgrades?.speedMult ?? 1.0);

    // Update orchestrator (handles zone expansion, clear transition, edge danger, constraints)
    const playerPos = this.getPlayerPosition();
    const asteroids = ((this.asteroidField as any).list || []) as any[];
    const countdownActive = this.countdownSystem.isCountdownActive();
    this.waveOrchestrator.update(dt, playerPos, this.enemyList, asteroids, countdownActive);
  }

  /** Delegate menu asteroid spawning to MenuScene */
  private ensureMenuAsteroids(): void {
    // MenuScene handles asteroid spawning internally via its update() method
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