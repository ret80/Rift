/**
 * Game - чистый оркестратор игровых систем.
 * Координирует работу модульных систем через EventBus и GameState.
 * Не содержит бизнес-логики - вся логика вынесена в системы.
 */

import {
  EnemyKind,
  PickupKind,
  PLAYER_MAX_SPEED,
  waveTotalFor
} from "./balance";
import { AudioManager } from "./systems/AudioManager";
import type { PlayerUpgrades } from "./upgrades";
import { loadBestWave, saveBestWave } from "./upgrades";

import { CRUISER_BULLET_SPEED } from "./balance";

import {
  // FPS
  FPS_SMOOTHING_FACTOR,
  MISSILE_TURN_RATE,
  // Zone gun range (still used by Game for autofire)
  ZONE_GUN_RANGE
} from "./balance";
import type { GameStateType } from "./core/GameState";
import type { LoadoutSlotData } from "./balance/loadout";
import { clamp } from "./math";
import { Renderer } from "./render";
import { DebugSystem } from "./systems/DebugSystem";
import { MenuScene } from "./systems/MenuScene";
import { ScoringSystem } from "./systems/ScoringSystem";

/* Core systems */
import { EventBus } from "./core/EventBus";
import type { GameFSMContext } from "./core/FSMBridge";
import { FSMBridge } from "./core/FSMBridge";
import { GameState } from "./core/GameState";
import { GameStateMachine } from "./core/StateMachine";

/* Subsystems */
import { AsteroidField } from "./asteroids";
import { Fx } from "./fx";
import { InputManager } from "./input";
import { RiftField } from "./rifts";
import { Starfield } from "./starfield";

/* Entity types */
import type { Enemy } from "./types";

