/**
 * GameContext — композиционный корень игры (DI-контейнер).
 *
 * Единственное место, где создаются системы, слои кадра/рендера,
 * подписки EventBus, игровой цикл и задаются их связи. Game использует
 * контекст как источник зависимостей и не знает, как системы собраны.
 * Порядок создания повторяет исходный конструктор Game — он важен
 * для корректной работы коллбэков во время инициализации.
 */

import { EnemyKind, PickupKind, PLAYER_HITBOX_RADIUS, PLAYER_MAX_SPEED } from "../balance";
import type { PersistencePort } from "./PersistencePort";
import { Renderer } from "../render";
import { DebugSystem } from "../systems/DebugSystem";
import { MenuScene } from "../systems/MenuScene";
import { ScoringSystem } from "../systems/ScoringSystem";
import { EventBus } from "./EventBus";
import type { GameFSMContext } from "./GameFSM";
import { GAME_TRANSITIONS } from "./GameFSM";
import { GameStateMachine } from "./StateMachine";
import type { PlayerWorld } from "./WorldFrame";
import { AsteroidField } from "../asteroids";
import { Fx } from "../fx";
import { InputManager } from "../input";
import { RiftField } from "../rifts";
import { Starfield } from "../starfield";
import type { Enemy } from "../types";
import { LoadoutSystem } from "../loadout/LoadoutSystem";
import { BonusManager } from "../loadout/bonuses/BonusManager";
import type { WeaponId } from "../weapons/Weapon";
import { WeaponManager } from "../weapons/WeaponManager";
import { AbilitySystem } from "../abilities/AbilitySystem";
import { ApplyPickupSystem } from "../systems/ApplyPickupSystem";
import { BulletSystem } from "../systems/BulletSystem";
import { CameraSystem } from "../systems/CameraSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { CountdownSystem } from "../systems/CountdownSystem";
import type { DeathSystem } from "../systems/DeathSystem";
import { EnemyShootingSystem } from "../systems/EnemyShootingSystem";
import { EnemySystem } from "../systems/EnemySystem";
import { EntityPoolSystem } from "../systems/EntityPoolSystem";
import { GrazeSystem } from "../systems/GrazeSystem";
import { InputSystem } from "../systems/InputSystem";
import { PickupDropSystem } from "../systems/PickupDropSystem";
import { PickupSystem } from "../systems/PickupSystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { RendererSystem } from "../systems/RendererSystem";
import { SpawnSystem } from "../systems/SpawnSystem";
import { UpgradeSystem } from "../systems/UpgradeSystem";
import { WaveFlowSystem } from "../systems/WaveFlowSystem";
import { WaveOrchestrator } from "../systems/WaveOrchestrator";
import { ZoneSystem } from "../systems/ZoneSystem";
import type { Hooks } from "./GameHooks";
import { AudioManager } from "../systems/AudioManager";
import { GameLoop } from "./GameLoop";
import { GameFrame } from "./GameFrame";
import { GameRender } from "./GameRender";
import { GameListeners } from "./GameListeners";
import { GameStart } from "./GameStart";
import { GameUpgrades } from "./GameUpgrades";

export class GameContext {
  readonly hooks: Hooks;
  readonly storage: PersistencePort;

  readonly audio = new AudioManager();
  readonly renderer: Renderer;
  readonly eventBus = new EventBus();

  readonly cameraSystem: CameraSystem;
  readonly debugSystem: DebugSystem;
  readonly entityPool: EntityPoolSystem;
  readonly scoringSystem: ScoringSystem;
  readonly upgradeSystem: UpgradeSystem;

  readonly inputSystem: InputSystem;
  readonly input: InputManager;
  readonly fx: Fx;
  readonly starfield: Starfield;
  readonly asteroidField: AsteroidField;
  readonly riftField: RiftField;
  readonly rendererSystem: RendererSystem;
  readonly menuScene: MenuScene;

