/**
 * Game - чистый оркестратор игровых систем.
 * Координирует работу модульных систем через EventBus и GameState.
 * Не содержит бизнес-логики - вся логика вынесена в системы.
 */

import {
  EnemyKind,
  PickupKind,
  PLAYER_HITBOX_RADIUS,
  PLAYER_MAX_SPEED,
  waveTotalFor
} from "./balance";
import { AudioManager } from "./systems/AudioManager";
import type { PlayerUpgrades } from "./upgrades";
import { UPGRADE_TIERS, upgradeCost, loadBestWave, saveBestWave } from "./upgrades";
import type { PersistencePort } from "./core/PersistencePort";


import {
  // FPS
  FPS_SMOOTHING_FACTOR
} from "./balance";

import { clamp } from "./math";
import { Renderer } from "./render";
import { DebugSystem } from "./systems/DebugSystem";
import { MenuScene } from "./systems/MenuScene";
import { ScoringSystem } from "./systems/ScoringSystem";
import type { WorldFrame, AsteroidWorld } from "./core/WorldFrame";
import type { RenderScene } from "./types/render";

/* UI types — единый источник правды */
import type { BannerData, CountData, HudData, PopupData, StatsData, ToastData } from "./types/ui";

/* Re-export for backward compatibility */
export type { BannerData, CountData, HudData, PopupData, StatsData, ToastData };

/* Core systems */
  import { EventBus } from "./core/EventBus";
  import type { GameFSMContext } from "./core/GameFSM";
  import { GAME_TRANSITIONS } from "./core/GameFSM";
  import { GameStateMachine } from "./core/StateMachine";

/* Subsystems */
import { AsteroidField } from "./asteroids";
import { Fx } from "./fx";
import { InputManager } from "./input";
import { RiftField } from "./rifts";
import { Starfield } from "./starfield";

/* Entity types */
import type { Enemy } from "./types";

/* Loadout + weapons */
import { LoadoutSystem } from "./loadout/LoadoutSystem";
import { BonusManager } from "./loadout/bonuses/BonusManager";
import type { WeaponId } from "./weapons/Weapon";
import { WeaponManager } from "./weapons/WeaponManager";