/* Game systems */
import { ApplyPickupSystem } from "./systems/ApplyPickupSystem";
import { BulletSystem } from "./systems/BulletSystem";
import { CameraSystem } from "./systems/CameraSystem";
import { CollisionSystem } from "./systems/CollisionSystem";
import { CountdownSystem } from "./systems/CountdownSystem";
import { DeathSystem } from "./systems/DeathSystem";
import { DroneSystem } from "./systems/DroneSystem";
import { EnemySystem } from "./systems/EnemySystem";
import { EntityPoolSystem } from "./systems/EntityPoolSystem";
import { InputSystem } from "./systems/InputSystem";
import { LoadoutSystem } from "./systems/LoadoutSystem";
import { MineSystem } from "./systems/MineSystem";
import { PickupDropSystem } from "./systems/PickupDropSystem";
import { PickupSystem } from "./systems/PickupSystem";
import { PlayerSystem } from "./systems/PlayerSystem";
import { RendererSystem } from "./systems/RendererSystem";
import { SpawnSystem } from "./systems/SpawnSystem";
import { UpgradeSystem } from "./systems/UpgradeSystem";
import { WaveOrchestrator } from "./systems/WaveOrchestrator";
import { ZoneSystem } from "./systems/ZoneSystem";

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
  /** Weapon + bonus slots rendered in the HUD loadout row. */
  loadout: LoadoutSlotData[];
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
  readonly audio = new AudioManager();
  private renderer: Renderer;
  private hooks: Hooks;
  private inputSystem: InputSystem;

  private raf = 0;
  private _destroyed = false;
  private lastT = 0;
  private time = 0;
  private timeScale = 1;

  private fpsEma = 60;
  private startWave = 1;

  /* Menu animation */
  private menuScene: MenuScene;

  private paused = false;

  /* Death system */
  private deathSystem!: DeathSystem;

  /* FSM */
  private fsmBridge: FSMBridge | null = null;
  private fsmCtx: GameFSMContext;
  
  /** Shorthand for FSM machine — used throughout Game */
  private get fsm(): GameStateMachine<GameFSMContext> {
    const b = this.fsmBridge;
    if (!b) throw new Error("FSM not initialized");
    return b.fsmMachine;
  }

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
  private dropSystem!: PickupDropSystem;
  private applyPickupSystem!: ApplyPickupSystem;
  private loadoutSystem!: LoadoutSystem;

  private zoneSystem: ZoneSystem;
  private waveOrchestrator: WaveOrchestrator;

  /* Scoring */
  private scoringSystem: ScoringSystem;

  // Wave tracking (used by SpawnSystem)
  private wave = 1;
  private waveTotal = 0;
  private allocated = 0;
  private peakAlive = 0;

  /* Persistent upgrades */
  private upgradeSystem: UpgradeSystem;

  private popupId = 0;
  private countId = 0;
  private countdownClearTimer = 0;

  /* Camera - система управления камерой (smooth follow) */
  private cameraSystem: CameraSystem;

  /* Debug */
  private debugSystem: DebugSystem;

  /* Entity pools */
  private entityPool: EntityPoolSystem;

  /* Game state */
  private mineDropT = -1;
  private minerals = 0;

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.cameraSystem.resize(w, h, Math.min(window.devicePixelRatio || 1, 1.75));
  };

  constructor(canvas: HTMLCanvasElement, hooks: Hooks) {
    this.renderer = new Renderer(canvas);
    this.hooks = hooks;
    this.scoringSystem = new ScoringSystem();
    this.upgradeSystem = UpgradeSystem.create();

    /* Initialize camera system first (needed by onResize) */
    this.cameraSystem = new CameraSystem();
    this.debugSystem = new DebugSystem();
    this.entityPool = new EntityPoolSystem();

    this.onResize();

    /* Initialize input system (mouse/touch for aiming and firing) */
    this.inputSystem = new InputSystem(canvas, {
      onAimUpdate: (mouseX, mouseY, winW, winH) => {
        // Convert mouse screen position to world position
        const cp = this.cameraSystem.getPosition();
        const worldX = cp.x + (mouseX - winW / 2) / cp.zoom;
        const worldY = cp.y + (mouseY - winH / 2) / cp.zoom;
        
        const playerPos = this.playerSystem.getState();
        const angle = Math.atan2(worldY - playerPos.y, worldX - playerPos.x);
        this.playerSystem.setAim(angle);
      },
      onFiringChanged: (firing) => {
        this.playerSystem.setIsFiring(firing);
      },
    });

    /* Initialize core systems */
    this.eventBus = new EventBus();
    this.gameState = new GameState();

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
          this.fx.addShake(strength);
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

    /* Initialize zone system (sync, clamp, constraints) */
    this.zoneSystem = new ZoneSystem({
      getZoneState: () => this.waveOrchestrator.zoneState,
      gameStateZone: this.gameState.zone,
      getPlayerRef: () => this.playerSystem.getPlayerRef(),
      getEnemyList: () => this.entityPool.enemyList,
      getAsteroids: () => this.asteroidField.asteroidList as Array<{ x: number; y: number; r: number; vx: number; vy: number }>,
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
    
    this.asteroidField = new AsteroidField({
      addScore: (n) => this.scoringSystem.add(n),
      spawnPickup: (kind, x, y, vx, vy) => this.spawnPickup(kind, x, y, vx, vy),
      fx: this.fx,
      audio: this.audio,
    }, this.eventBus);
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
      this.cameraSystem.getRawCamera(),
    );

    /* Initialize game logic systems with dependency injection */
    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.gameState,
      this.input,
      this.fx,
      this.audio,
      () => this.getZoneBounds(),
      (kind: string, x: number, y: number, vx: number, vy: number) => this.spawnPickup(kind as PickupKind, x, y, vx, vy),
      (angle: number) => this.fireAll(angle)
    );

    this.enemySystem = new EnemySystem(
      this.eventBus,
      this.gameState,
      this.fx,
      this.audio,
      (data) => {
        const heavy = data.cruiser || data.heavy;
        const speed = data.boltSpeed ?? (data.cruiser ? CRUISER_BULLET_SPEED : 300);
        const life = data.cruiser ? 1.8 : 1.35;
        this.entityPool.spawnEnemyBullet(
          data.x + Math.cos(data.angle) * 14,
          data.y + Math.sin(data.angle) * 14,
          Math.cos(data.angle) * speed,
          Math.sin(data.angle) * speed,
          life,
          data.boltDmg,
          heavy,
          data.cruiser,
        );
      },
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
          this.fsmBridge?.context.countdownDone?.();
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
      (kind: string, x: number, y: number, parent: any) => this.spawnEnemy(kind as EnemyKind, x, y, parent)
    );

    // Initialize ApplyPickupSystem
    this.applyPickupSystem = new ApplyPickupSystem({
      heal: (amount: number) => this.playerSystem.heal(amount),
      boostRate: () => this.playerSystem.boostRate(),
      addGunBonus: (guns: number, duration: number) => this.playerSystem.addGunBonus(guns, duration),
      spawnDrone: (droneList, playerPos, maxHp) => this.droneSystem.spawn(droneList, playerPos, maxHp),
      setDashT: (duration: number) => this.playerSystem.setDashT(duration),
      setMineT: (value: number) => { this.mineDropT = value; },
      addMinerals: (count: number) => { this.minerals += count; },
      addScore: (amount: number) => this.scoringSystem.add(amount),
      activateMissileLauncher: (duration: number) => this.playerSystem.activateMissileLauncher(duration),
      playPickupSound: (kind: string) => this.audio.playPickupSound(kind as PickupKind),
    });

    this.pickupSystem = new PickupSystem(
      this.eventBus,
      this.gameState,
      this.audio,
      (kind) => {
        const playerPos = this.getPlayerPosition();
        const maxHp = this.playerSystem.getMaxHp();
        this.applyPickupSystem.apply(kind, this.entityPool.allyDroneList, playerPos, maxHp);
      },
      () => this.getPlayerPosition()
    );

    // HUD loadout row — weapon + bonus icons with their timers
    this.loadoutSystem = new LoadoutSystem(
      {
        getFireCd: () => this.playerSystem.getFireCd(),
        getFireCdMax: () => this.playerSystem.getFireCdMax(),
        getMissileT: () => this.playerSystem.getMissileT(),
        getRateT: () => this.playerSystem.getRateT(),
        getGunsT: () => this.playerSystem.getGunsT(),
        getDashT: () => this.playerSystem.getDashT(),
        getDroneCount: () => this.entityPool.allyDroneList.length,
      },
      this.eventBus
    );

    this.dropSystem = new PickupDropSystem(this.eventBus);

    this.collisionSystem = new CollisionSystem(
      this.eventBus,
      this.gameState
    );

    // Wire drop system callback to collision system
    this.collisionSystem.setOnEnemyKilled((enemy) => {
      this.dropSystem.onEnemyKilled(enemy,
        (kind, x, y, vx, vy) => this.spawnPickup(kind, x, y, vx, vy),
        (n, x, y) => this.upgradeSystem.addParts(n)
      );
    });

    // DeathSystem is initialized in startRun() to avoid duplicate creation

    // Initialize FSM bridge with lifecycle hooks
    this.fsmBridge = new FSMBridge({
      onPlayerDeath: () => {
        this.deathSystem.startDeath();
      },
      onDeathAnimationEnd: () => {
        this.deathSystem.onFinishDeath();
      },
      onGameOver: () => {
        // No-op — handled by DeathSystem
      },
      onReturnToMenu: () => {
        // Menu state is handled by toMenu() caller
      },
      onStartRun: (wave: number) => {
        this.startRun();
      },
      onWaveStart: (wave: number) => {
        this.countdownSystem.startWave(this.wave);
      },
      countdownDone: () => {
        if (this.fsmBridge) this.fsmBridge.fsmMachine.fire("countdown_done");
      },
      onPause: (paused: boolean) => {
        this.hooks.onPause(paused);
        this.audio.setSuspended(paused);
      },
      onWaveComplete: () => {
        // Wave complete handled by WaveOrchestrator
      },
      onWaveAdvanced: (wave: number) => {
        // Handled by waveOrchestrator hooks
      },
    });
    
    // Store context reference for direct access
    this.fsmCtx = this.fsmBridge.context;
    
    // Subscribe scoring system to events FIRST so it increments killedWave before Game.checkWaveClear()
    this.scoringSystem.subscribeToEvents(this.eventBus);

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
    this._destroyed = true;
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
    this.inputSystem.destroy();
    this.input.destroy();
    this.audio.destroy();
  }

  private setupEventListeners() {
    // === FSM coordination events (remain in Game) ===

    this.eventBus.subscribe("wave_started", (event) => {
      // Запускаем волну при начале обратного отсчёта
      if (this.fsm.is("playing")) {
        const waveData = event.payload as { wave: number };
        this.wave = waveData.wave;
        this.waveTotal = waveTotalFor(this.wave);
        // Сброс счётчиков для новой волны
        this.allocated = 0;
        this.scoringSystem.setKilledWave(0);
        // Initialize orchestrator for this wave
        const pos = this.getPlayerPosition();
        this.waveOrchestrator.initWave(pos.x, pos.y, this.wave, this.waveTotal);
        this.waveOrchestrator.setSpeedMult(this.upgradeSystem.getApplied("speedMult"));
      }
    });

    this.eventBus.subscribe("wave_cleared", (_event) => {
      // Wave completed - FSM handles transition to cleared state
      if (this.fsm.is("active")) {
        this.fsm.fire("wave_cleared");
      }
    });

    this.eventBus.subscribe("game_over", (event: { type: string; payload: unknown; timestamp: number }) => {
      this.fsm.fire("player_died");
    });

    // === Wave clear check (Game-level coordination) ===
    this.eventBus.subscribe("enemy_killed", () => {
      this.checkWaveClear();
    });
  }

  private step(dt: number) {
    if (this._destroyed) return;
    const dtScaled = dt * this.timeScale;
    this.time += dtScaled;

    this.handleDebugKeys(dt);

    this.gameState.setTime(this.time);
    this.gameState.setWave(this.wave);
    this.gameState.setScore(this.scoringSystem.getState().score);

    if (this.fsm.is("menu")) {
      this.updateMenu(dtScaled);
      return;
    }

    if (this.paused) {
      this.render(dt);
      return;
    }

    /* Update all systems in order */
    this.countdownSystem.update(dtScaled);
    this.scoringSystem.updateCombo(dtScaled);
    // Remove mouse-based aiming - auto-aim handles targeting via handleAutoFire
    this.playerSystem.update(dtScaled, this.fsm.not("menu", "over", "dying"));
    // Автоматический запуск ракет с левого и правого борта
    if (this.fsm.is("active", "dying")) {
      this.playerSystem.launchMissiles(dtScaled, this.entityPool.enemyList, this.entityPool.bulletList);
    }
    
    // Handle dying → over transition
    if (this.fsm.is("dying")) {
      if (this.deathSystem.update(dtScaled)) {
        this.fsm.fire("death_anim_done");
      }
    }
    
    // Stop enemies and bullets during dying/over (prevent orphan bullets)
    const isDead = this.fsm.is("dying", "over");
    if (!isDead) {
      this.enemySystem.update(dtScaled, this.entityPool.enemyList, this.getPlayerPosition(), this.entityPool.enemyBulletList);
      this.bulletSystem.update(dtScaled, this.entityPool.bulletList, this.entityPool.enemyBulletList, this.entityPool.enemyList);
      // Обработка самонаведения ракет
      this.updateHomingMissiles(dtScaled);
      this.mineSystem.update(dtScaled, this.entityPool.mineList);
      // Update drones (handles both orbit positioning and AI/firing)
      const pState = this.playerSystem.getState();
      this.droneSystem.update(dtScaled, this.entityPool.allyDroneList, this.entityPool.enemyList, pState);
    }
    const playerState = this.playerSystem.getState();
    // Get asteroids from asteroid field for collision
    const asteroids = this.asteroidField.asteroidList as Array<{ x: number; y: number; r: number; vx: number; vy: number; mass: number; kind: string }>;
    if (!isDead) {
      this.collisionSystem.update(
        dtScaled,
        { x: playerState.x, y: playerState.y, r: 16, hp: playerState.hp, invuln: playerState.invuln, mass: playerState.mass || 1, vx: playerState.vx || 0, vy: playerState.vy || 0 },
        this.entityPool.enemyList,
        this.entityPool.bulletList as Parameters<typeof this.collisionSystem.update>[3],
        this.entityPool.enemyBulletList as Parameters<typeof this.collisionSystem.update>[4],
        this.entityPool.pickupList as Parameters<typeof this.collisionSystem.update>[5],
        this.entityPool.mineList as unknown as Parameters<typeof this.collisionSystem.update>[6],
        this.entityPool.allyDroneList as Parameters<typeof this.collisionSystem.update>[7],
        asteroids as Parameters<typeof this.collisionSystem.update>[8]
      );
      this.pickupSystem.update(dtScaled, this.entityPool.pickupList);
      this.spawnSystem.update(dtScaled, {
        countdownSystem: this.countdownSystem,
        gameState: this.gameState,
        riftField: this.riftField,
        hooks: {
          onToast: (data) => this.hooks.onToast(data),
        },
        wave: this.wave,
        allocated: this.allocated,
        killedWave: this.scoringSystem.killedWave,
      });
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
    
    // Update zone system: sync, clamp, constraints (after orchestrator update)
    if (!isDead) {
      this.zoneSystem.update(dtScaled);
    }
    
    // Update asteroid field with camera and zone info
    const cp = this.cameraSystem.getPosition();
    this.asteroidField.update(dtScaled, {
      camX: cp.x,
      camY: cp.y,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      zone: this.gameState.zone.active ? { x: this.gameState.zone.x, y: this.gameState.zone.y, r: this.gameState.zone.radius } : null,
    } as import("./asteroids").AsteroidEnv);

    // Handle countdown clear timer (dt-based, pause-safe)
    if (this.countdownClearTimer > 0) {
      if (!isDead && !this.paused) {
        this.countdownClearTimer -= dtScaled;
      }
      if (this.countdownClearTimer <= 0) {
        this.hooks.onCountdown(null);
        this.countdownClearTimer = 0;
      }
    }

    this.render(dt);
    this.renderDebug();
    this.loadoutSystem.update(dtScaled);
    this.updateHud();
  }

  private render(dt: number) {
    const playerState = this.playerSystem.getState();
    
    // Smooth camera follow (delegated to CameraSystem)
    this.cameraSystem.update(playerState, dt);
    const pos = this.cameraSystem.getPosition();
    
    const playerRender = this.playerSystem.getRenderState();
    
    this.rendererSystem.render(
      this.renderer,
      {
        type: this.fsm.state as GameStateType,
        time: this.time,
        wave: this.wave,
        score: this.scoringSystem.score,
      },
      playerRender,
      this.entityPool.enemyList,
      this.entityPool.bulletList,
      this.entityPool.enemyBulletList,
      this.entityPool.pickupList,
      this.entityPool.mineList,
      this.entityPool.allyDroneList,
      {
        active: this.gameState.zone.active,
        x: this.gameState.zone.x,
        y: this.gameState.zone.y,
        radius: this.gameState.zone.radius,
        targetRadius: this.gameState.zone.targetRadius,
        alpha: this.gameState.zone.alpha,
      },
      pos.x,
      pos.y,
      pos.zoom,
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
      killed: this.scoringSystem.killedWave,
      total: this.waveTotal,
      enemies: this.entityPool.enemyList.length,
      comboMult: s.comboMult,
      time: s.runTime,
      guns: this.playerSystem.getGuns(),
      rateMult: this.playerSystem.getRateMult(),
      rateT: this.playerSystem.getRateT(),
      drones: this.entityPool.allyDroneList.length,
      minerals: this.minerals,
      parts: this.upgradeSystem.getParts(),
      loadout: this.loadoutSystem.getSlots(),
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
    this.debugSystem.setGodMode(on);
  }

  setStartWave(wave: number): void {
    this.startWave = wave;
  }

  setEnabledEnemies(enemies: EnemyKind[] | null): void {
    this.spawnSystem.setEnabledEnemies(enemies);
  }

  setEnabledPickups(pickups: PickupKind[] | null): void {
    this.dropSystem.setEnabledPickups(pickups);
  }

  fps(): number {
    return Math.round(this.fpsEma);
  }

  /** Get persistent player upgrades */
  getPlayerUpgrades(): PlayerUpgrades {
    return this.upgradeSystem.playerUpgrades;
  }

  /** Re-apply upgrades from localStorage (called after purchasing or reset) */
  refreshUpgrades(): void {
    this.upgradeSystem.refresh();
    // Re-apply to active systems
    this.upgradeSystem.applyToSystems(
      (v) => this.playerSystem.setMaxHp(v),
      (v) => this.playerSystem.setGuns(v),
      (v) => this.bulletSystem.setBulletDmg(v)
    );
  }

  /** Purchase upgrade bypassing cost check (debug: +1000 details) */
  purchaseUpgradeNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    const success = this.upgradeSystem.purchaseNoCost(key);
    if (success) {
      this.refreshUpgrades();
    }
    return success;
  }

  private handleDebugKeys(dt: number) {
    // Debug key handling delegated to DebugSystem
    this.debugSystem.handleDebugKeys(
      (key) => this.input.isKey(key),
      this.fsm.is("over"),
      () => this.fsm.fire("restart")
    );
  }

  private renderDebug() {
    // Delegate rendering to DebugSystem
    this.debugSystem.renderDebug({
      canvas: this.renderer.canvas,
      fsmState: this.fsm.state,
      wave: this.wave,
      runTime: this.scoringSystem.runTime,
      fps: this.fps(),
      zoneActive: this.gameState.zone.active,
      zoneRadius: this.gameState.zone.radius,
      zoneTargetRadius: this.gameState.zone.targetRadius,
      zoneAlpha: this.gameState.zone.alpha,
      countdownActive: this.countdownSystem.isCountdownActive(),
      enemyCount: this.entityPool.enemyList.length,
      riftCount: this.riftField.riftList.length,
      waveTotal: this.waveTotal,
      kills: this.scoringSystem.getState().killed,
      allocated: this.allocated,
      playerX: this.playerSystem.getPosition().x,
      playerY: this.playerSystem.getPosition().y,
      playerHp: this.playerSystem.getHp(),
      playerMaxHp: this.playerSystem.getMaxHp(),
      inputAxisX: this.input.axis.x,
      inputAxisY: this.input.axis.y,
      mouseX: this.inputSystem.mouse.x,
      mouseY: this.inputSystem.mouse.y,
    });
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
    // Transition FSM from "menu" or "over" to "playing" state
    if (this.fsm.is("menu", "over")) {
      this.fsm.fire("start");
    }
    
    this.time = 0;
    this.scoringSystem.reset();
    // Начинаем с лучшей достигнутой волны (или стартовой для отладки)
    this.wave = Math.max(this.startWave, loadBestWave());
    this.waveTotal = 0;
    this.allocated = 0;
    this.scoringSystem.setKilledWave(0);
    this.peakAlive = 0;

    // Spawn player at center of screen (not from rift)
    this.playerSystem.reset();
    
    // Apply persistent upgrades to the player
    this.upgradeSystem.applyToSystems(
      (v) => this.playerSystem.setMaxHp(v),
      (v) => this.playerSystem.setGuns(v),
      (v) => this.bulletSystem.setBulletDmg(v),
      () => this.playerSystem.resetHp()
    );
    
    this.entityPool.enemyList.length = 0;
    this.entityPool.bulletList.length = 0;
    this.entityPool.enemyBulletList.length = 0;
    this.entityPool.pickupList.length = 0;
    this.entityPool.allyDroneList.length = 0;
    this.entityPool.mineList.length = 0;
    this.mineDropT = -1;
    this.minerals = 0;
    this.loadoutSystem.reset();
    
    // Reset spawn and enemy system state for new game
    this.spawnSystem.clearAnnounced();
    this.enemySystem.reset();

    // Reset zone state via orchestrator
    const pos = this.getPlayerPosition();
    this.waveOrchestrator.reset(this.wave);

    this.riftField.reset();
    this.asteroidField.hardReset();
    this.fx.reset();
    this.deathSystem = new DeathSystem(
      () => this.getPlayerPosition(),
      this.fx,
      this.audio,
      this.entityPool,
      this.scoringSystem,
      (n) => this.spawnParts(n, 0, 0),
      {
        onGameOver: () => {
          saveBestWave(this.wave);
          this.hooks.onGameOver();
        },
        onStats: (score, best, isBest, wave, kills, time) => {
          this.hooks.onStats({ score, best, isBest, wave: this.wave, kills, time });
        },
      },
    );
    this.asteroidField.asteroidList.length = 0;

    this.hooks.onBanner(null);
    this.hooks.onCountdown(null);
    this.hooks.onToast(null);

    // Start countdown immediately
    this.countdownSystem.startWave(this.wave);
  }

  private spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number) {
    this.entityPool.pickupList.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
  }

  private spawnParts(amount: number, x: number, y: number) {
    this.upgradeSystem.addParts(amount);
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null) {
    const playerPos = this.getPlayerPosition();
    this.enemySystem.spawn(kind, x, y, parent, this.entityPool.enemyList, playerPos);
    this.allocated++;
  }

  private getPlayerPosition(): { x: number; y: number; vx: number; vy: number } {
    const state = this.playerSystem.getState();
    return { x: state.x, y: state.y, vx: state.vx, vy: state.vy };
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
    this.bulletSystem.firePlayerBullets(this.playerSystem.getState(), angle, this.entityPool.bulletList);
  }

  /** Обновить самонаведение ракет */
  private updateHomingMissiles(dt: number) {
    for (let i = 0; i < this.entityPool.bulletList.length; i++) {
      const b = this.entityPool.bulletList[i];
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
    this.entityPool.spawnEnemyBullet(
      data.x + Math.cos(data.angle) * 14,
      data.y + Math.sin(data.angle) * 14,
      Math.cos(data.angle) * speed,
      Math.sin(data.angle) * speed,
      life,
      data.boltDmg,
      heavy,
      data.cruiser,
    );
  }


  private showCountdown(data: { label: string; value: string }) {
    this.countId++;
    this.hooks.onCountdown({ id: this.countId, label: data.label, value: data.value });
    // Countdown clear is now handled by dt-based timer in update()
    this.countdownClearTimer = 1.4;
  }

  private checkWaveClear() {
    // Не проверяем завершение если всё ещё спавнятся враги
    if (this.fsm.not("active")) return;
    
    // Если оркестратор уже в cleared — переход к следующей волне, игнорируем убийства
    if (this.waveOrchestrator.waveState === "cleared") return;
    
    const alive = this.entityPool.enemyList.filter((e) => !e.dead).length;
    if (alive === 0) {
      // Проверяем что все враги действительно спавнятся (спавновая очередь пуста)
      // и все враги убиты
      const allSpawned = this.allocated >= this.waveTotal;
      const allKilled = this.scoringSystem.killedWave >= this.waveTotal;
      
      this.waveOrchestrator.tryCheckWaveClear(allSpawned, allKilled);
    }
  }

  private updateZoneAndWaves(dt: number) {
    if (this.fsm.not("active", "cleared")) return;

    this.scoringSystem.addRunTime(dt);

    // Apply speed multiplier
    this.waveOrchestrator.setSpeedMult(this.upgradeSystem.getApplied("speedMult"));

    // Update orchestrator (handles zone expansion, clear transition, edge danger)
    // Zone constraints are handled by ZoneSystem
    const playerPos = this.getPlayerPosition();
    const countdownActive = this.countdownSystem.isCountdownActive();
    this.waveOrchestrator.update(dt, playerPos, countdownActive);
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
    
    for (const e of this.entityPool.enemyList) {
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
    } else if (!this.inputSystem.isDown) {
      // Если нет врагов и игрок не нажал кнопку мыши, прекращаем стрельбу
      this.playerSystem.setIsFiring(false);
    }
  }
}