  readonly bonusManager: BonusManager;
  readonly grazeSystem: GrazeSystem;
  readonly playerSystem: PlayerSystem;
  readonly abilitySystem: AbilitySystem;
  readonly enemySystem: EnemySystem;
  readonly enemyShootingSystem: EnemyShootingSystem;
  readonly bulletSystem: BulletSystem;
  readonly spawnSystem: SpawnSystem;
  readonly weaponManager: WeaponManager;
  readonly countdownSystem: CountdownSystem;
  readonly applyPickupSystem: ApplyPickupSystem;
  readonly pickupSystem: PickupSystem;
  readonly loadoutSystem: LoadoutSystem;
  readonly dropSystem: PickupDropSystem;
  readonly collisionSystem: CollisionSystem;
  readonly zoneSystem: ZoneSystem;
  readonly waveOrchestrator: WaveOrchestrator;
  readonly waveFlowSystem: WaveFlowSystem;

  readonly fsm: GameStateMachine<GameFSMContext>;
  deathSystem!: DeathSystem;

  readonly render: GameRender;
  readonly frame: GameFrame;
  readonly listeners: GameListeners;
  readonly start: GameStart;
  readonly upgrades: GameUpgrades;
  readonly loop: GameLoop;

  /** Стартовая волна (для отладки/URL-параметра). */
  startWave = 1;

  private _minerals = 0;
  private countId = 0;
  private _paused = false;

  constructor(canvas: HTMLCanvasElement, hooks: Hooks, storage: PersistencePort) {
    this.hooks = hooks;
    this.storage = storage;

    this.renderer = new Renderer(canvas);
    this.scoringSystem = new ScoringSystem({}, storage);
    this.upgradeSystem = UpgradeSystem.create(storage);

    this.cameraSystem = new CameraSystem();
    this.debugSystem = new DebugSystem();
    this.entityPool = new EntityPoolSystem();

    this.resize();

    this.inputSystem = new InputSystem(canvas, {
      onAimUpdate: (mouseX, mouseY, winW, winH) => this.handleAim(mouseX, mouseY, winW, winH),
      onFiringChanged: (firing) => this.weaponManager.setManualFiring(firing),
    });

    this.waveOrchestrator = new WaveOrchestrator({
      hooks: {
        onBanner: (title, sub, color) => hooks.onBanner({ title, sub, color }),
        onToast: (text, color) => hooks.onToast({ text, color }),
        hitPlayer: (amount) => this.playerSystem.hit(amount),
        shakeScreen: (strength) => this.fx.addShake(strength),
        onWaveAdvanced: () => {
          const nextWave = this.waveOrchestrator.wave;
          this.enemySystem.setWave(nextWave);
          this.enemyShootingSystem.setWave(nextWave);
          this.countdownSystem.startWave(nextWave);
        },
      },
      playerMaxSpeed: PLAYER_MAX_SPEED,
    });

    this.zoneSystem = new ZoneSystem({
      getZoneState: () => this.waveOrchestrator.zoneState,
      getPlayerRef: () => this.playerSystem.getPlayerRef(),
      getEnemyList: () => this.entityPool.enemyList,
      getAsteroids: () =>
        this.asteroidField.asteroidList as Array<{ x: number; y: number; r: number; vx: number; vy: number }>,
    });

    this.input = new InputManager({
      onPauseKey: () => this.togglePause(),
      onLoseFocus: () => {
        if (this.fsm.is("playing", "active", "dying") && !this._paused) {
          this.togglePause();
          this.audio.setSuspended(true);
        }
      },
    });

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

    this.menuScene = new MenuScene(
      this.starfield,
      this.asteroidField,
      this.riftField,
      this.rendererSystem,
      this.renderer,
      this.cameraSystem.getRawCamera(),
    );

    this.bonusManager = new BonusManager();
    this.grazeSystem = new GrazeSystem(this.eventBus, this.fx, this.scoringSystem);
    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.input,
      this.fx,
      () => this.grazeSystem.getSpeedMult(),
    );

    this.abilitySystem = new AbilitySystem(
      this.input,
      {
        getPlayerX: () => this.playerSystem.getPlayerRef().x,
        getPlayerY: () => this.playerSystem.getPlayerRef().y,
        movePlayerTo: (x, y) => this.playerSystem.teleportTo(x, y),
        getEnemies: () => this.entityPool.enemyList,
        killEnemy: (enemy) => this.killEnemy(enemy),
      },
      this.fx,
    );