/* Game systems */
import { AbilitySystem } from "./abilities/AbilitySystem";
import { ApplyPickupSystem } from "./systems/ApplyPickupSystem";
import { BulletSystem } from "./systems/BulletSystem";
import { CameraSystem } from "./systems/CameraSystem";
import { CollisionSystem } from "./systems/CollisionSystem";
import { CountdownSystem } from "./systems/CountdownSystem";
import { DeathSystem } from "./systems/DeathSystem";
import { EnemyShootingSystem } from "./systems/EnemyShootingSystem";
import { EnemySystem } from "./systems/EnemySystem";
import { EntityPoolSystem } from "./systems/EntityPoolSystem";
import { GrazeSystem } from "./systems/GrazeSystem";
import { InputSystem } from "./systems/InputSystem";
import { PickupDropSystem } from "./systems/PickupDropSystem";
import { PickupSystem } from "./systems/PickupSystem";
import { PlayerSystem } from "./systems/PlayerSystem";
import { RendererSystem } from "./systems/RendererSystem";
import { SpawnSystem } from "./systems/SpawnSystem";
import { UpgradeSystem } from "./systems/UpgradeSystem";
import { WaveFlowSystem } from "./systems/WaveFlowSystem";
import { WaveOrchestrator } from "./systems/WaveOrchestrator";
import { ZoneSystem } from "./systems/ZoneSystem";

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

  private fpsEma = 60;
  private startWave = 1;

  /* Menu animation */
  private menuScene: MenuScene;

  private paused = false;

  /* Death system */
  private deathSystem!: DeathSystem;

  /* FSM */
  private fsm: GameStateMachine<GameFSMContext>;

  /* Core systems */
  private eventBus: EventBus;

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
  private enemyShootingSystem: EnemyShootingSystem;
  private bulletSystem: BulletSystem;
  private spawnSystem: SpawnSystem;
  private countdownSystem: CountdownSystem;
  private pickupSystem: PickupSystem;
  private collisionSystem: CollisionSystem;
  private dropSystem!: PickupDropSystem;
  private applyPickupSystem!: ApplyPickupSystem;
  private loadoutSystem!: LoadoutSystem;

  /* Temporary bonuses — владеют темпом огня, стволами, рывком */
  private bonusManager: BonusManager;

  /* Касания и импульс от них */
  private grazeSystem: GrazeSystem;

  /* Активные способности */
  private abilitySystem: AbilitySystem;

  /* Weapons — владеют пушкой, ракетами и дронами */
  private weaponManager: WeaponManager;

  private zoneSystem: ZoneSystem;
  private waveOrchestrator: WaveOrchestrator;
  private waveFlowSystem!: WaveFlowSystem;

  /* Scoring */
  private scoringSystem: ScoringSystem;

  /* Persistent upgrades */
  private upgradeSystem: UpgradeSystem;

  private countId = 0;

  /* Camera - система управления камерой (smooth follow) */
  private cameraSystem: CameraSystem;

  /* Debug */
  private debugSystem: DebugSystem;

  /* Entity pools */
  private entityPool: EntityPoolSystem;

  /* Game state */
  private minerals = 0;

  private readonly storage: PersistencePort;

  private onResize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.cameraSystem.resize(w, h, Math.min(window.devicePixelRatio || 1, 1.75));
  };

  constructor(canvas: HTMLCanvasElement, hooks: Hooks, storage: PersistencePort) {
    this.renderer = new Renderer(canvas);
    this.hooks = hooks;
    this.storage = storage;
    this.scoringSystem = new ScoringSystem({}, storage);
    this.upgradeSystem = UpgradeSystem.create(storage);

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

        const player = this.playerSystem.getPlayerRef();
        const angle = Math.atan2(worldY - player.y, worldX - player.x);
        this.weaponManager.setManualAim(angle);
      },
      onFiringChanged: (firing) => {
        this.weaponManager.setManualFiring(firing);
      },
    });

    /* Initialize core systems */
    this.eventBus = new EventBus();

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
        shakeScreen: (strength, _duration) => {
          this.fx.addShake(strength);
        },
        onWaveAdvanced: (_wave) => {
          // Wave orchestrator triggers this when clear transition is done
          // Go from cleared → playing for new wave countdown
          const nextWave = this.waveOrchestrator.wave;
          this.enemySystem.setWave(nextWave);
          this.enemyShootingSystem.setWave(nextWave);
          this.fsm.fire("next_wave");
          this.countdownSystem.startWave(nextWave);
        },
      },
      playerMaxSpeed: PLAYER_MAX_SPEED,
    });

    /* Initialize zone system (sync, clamp, constraints) */
    this.zoneSystem = new ZoneSystem({
      getZoneState: () => this.waveOrchestrator.zoneState,
      getPlayerRef: () => this.playerSystem.getPlayerRef(),
      getEnemyList: () => this.entityPool.enemyList,
      getAsteroids: () =>
        this.asteroidField.asteroidList as Array<{ x: number; y: number; r: number; vx: number; vy: number }>,
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
      spawnPickup: (kind, x, y, vx, vy) => this.entityPool.spawnPickup(kind, x, y, vx, vy),
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
    this.bonusManager = new BonusManager();

    /* Касания и импульс: система только слушает события, коллизии шлют их */
    this.grazeSystem = new GrazeSystem(this.eventBus, this.fx, this.scoringSystem);

    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.input,
      this.fx,
      () => this.grazeSystem.getSpeedMult(),
    );

    /* Активные способности: выдача по пикапу, активация по клавише Space */
    this.abilitySystem = new AbilitySystem(
      this.input,
      {
        getPlayerX: () => this.playerSystem.getPlayerRef().x,
        getPlayerY: () => this.playerSystem.getPlayerRef().y,
        movePlayerTo: (x, y) => this.playerSystem.teleportTo(x, y),
        getEnemies: () => this.entityPool.enemyList,
        killEnemy: (enemy) => this.killEnemy(enemy),
      },
      this.fx
    );

    this.enemySystem = new EnemySystem();

    this.enemyShootingSystem = new EnemyShootingSystem(
      this.eventBus,
      this.audio
    );

    this.bulletSystem = new BulletSystem();

    this.spawnSystem = new SpawnSystem({
      eventBus: this.eventBus,
      riftField: this.riftField,
    });

    /* Weapons own the cannon, the missiles and the companion drones */
    this.weaponManager = new WeaponManager(
      {
        getPlayer: () => this.playerSystem.getPlayerRef(),
        getEnemies: () => this.entityPool.enemyList,
        getBullets: () => this.entityPool.bulletList,
        getDrones: () => this.entityPool.allyDroneList,
        getBonuses: () => this.bonusManager.getBonuses(),
        getWeaves: () => this.entityPool.weaveList,
      },
      (id) => this.onWeaponFired(id),
    );

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
          this.fsm.fire("countdown_done");
        },
      },
      eventBus: this.eventBus,
    });

    // Initialize ApplyPickupSystem
    this.applyPickupSystem = new ApplyPickupSystem({
      heal: (amount: number) => this.playerSystem.heal(amount),
      applyBonus: (pickup: PickupKind) => this.bonusManager.applyPickup(pickup),
      equipWeapon: (id: WeaponId) => this.weaponManager.equipWeapon(id),
      grantAbility: (id) => this.abilitySystem.grant(id),
      addMinerals: (count: number) => { this.minerals += count; },
      addScore: (amount: number) => this.scoringSystem.add(amount),
      playPickupSound: (kind: string) => this.audio.playPickupSound(kind as PickupKind),
    });

    this.pickupSystem = new PickupSystem();

    // HUD loadout row — weapon + bonus + ability icons with their timers
    this.loadoutSystem = new LoadoutSystem(
      {
        getWeaponSlots: () => this.weaponManager.getSlots(),
        getBonusSlots: () => this.bonusManager.getSlots(),
        getAbilitySlots: () => this.abilitySystem.getSlots(),
      },
      this.eventBus
    );

    this.dropSystem = new PickupDropSystem(this.eventBus, {
      spawnPickup: (kind, x, y, vx, vy) => this.entityPool.spawnPickup(kind, x, y, vx, vy),
      addParts: (n) => this.upgradeSystem.addParts(n),
    });

    this.collisionSystem = new CollisionSystem(
      this.eventBus
    );

    /* Initialize wave flow system (coordinates wave lifecycle) */
    this.waveFlowSystem = new WaveFlowSystem({
      eventBus: this.eventBus,
      orchestrator: this.waveOrchestrator,
      scoringSystem: this.scoringSystem,
      spawnSystem: this.spawnSystem,
      upgradeSystem: this.upgradeSystem,
      countdownSystem: this.countdownSystem,
      getEnemyList: () => this.entityPool.enemyList,
      getPlayerPosition: () => this.getPlayerPosition(),
    });

    // DeathSystem is initialized in startRun() to avoid duplicate creation

    // Initialize FSM with lifecycle context
    const fsmCtx: GameFSMContext = {
      onPlayerDeath: () => { this.deathSystem.startDeath(); },
      onDeathAnimationEnd: () => { this.deathSystem.onFinishDeath(); },
      onGameOver: () => {},
      onReturnToMenu: () => {},
      onStartRun: (_wave: number) => { this.startRun(); },
      onWaveStart: (wave: number) => {
        this.enemySystem.setWave(wave);
        this.enemyShootingSystem.setWave(wave);
        this.countdownSystem.startWave(this.waveOrchestrator.wave);
      },
      onWaveComplete: () => {},
      countdownDone: () => { this.fsm.fire("countdown_done"); },
      onPause: (paused: boolean) => { this.hooks.onPause(paused); this.audio.setSuspended(paused); },
    };
    this.fsm = new GameStateMachine<GameFSMContext>("menu", GAME_TRANSITIONS, fsmCtx);
    
    // Subscribe scoring system to events FIRST so it increments killedWave
    // before Game.checkWaveClear()
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
        // Сброс счётчиков для новой волны
        this.scoringSystem.setKilledWave(0);
        this.spawnSystem.reset();
        // Initialize orchestrator for this wave
        const pos = this.getPlayerPosition();
        this.waveOrchestrator.initWave(pos.x, pos.y, waveData.wave, waveTotalFor(waveData.wave));
        this.waveOrchestrator.setSpeedMult(this.upgradeSystem.getApplied("speedMult"));
      }
    });

    this.eventBus.subscribe("wave_cleared", (_event) => {
      // Wave completed - FSM handles transition to cleared state
      if (this.fsm.is("active")) {
        this.fsm.fire("wave_cleared");
      }
    });

    this.eventBus.subscribe("game_over", (_event: { type: string; payload: unknown; timestamp: number }) => {
      this.fsm.fire("player_died");
    });

    // === Wave clear check (Game-level coordination) ===
    this.eventBus.subscribe("enemy_killed", () => {
      this.waveFlowSystem.checkWaveClear();
    });

    // === Drone feedback ===
    this.eventBus.subscribe("drone_hit", () => {
      this.audio.playDroneHit();
    });

    // === Подбор пикапа: применить эффект (лечение, бонус, оружие, способность) ===
    this.eventBus.subscribe("pickup_collected", (event) => {
      this.applyPickupSystem.apply(event.payload.kind as PickupKind);
    });

    // === Enemy firing ===
    this.eventBus.subscribe("enemy_fired", (event) => {
      const data = event.payload as import('./core/EventBus').EnemyFiredPayload;
      const heavy = data.cruiser || data.heavy;
      this.entityPool.spawnEnemyBullet(
        data.x + Math.cos(data.angle) * 14,
        data.y + Math.sin(data.angle) * 14,
        Math.cos(data.angle) * data.boltSpeed,
        Math.sin(data.angle) * data.boltSpeed,
        data.boltLife,
        data.boltDmg,
        heavy,
        data.cruiser,
      );
    });
  }

  private step(dt: number) {
    if (this._destroyed) return;
    const dtScaled = dt;
    this.time += dtScaled;

    this.handleDebugKeys(dt);

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
    this.bonusManager.update(dtScaled);
    // Импульс касаний утекает, способности тикают кулдаун.
    this.grazeSystem.update(dtScaled);
    if (this.fsm.is("playing", "active")) {
      this.abilitySystem.update(dtScaled);
    }
    this.playerSystem.update(
      dtScaled,
      this.fsm.not("menu", "over", "dying"),
      this.bonusManager.getDashT(),
    );
    
    // Handle dying → over transition
    if (this.fsm.is("dying")) {
      if (this.deathSystem.update(dtScaled)) {
        this.fsm.fire("death_anim_done");
      }
    }
    
    // Stop enemies and bullets during dying/over (prevent orphan bullets)
    const isDead = this.fsm.is("dying", "over");
    if (!isDead) {
      this.enemySystem.update(
        dtScaled,
        this.entityPool.enemyList,
        this.getPlayerPosition(),
        this.getZoneBounds()
      );
      // Enemy shooting: separate from movement/AI
      if (this.fsm.is("playing", "active")) {
        this.enemyShootingSystem.update(dtScaled, this.entityPool.enemyList, this.getPlayerPosition());
      }
      // Weapons: targeting, cannon fire, missiles, drones
      if (this.fsm.is("playing", "active")) {
        this.weaponManager.update(dtScaled);
      }
      this.bulletSystem.update(dtScaled, this.entityPool.bulletList, this.entityPool.enemyBulletList);
    }
    const playerState = this.playerSystem.getPlayerRef();
    const zoneState = this.waveOrchestrator.zoneState;
    // Мир кадра — единая структура для систем (справочная; без копий пулов).
    const world: WorldFrame = {
      player: {
        x: playerState.x,
        y: playerState.y,
        angle: playerState.angle,
        vx: playerState.vx || 0,
        vy: playerState.vy || 0,
        r: PLAYER_HITBOX_RADIUS,
        hp: playerState.hp,
        maxHp: playerState.maxHp,
        invuln: playerState.invuln,
        mass: playerState.mass || 1,
        thrusting: playerState.thrusting,
        core: playerState.core,
      },
      enemies: this.entityPool.enemyList,
      bullets: this.entityPool.bulletList,
      enemyBullets: this.entityPool.enemyBulletList,
      pickups: this.entityPool.pickupList,
      allyDrones: this.entityPool.allyDroneList,
      weaves: this.entityPool.weaveList,
      asteroids: this.asteroidField.asteroidList as AsteroidWorld[],
      zone: zoneState && zoneState.active ? zoneState : null,
    };
    if (!isDead) {
      this.collisionSystem.update(dtScaled, world);
      this.pickupSystem.update(dtScaled, world.pickups, world.player.x, world.player.y);
      this.spawnSystem.update(dtScaled, {
        countdownSystem: this.countdownSystem,
        zoneState: world.zone ?? null,
        riftField: this.riftField,
        hooks: {
          onToast: (data) => this.hooks.onToast(data),
        },
        wave: this.waveOrchestrator.wave,
        killedWave: this.scoringSystem.killedWave,
        playerX: world.player.x,
        playerY: world.player.y,
      });
    }
    this.riftField.update(dtScaled);
    this.fx.update(dtScaled, dtScaled); // Обновляем частицы и тряску экрана
    
    // Zone updates (always run, damage handled inside)
    this.waveFlowSystem.updateZoneAndWaves(dtScaled);
    
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
      zone: this.waveOrchestrator.zoneState.active
        ? {
            x: this.waveOrchestrator.zoneState.x,
            y: this.waveOrchestrator.zoneState.y,
            r: this.waveOrchestrator.zoneState.radius,
          }
        : null,
    } as import("./asteroids").AsteroidEnv);

    this.render(dt);
    this.renderDebug();
    this.loadoutSystem.update(dtScaled);
    this.updateHud();
  }

  private render(dt: number) {
    const playerState = this.playerSystem.getPlayerRef();
    
    // Smooth camera follow (delegated to CameraSystem)
    this.cameraSystem.update(playerState, dt);
    const pos = this.cameraSystem.getPosition();
    const zoneState = this.waveOrchestrator.zoneState;

    const scene: RenderScene = {
      state: this.fsm.state as string,
      time: this.time,
      wave: this.waveOrchestrator.wave,
      score: this.scoringSystem.score,
      player: {
        x: playerState.x,
        y: playerState.y,
        angle: playerState.angle,
        vx: playerState.vx || 0,
        vy: playerState.vy || 0,
        r: PLAYER_HITBOX_RADIUS,
        hp: playerState.hp,
        maxHp: playerState.maxHp,
        invuln: playerState.invuln,
        mass: playerState.mass || 1,
        thrusting: playerState.thrusting,
        core: playerState.core,
      },
      aim: this.weaponManager.getAimAngle(),
      guns: this.weaponManager.getInstanceCount("cannon"),
      bonus: this.bonusManager.getRenderSnapshot(),
      enemies: this.entityPool.enemyList,
      bullets: this.entityPool.bulletList,
      enemyBullets: this.entityPool.enemyBulletList,
      pickups: this.entityPool.pickupList,
      allyDrones: this.entityPool.allyDroneList,
      weaves: this.entityPool.weaveList,
      zone: zoneState.active ? {
        active: zoneState.active,
        x: zoneState.x,
        y: zoneState.y,
        radius: zoneState.radius,
        targetRadius: zoneState.targetRadius,
        alpha: zoneState.alpha,
      } : null,
      camera: { x: pos.x, y: pos.y, zoom: pos.zoom },
      view: { width: window.innerWidth, height: window.innerHeight },
      phantomLevel: this.upgradeSystem.playerUpgrades.phantomHitbox,
    };

    this.rendererSystem.render(this.renderer, scene);
  }

  private updateMenu(dt: number) {
    this.menuScene.update(dt);
    this.fx.update(dt, dt); // Обновляем частицы и тряску экрана
    this.menuScene.render(this.renderer);
  }

  private updateHud() {
    const s = this.scoringSystem.getState();
    const hud: HudData = {
      wave: this.waveOrchestrator.wave,
      score: s.score,
      best: s.best,
      hp: this.playerSystem.getHp(),
      maxHp: this.playerSystem.getMaxHp(),
      killed: this.scoringSystem.killedWave,
      total: this.waveOrchestrator.waveTotal,
      enemies: this.entityPool.enemyList.length,
      comboMult: s.comboMult,
      time: s.runTime,
      guns: this.weaponManager.getInstanceCount("cannon"),
      rateMult: this.bonusManager.getRateMult(),
      rateT: this.bonusManager.getRateT(),
      drones: this.weaponManager.getInstanceCount("drone"),
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
    this.upgradeSystem.applyToSystems({
      setMaxHp: (v) => this.playerSystem.setMaxHp(v),
      setWeaponUpgrades: (upgrades) => this.weaponManager.applyUpgrades(upgrades),
      setSpeedMult: (v) => this.playerSystem.setSpeedMult(v),
      setCoreRadius: (v) => this.playerSystem.setCoreRadius(v),
      setDashDurationMult: (v) => this.bonusManager.setDashDurationMult(v),
      setMomentumLevel: (v) => this.grazeSystem.setMomentumLevel(v),
    });
  }

  /** Purchase upgrade bypassing cost check (debug/dev) */
  purchaseUpgradeNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    const success = this.upgradeSystem.purchaseNoCost(key);
    if (success) {
      this.refreshUpgrades();
    }
    return success;
  }

  /** Купить апгрейд с проверкой стоимости (через порт хранилища). */
  purchaseUpgradeCosted(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    const ups = this.upgradeSystem.playerUpgrades;
    const level = ups[key];
    const cost = upgradeCost(key, level);
    const tier = UPGRADE_TIERS[key];
    if (level >= tier.maxLevel) return false;
    if (ups.parts < cost) return false;
    ups.parts -= cost;
    (ups[key] as number) += 1;
    this.upgradeSystem.save();
    this.refreshUpgrades();
    return true;
  }

  private handleDebugKeys(_dt: number) {
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
      wave: this.waveOrchestrator.wave,
      runTime: this.scoringSystem.runTime,
      fps: this.fps(),
      zoneActive: this.waveOrchestrator.zoneState.active,
      zoneRadius: this.waveOrchestrator.zoneState.radius,
      zoneTargetRadius: this.waveOrchestrator.zoneState.targetRadius,
      zoneAlpha: this.waveOrchestrator.zoneState.alpha,
      countdownActive: this.countdownSystem.isCountdownActive(),
      enemyCount: this.entityPool.enemyList.length,
      riftCount: this.riftField.riftList.length,
      waveTotal: this.waveOrchestrator.waveTotal,
      kills: this.scoringSystem.getState().killed,
      allocated: this.spawnSystem.allocated,
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
    this.scoringSystem.setKilledWave(0);

    // Spawn player at center of screen (not from rift)
    this.playerSystem.reset();

    // Clear entity pools before applying upgrades:
    // the weapon manager rebuilds the drone swarm from the applied upgrades.
    this.entityPool.enemyList.length = 0;
    this.entityPool.bulletList.length = 0;
    this.entityPool.enemyBulletList.length = 0;
    this.entityPool.pickupList.length = 0;
    this.entityPool.allyDroneList.length = 0;
    this.minerals = 0;
    this.loadoutSystem.reset();
    this.weaponManager.reset();
    this.bonusManager.reset();
    this.grazeSystem.reset();
    this.abilitySystem.reset();
    this.entityPool.weaveList.length = 0;

    // Apply persistent upgrades to the player and the weapons
    this.upgradeSystem.applyToSystems({
      setMaxHp: (v) => this.playerSystem.setMaxHp(v),
      setWeaponUpgrades: (upgrades) => this.weaponManager.applyUpgrades(upgrades),
      setSpeedMult: (v) => this.playerSystem.setSpeedMult(v),
      setCoreRadius: (v) => this.playerSystem.setCoreRadius(v),
      setDashDurationMult: (v) => this.bonusManager.setDashDurationMult(v),
      setMomentumLevel: (v) => this.grazeSystem.setMomentumLevel(v),
      resetHp: () => this.playerSystem.resetHp(),
    });
    
    // Reset spawn and enemy system state for new game
    this.spawnSystem.clearAnnounced();
    this.enemySystem.reset();
    this.enemyShootingSystem.reset();
    const resetWaveStart = Math.max(this.startWave, loadBestWave(this.storage));
    this.enemySystem.setWave(resetWaveStart);
    this.enemyShootingSystem.setWave(resetWaveStart);

    // Reset zone state via orchestrator
    this.waveOrchestrator.reset(resetWaveStart);

    this.riftField.reset();
    this.asteroidField.hardReset();
    this.fx.reset();
    this.deathSystem = new DeathSystem(
      () => this.getPlayerPosition(),
      this.fx,
      this.audio,
      this.entityPool,
      this.scoringSystem,
      {
        onGameOver: () => {
          saveBestWave(this.waveOrchestrator.wave, this.storage);
          this.hooks.onGameOver();
        },
        onStats: (score, best, isBest, wave, kills, time) => {
          this.hooks.onStats({ score, best, isBest, wave: this.waveOrchestrator.wave, kills, time });
        },
      },
    );
    this.asteroidField.asteroidList.length = 0;

    this.hooks.onBanner(null);
    this.hooks.onCountdown(null);
    this.hooks.onToast(null);

    // Start countdown immediately
    this.countdownSystem.startWave(this.waveOrchestrator.wave);
  }

  private spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null) {
    const playerPos = this.getPlayerPosition();
    this.enemySystem.spawn(kind, x, y, parent, this.entityPool.enemyList, playerPos);
  }

  /**
   * Убить врага из активной способности.
   * Единый путь гибели: публикуется enemy_killed — дроп, счёт
   * и завершение волны подписаны на это событие.
   */
  private killEnemy(enemy: Enemy): void {
    if (enemy.dead) return;
    enemy.dead = true;
    this.eventBus.publish("enemy_killed", {
      score: enemy.score,
      kind: enemy.kind,
      x: enemy.x,
      y: enemy.y,
      seed: enemy.seed,
    });
  }

  private getPlayerPosition(): { x: number; y: number; vx: number; vy: number } {
    const state = this.playerSystem.getPlayerRef();
    return { x: state.x, y: state.y, vx: state.vx, vy: state.vy };
  }

  private getZoneBounds(): { x: number; y: number; radius: number; active: boolean } {
    const z = this.waveOrchestrator.zoneState;
    return {
      x: z.x,
      y: z.y,
      radius: z.radius,
      active: z.active,
    };
  }

  /** Звук выстрела: у дронов свой, у пушки и ракетомёта — общий. */
  private onWeaponFired(id: WeaponId): void {
    if (id === "drone") {
      this.audio.playDroneShot();
    } else {
      this.audio.playShoot();
    }
  }

}