    this.enemySystem = new EnemySystem();
    this.enemyShootingSystem = new EnemyShootingSystem(this.eventBus, this.audio);
    this.bulletSystem = new BulletSystem();
    this.spawnSystem = new SpawnSystem({
      eventBus: this.eventBus,
      riftField: this.riftField,
    });

    this.weaponManager = new WeaponManager(
      {
        getPlayer: () => this.playerSystem.getPlayerRef(),
        getEnemies: () => this.entityPool.enemyList,
        getBullets: () => this.entityPool.bulletList,
        getDrones: () => this.entityPool.allyDroneList,
        getBonuses: () => this.bonusManager.getBonuses(),
        getWeaves: () => this.entityPool.weaveList,
        getBeams: () => this.entityPool.beamList,
        killEnemy: (enemy) => this.killEnemy(enemy),
      },
      (id) => this.onWeaponFired(id),
    );

    this.countdownSystem = new CountdownSystem({
      hooks: {
        onBanner: (b) => hooks.onBanner(b),
        onToast: (t) => hooks.onToast(t),
        onCountdown: (c) => {
          if (c) {
            this.countId++;
            hooks.onCountdown({ id: this.countId, label: c.label, value: c.value });
          } else {
            hooks.onCountdown(null);
          }
        },
        countdownDone: () => {
          this.fsm.fire("countdown_done");
        },
      },
      eventBus: this.eventBus,
    });

    this.applyPickupSystem = new ApplyPickupSystem({
      heal: (amount: number) => this.playerSystem.heal(amount),
      applyBonus: (pickup: PickupKind) => this.bonusManager.applyPickup(pickup),
      equipWeapon: (id: WeaponId) => this.weaponManager.equipWeapon(id),
      grantAbility: (id) => this.abilitySystem.grant(id),
      addMinerals: (count: number) => this.addMinerals(count),
      addScore: (amount: number) => this.scoringSystem.add(amount),
      playPickupSound: (kind: string) => this.audio.playPickupSound(kind as PickupKind),
    });

    this.pickupSystem = new PickupSystem();

    this.loadoutSystem = new LoadoutSystem(
      {
        getWeaponSlots: () => this.weaponManager.getSlots(),
        getBonusSlots: () => this.bonusManager.getSlots(),
        getAbilitySlots: () => this.abilitySystem.getSlots(),
      },
      this.eventBus,
    );

    this.dropSystem = new PickupDropSystem(this.eventBus, {
      spawnPickup: (kind, x, y, vx, vy) => this.entityPool.spawnPickup(kind, x, y, vx, vy),
      addParts: (n) => this.upgradeSystem.addParts(n),
    });

    this.collisionSystem = new CollisionSystem(this.eventBus);

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

    const fsmCtx: GameFSMContext = {
      onPlayerDeath: () => {
        this.deathSystem.startDeath();
      },
      onDeathAnimationEnd: () => {
        this.deathSystem.onFinishDeath();
      },
      onReturnToMenu: () => {},
      onStartRun: (_wave: number) => {
        this.startRun();
      },
      countdownDone: () => {
        this.fsm.fire("countdown_done");
      },
      onPause: (paused: boolean) => {
        this.hooks.onPause(paused);
        this.audio.setSuspended(paused);
      },
    };
    this.fsm = new GameStateMachine<GameFSMContext>("menu", GAME_TRANSITIONS, fsmCtx);

    // Scoring должен подписаться первым, чтобы killedWave обновлялся
    // до проверки завершения волны в GameListeners.
    this.scoringSystem.subscribeToEvents(this.eventBus);

    // Композиционные слои: слушатели, кадр, рендер, старт, апгрейды, цикл.
    this.listeners = new GameListeners(this);
    this.render = new GameRender(this);
    this.frame = new GameFrame(this, this.render);
    this.start = new GameStart(this);
    this.upgrades = new GameUpgrades(this);
    this.loop = new GameLoop((dt) => this.frame.step(dt), () => this.resize());
  }

  // ===== Lifecycle helpers =====

  get paused(): boolean {
    return this._paused;
  }

  setPaused(paused: boolean): void {
    this._paused = paused;
  }

  togglePause(): void {
    if (this.fsm.is("menu", "over")) return;
    this.setPaused(!this._paused);
    this.hooks.onPause(this._paused);
    this.audio.setSuspended(this._paused);
  }

  get loopTime(): number {
    return this.loop ? this.loop.time : 0;
  }

  loopResetTime(): void {
    this.loop?.resetTime();
  }

  fps(): number {
    return this.loop ? this.loop.fps() : 60;
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.resize(w, h);
    this.cameraSystem.resize(w, h, Math.min(window.devicePixelRatio || 1, 1.75));
  }

  // ===== Frame entry =====

  handleDebugKeys(_dt: number): void {
    this.debugSystem.handleDebugKeys(
      (key) => this.input.isKey(key),
      this.fsm.is("over"),
      () => this.fsm.fire("restart"),
    );
  }

  startRun(): void {
    if (this.fsm.is("menu", "over")) {
      this.fsm.fire("start");
    }
    this.start.startRun();
  }

  toMenu(): void {
    this.start.toMenu();
  }

  // ===== Presentation helpers =====

  /** Позиция игрока для систем (world coordinates + скорость). */
  getPlayerPosition(): { x: number; y: number; vx: number; vy: number } {
    const state = this.playerSystem.getPlayerRef();
    return { x: state.x, y: state.y, vx: state.vx, vy: state.vy };
  }

  /** Границы зоны для врагов/констрейнтов. */
  getZoneBounds(): { x: number; y: number; radius: number; active: boolean } {
    const z = this.waveOrchestrator.zoneState;
    return { x: z.x, y: z.y, radius: z.radius, active: z.active };
  }

  /** Снимок игрока в едином виде WorldFrame (для кадра и рендера). */
  getPlayerWorld(): PlayerWorld {
    const s = this.playerSystem.getPlayerRef();
    return {
      x: s.x,
      y: s.y,
      angle: s.angle,
      vx: s.vx || 0,
      vy: s.vy || 0,
      r: PLAYER_HITBOX_RADIUS,
      hp: s.hp,
      maxHp: s.maxHp,
      invuln: s.invuln,
      mass: s.mass || 1,
      thrusting: s.thrusting,
      core: s.core,
    };
  }

  // ===== Minerals =====

  get minerals(): number {
    return this._minerals;
  }

  addMinerals(count: number): void {
    this._minerals += count;
  }

  resetMinerals(): void {
    this._minerals = 0;
  }

  // ===== Upgrades application (dedup between start/refresh) =====

  applyUpgrades(withResetHp: boolean): void {
    this.upgradeSystem.applyToSystems({
      setMaxHp: (v) => this.playerSystem.setMaxHp(v),
      setWeaponUpgrades: (upgrades) => this.weaponManager.applyUpgrades(upgrades),
      setSpeedMult: (v) => this.playerSystem.setSpeedMult(v),
      setCoreRadius: (v) => this.playerSystem.setCoreRadius(v),
      setDashDurationMult: (v) => this.bonusManager.setDashDurationMult(v),
      setMomentumLevel: (v) => this.grazeSystem.setMomentumLevel(v),
      ...(withResetHp ? { resetHp: () => this.playerSystem.resetHp() } : {}),
    });
  }

  // ===== Entities / combat =====

  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null): void {
    const playerPos = this.getPlayerPosition();
    this.enemySystem.spawn(kind, x, y, parent, this.entityPool.enemyList, playerPos);
  }

  /** Единый путь гибели: публикует enemy_killed (дроп, счёт, волна). */
  killEnemy(enemy: Enemy): void {
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

  private handleAim(mouseX: number, mouseY: number, winW: number, winH: number): void {
    const cp = this.cameraSystem.getPosition();
    const worldX = cp.x + (mouseX - winW / 2) / cp.zoom;
    const worldY = cp.y + (mouseY - winH / 2) / cp.zoom;
    const player = this.playerSystem.getPlayerRef();
    const angle = Math.atan2(worldY - player.y, worldX - player.x);
    this.weaponManager.setManualAim(angle);
  }

  private onWeaponFired(id: WeaponId): void {
    if (id === "drone") {
      this.audio.playDroneShot();
    } else {
      this.audio.playShoot();
    }
  }

  destroy(): void {
    this.listeners.destroy();
    this.loop.destroy();
    this.inputSystem.destroy();
    this.input.destroy();
    this.audio.destroy();
  }
}