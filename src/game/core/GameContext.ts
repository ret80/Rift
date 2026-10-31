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
import { getViewport, readUrlParam } from "./env";
import { EcsWorld } from "../ecs";
import { SystemSchedule } from "../ecs/SystemSchedule";
import { AllyDroneSystem } from "../ecs/systems/AllyDroneSystem";
import {
  BaseRenderer,
  PicoGLRenderer,
  NullRenderer,
  getDpr,
  type IRenderer,
} from "../render/index";
import { PhysicsSystem } from "../physics/index";
import type { PhysicsEngineId } from "../physics/index";
import { createPhysicsEngine, normalizePhysicsEngine } from "../physics/index";
import { DebugSystem } from "../systems/DebugSystem";
import { MenuScene } from "../presentation/menu/MenuScene";
import { ScoringSystem } from "../systems/ScoringSystem";
import { EventBus } from "./EventBus";
import type { GameFSMContext } from "./GameFSM";
import { GAME_TRANSITIONS } from "./GameFSM";
import { GameStateMachine } from "./StateMachine";
import type { WorldFrame } from "./WorldFrame";
import type { PlayerRef } from "../ecs";
import { AsteroidField } from "../asteroids";
import { Fx } from "../fx";
import { InputManager } from "../input";
import { RiftField } from "../rifts";
import { Starfield } from "../starfield";
import type { EnemyRef } from "../ecs";
import { LoadoutSystem } from "../loadout/LoadoutSystem";
import { BonusManager } from "../loadout/bonuses/BonusManager";
import type { WeaponId, PlayerSnapshot } from "../weapons/Weapon";
import { WeaponManager } from "../weapons/WeaponManager";
import { WEAPON_CATALOG } from "../weapons/WeaponCatalog";
import { AbilitySystem } from "../abilities/AbilitySystem";
import { ApplyPickupSystem } from "../systems/ApplyPickupSystem";
import { CameraSystem } from "../systems/CameraSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { CountdownSystem } from "../systems/CountdownSystem";
import type { DeathSystem } from "../systems/DeathSystem";
import { GrazeSystem } from "../systems/GrazeSystem";
import { InputSystem } from "../systems/InputSystem";
import { PickupDropSystem } from "../systems/PickupDropSystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { RendererSystem } from "../systems/RendererSystem";
import { ShieldSystem } from "../systems/ShieldSystem";
import { SpawnSystem, type SpawnDependencies } from "../systems/SpawnSystem";
import { UpgradeSystem } from "../systems/UpgradeSystem";
import { WaveFlowSystem } from "../systems/WaveFlowSystem";
import { WaveOrchestrator } from "../systems/WaveOrchestrator";
import { ZoneSystem } from "../systems/ZoneSystem";
import type { Hooks } from "./GameHooks";
import { AudioManager } from "../systems/AudioManager";
import { GameLoop } from "./GameLoop";
import { GameFrame } from "./GameFrame";
import { GameRender } from "./GameRender";
import { PresentationFrame } from "./PresentationFrame";
import { GameListeners } from "./GameListeners";
import { GameStart } from "./GameStart";
import { GameUpgrades } from "./GameUpgrades";

export class GameContext {
  readonly hooks: Hooks;
  readonly storage: PersistencePort;

  readonly audio = new AudioManager();
  readonly renderer: IRenderer;
  readonly physics: PhysicsSystem;
  readonly eventBus = new EventBus();

  readonly cameraSystem: CameraSystem;
  readonly debugSystem: DebugSystem;
  readonly scoringSystem: ScoringSystem;
  readonly upgradeSystem: UpgradeSystem;
  readonly ecs: EcsWorld;
  /** Явный порядок ECS-систем по фазам. */
  readonly schedule = new SystemSchedule();

  readonly inputSystem: InputSystem;
  readonly input: InputManager;
  readonly fx: Fx;
  readonly starfield: Starfield;
  readonly asteroidField: AsteroidField;
  readonly riftField: RiftField;
  readonly rendererSystem: RendererSystem;
  readonly menuScene: MenuScene;

  readonly bonusManager: BonusManager;
  readonly shieldSystem: ShieldSystem;
  readonly grazeSystem: GrazeSystem;
  readonly playerSystem: PlayerSystem;
  readonly abilitySystem: AbilitySystem;
  readonly spawnSystem: SpawnSystem;
  readonly weaponManager: WeaponManager;
  readonly countdownSystem: CountdownSystem;
  readonly applyPickupSystem: ApplyPickupSystem;
  readonly loadoutSystem: LoadoutSystem;
  readonly dropSystem: PickupDropSystem;
  readonly collisionSystem: CollisionSystem;
  readonly zoneSystem: ZoneSystem;
  readonly waveOrchestrator: WaveOrchestrator;
  readonly waveFlowSystem: WaveFlowSystem;

  readonly fsm: GameStateMachine<GameFSMContext>;
  deathSystem!: DeathSystem;

  readonly render: GameRender;
  readonly presentation: PresentationFrame;
  readonly frame: GameFrame;
  readonly listeners: GameListeners;
  readonly start: GameStart;
  readonly upgrades: GameUpgrades;
  readonly loop: GameLoop;

  /** Стартовая волна (для отладки/URL-параметра). */
  startWave = 1;

  /** Физический движок, выбранный в настройках (persisted). */
  private _physicsEngineId: PhysicsEngineId = "planck";
  get physicsEngineId(): PhysicsEngineId {
    return this._physicsEngineId;
  }

  private countId = 0;
  private _paused = false;

  /** Размер вьюпорта в CSS-пикселях (обновляется в resize). */
  readonly viewport = { width: 0, height: 0 };
  /** Переиспользуемое мировое сечение кадра (создаётся при первом buildWorld). */
  private worldFrame: WorldFrame | null = null;

  /** Сменить физический движок (выбор в меню настроек). */
  setPhysicsEngine(id: PhysicsEngineId): void {
    if (id === this._physicsEngineId) return;
    this._physicsEngineId = id;
    this.physics.setEngine(createPhysicsEngine(id));
  }

  constructor(canvas: HTMLCanvasElement, hooks: Hooks, storage: PersistencePort) {
    this.hooks = hooks;
    this.storage = storage;

    // Рендер-бэкенд: PicoGL по умолчанию; raw WebGL и NullRenderer — через
    // URL-параметр (?renderer=webgl | ?renderer=null). NullRenderer рисует на
    // Canvas 2D и копит debug-метрики — удобен в средах без WebGL.
    const rendererParam = readUrlParam("renderer");
    const useNull = rendererParam === "null";
    const usePicoGL = !useNull && (rendererParam === null || rendererParam === "picogl");
    this.renderer = useNull
      ? new NullRenderer(canvas)
      : usePicoGL
        ? new PicoGLRenderer(canvas)
        : new BaseRenderer(canvas);

    // Физический бэкенд: выбирается через меню настроек (persisted) или
    // URL-параметр ?physics=<id>. По умолчанию — Planck.js.
    const physicsParam = readUrlParam("physics");
    this.physics = new PhysicsSystem(
      createPhysicsEngine(normalizePhysicsEngine(physicsParam ?? this.physicsEngineId)),
      // Источник тел кадра: ECS-компоненты (игрок/враг/астероид/пикап).
      // Читается лениво при каждом шаге физики (внутри engine.run(dt)), поэтому
      // this.ecs к моменту вызова уже создан.
      () => this.ecs.physicsBodies(),
    );
    // Физика — ECS-система; регистрируется позже (см. блок после weaponManager).

    this.scoringSystem = new ScoringSystem({}, storage);
    this.upgradeSystem = UpgradeSystem.create(storage);

    this.cameraSystem = new CameraSystem();
    this.debugSystem = new DebugSystem();
    this.ecs = new EcsWorld(this.eventBus, () => this.getPlayerHitbox(), {
      getPlayer: () => this.getPlayerPosition(),
      getZoneBounds: () => this.getZoneBounds(),
      getIntegrate: () => !this.physics.integratesPositions,
      getPlayerMotion: () => this.getPlayerPosition(),
      isCombatActive: () => this.fsm.is("playing", "active"),
      audio: this.audio,
    });
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
          this.ecs.setEnemyWave(nextWave);
          this.countdownSystem.startWave(nextWave);
        },
      },
      playerMaxSpeed: PLAYER_MAX_SPEED,
    });

    this.zoneSystem = new ZoneSystem({
      getZoneState: () => this.waveOrchestrator.zoneState,
      getPlayerRef: () => this.ecs.playerRef(),
      getAsteroids: () => this.ecs.asteroids(),
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

    this.fx = new Fx(this.ecs);
    this.starfield = new Starfield();

    this.asteroidField = new AsteroidField({
      addScore: (n) => this.scoringSystem.add(n),
      spawnPickup: (kind, x, y, vx, vy) => this.ecs.spawnPickup(kind, x, y, vx, vy),
      fx: this.fx,
      audio: this.audio,
      ecs: this.ecs,
    }, this.eventBus);

    this.riftField = new RiftField({
      spawnEnemy: (kind, x, y) => this.spawnEnemy(kind, x, y, null),
      fx: this.fx,
      audio: this.audio,
    }, this.ecs);
    // RiftField — ECS-система: регистрируется в общем schedule ниже.

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
    this.bonusManager.setHealHook((amount) => this.playerSystem.heal(amount));
    this.shieldSystem = new ShieldSystem();
    this.grazeSystem = new GrazeSystem(this.eventBus, this.fx, this.scoringSystem);
    // State/timer-домены теперь — ECS-системы: тикают внутри engine.run(dt).
    // Игрок — Singleton-сущность ECS-мира: базовые компоненты (Position/Velocity/
    // Radius/Life) + узкий PlayerComponent. PlayerSystem работает через живую
    // связку PlayerRef. Никакого «зеркала»-состояния нет.
    this.ecs.registerPlayer();
    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.input,
      this.fx,
      () => this.ecs.playerRef(),
      () => !this.physics.integratesPositions,
    );
    this.playerSystem.setShield(this.shieldSystem);

    this.abilitySystem = new AbilitySystem(
      this.input,
      {
        getPlayerX: () => this.playerSystem.getPlayerRef()?.position.x ?? 0,
        getPlayerY: () => this.playerSystem.getPlayerRef()?.position.y ?? 0,
        movePlayerTo: (x, y) => this.playerSystem.teleportTo(x, y),
        getEnemies: () => this.ecs.enemies(),
        damageEnemy: (enemy, dmg) => this.damageEnemy(enemy, dmg),
      },
      this.fx,
    );
    // Ability — ECS-система: кулдауны/активация до игровых систем.
    this.spawnSystem = new SpawnSystem({
      riftField: this.riftField,
      getDeps: () => this.buildSpawnDeps(),
    });

    this.weaponManager = new WeaponManager(
      {
        getPlayer: () => this.getPlayerSnapshot(),
        getEnemies: () => this.ecs.enemies(),
        addBullet: (b) => this.ecs.addBullet(b),
        getDrones: () => this.ecs.allyDrones(),
        addAllyDrone: (d) => this.ecs.addAllyDrone(d),
        getBonuses: () => this.bonusManager.getBonuses(),
        getBeams: () => this.ecs.beams(),
        addBeam: (b) => this.ecs.addBeam(b),
        getZone: () => this.getZoneSnapshot(),
        damageEnemy: (enemy, dmg) => this.damageEnemy(enemy, dmg),
      },
      (id) => this.onWeaponFired(id),
    );
    // Оружие и физика — ECS-системы внутри engine.run(dt): оружие
    // спавнит пули, физика их интегрирует и собирает контакты.

    // Дроны-компаньоны: ECS-система ведёт орбиту/цель/стрельбу/гибель по компонентам.
    const allyDroneSystem = new AllyDroneSystem({
      getPlayer: () => this.ecs.playerRef(),
      getRateMult: () => this.bonusManager.getRateMult(),
      getHitChance: () => this.weaponManager.getHitChance(),
      getEnemies: () => this.ecs.enemies(),
      addBullet: (b) => this.ecs.addBullet(b),
      onDroneFired: () => this.onWeaponFired("drone"),
    });

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
      applyBonus: (pickup: PickupKind) => this.bonusManager.applyPickup(pickup),
      rechargeShield: (amount: number) => this.shieldSystem.recharge(amount),
      equipWeapon: (id: WeaponId) => this.weaponManager.equipWeapon(id),
      grantAbility: (id) => this.abilitySystem.grant(id),
      playPickupSound: (kind: string) => this.audio.playPickupSound(kind as PickupKind),
    });

    this.loadoutSystem = new LoadoutSystem(
      {
        getWeaponSlots: () => this.weaponManager.getSlots(),
        getBonusSlots: () => this.bonusManager.getSlots(),
        getAbilitySlots: () => this.abilitySystem.getSlots(),
        getSystemSlots: () => this.shieldSystem.getSlots(),
      },
      this.eventBus,
    );
    // Loadout — ECS-система: пересборка HUD-слотов после игровых систем.

    this.dropSystem = new PickupDropSystem(this.eventBus, {
      spawnPickup: (kind, x, y, vx, vy) => this.ecs.spawnPickup(kind, x, y, vx, vy),
      addParts: (n) => this.upgradeSystem.addParts(n),
    });

    this.collisionSystem = new CollisionSystem(
      this.eventBus,
      this.physics,
      this.ecs,
      () => this.buildWorld(),
      () => this.waveOrchestrator.wave,
    );
    // Коллизии — ECS-система: после физики, до волны/спавна.

    this.waveFlowSystem = new WaveFlowSystem({
      orchestrator: this.waveOrchestrator,
      scoringSystem: this.scoringSystem,
      spawnSystem: this.spawnSystem,
      upgradeSystem: this.upgradeSystem,
      countdownSystem: this.countdownSystem,
      getEnemyList: () => this.ecs.enemies(),
      getPlayerPosition: () => this.getPlayerPosition(),
    });
    // Зона и волны — ECS-системы: waveFlow обновляет zoneState, zoneSystem
    // клампит игрока/астероиды, ZoneClampSystem клампит врагов — всё после
    // физики/коллизий.
    // Спавн — ECS-система: после коллизий, до волны/зоны.

    // Единый явный список систем: фазы задают крупный порядок, порядок
    // добавления внутри фазы сохраняется.
    this.schedule.add(this.scoringSystem);
    this.schedule.add(this.bonusManager);
    this.schedule.add(this.shieldSystem);
    this.schedule.add(this.countdownSystem);
    this.schedule.add(this.abilitySystem);
    this.schedule.add(this.playerSystem);
    for (const system of this.ecs.systems) this.schedule.add(system);
    this.schedule.add(this.riftField);
    this.schedule.add(allyDroneSystem);
    this.schedule.add(this.weaponManager);
    this.schedule.add(this.physics);
    this.schedule.add(this.collisionSystem);
    this.schedule.add(this.spawnSystem);
    this.schedule.add(this.waveFlowSystem);
    this.schedule.add(this.zoneSystem);
    this.schedule.add(this.loadoutSystem);
    this.schedule.install(this.ecs);

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
    this.presentation = new PresentationFrame(this);
    this.frame = new GameFrame(this, this.presentation);
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
    const { width, height } = getViewport();
    this.viewport.width = width;
    this.viewport.height = height;
    this.renderer.resize(width, height);
    this.cameraSystem.resize(width, height, getDpr());
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
    const ref = this.ecs.playerRef();
    return ref
      ? { x: ref.position.x, y: ref.position.y, vx: ref.velocity.vx, vy: ref.velocity.vy }
      : { x: 0, y: 0, vx: 0, vy: 0 };
  }

  /** Хитбокс игрока в игровых координатах (для систем пикапов). */
  private getPlayerHitbox(): { x: number; y: number; r: number } {
    const ref = this.ecs.playerRef();
    return ref
      ? { x: ref.position.x, y: ref.position.y, r: ref.radius.r }
      : { x: 0, y: 0, r: PLAYER_HITBOX_RADIUS };
  }

  /** Границы зоны для врагов/констрейнтов. */
  getZoneBounds(): { x: number; y: number; radius: number; active: boolean } {
    const z = this.waveOrchestrator.zoneState;
    return { x: z.x, y: z.y, radius: z.radius, active: z.active };
  }

  /** Снимок игровой зоны для оружия (луч лазера упирается в её край). */
  getZoneSnapshot(): { active: boolean; x: number; y: number; radius: number } | null {
    const z = this.waveOrchestrator.zoneState;
    if (!z.active || z.radius <= 0) return null;
    return { active: z.active, x: z.x, y: z.y, radius: z.radius };
  }

  /** Живая связка компонентов игрока (единый вид WorldFrame для кадра и рендера). */
  getPlayerWorld(): PlayerRef {
    const ref = this.ecs.playerRef();
    if (ref) return ref;
    // Фолбэк формально не достижим в работающем мире, но нужен для типов.
    throw new Error("playerRef is null while world is active");
  }

  /** Снимок игрока для WeaponManager (PlayerSnapshot из Weapon.ts). */
  getPlayerSnapshot(): PlayerSnapshot {
    const ref = this.ecs.playerRef();
    return ref
      ? {
          x: ref.position.x,
          y: ref.position.y,
          vx: ref.velocity.vx,
          vy: ref.velocity.vy,
          hp: ref.life.remaining,
          maxHp: ref.life.max,
        }
      : { x: 0, y: 0, vx: 0, vy: 0, hp: 0, maxHp: 0 };
  }

  /** Единое мировое сечение для систем и рендера (переиспользуемый буфер). */
  buildWorld(): WorldFrame {
    const player = this.ecs.playerRef();
    if (!player) throw new Error("buildWorld: playerRef is null");
    const zoneState = this.waveOrchestrator.zoneState;

    const world = this.worldFrame ?? (this.worldFrame = {
      player,
      enemies: [],
      bullets: [],
      enemyBullets: [],
      pickups: [],
      allyDrones: [],
      beams: [],
      asteroids: [],
      zone: null,
    });

    world.player = player;
    this.ecs.enemies(world.enemies);
    this.ecs.bullets(world.bullets);
    this.ecs.enemyBullets(world.enemyBullets);
    this.ecs.pickups(world.pickups);
    this.ecs.allyDrones(world.allyDrones);
    this.ecs.beams(world.beams);
    this.ecs.asteroids(world.asteroids);
    world.zone = zoneState && zoneState.active ? zoneState : null;

    return world;
  }

  /** Зависимости спавна для engine.run(dt) (SpawnSystem). */
  private buildSpawnDeps(): SpawnDependencies {
    const player = this.getPlayerWorld();
    return {
      countdownSystem: this.countdownSystem,
      zoneState: this.waveOrchestrator.zoneState,
      riftField: this.riftField,
      hooks: { onToast: (data) => this.hooks.onToast(data) },
      wave: this.waveOrchestrator.wave,
      killedWave: this.scoringSystem.killedWave,
      playerX: player.position.x,
      playerY: player.position.y,
    };
  }

  // ===== Upgrades application (dedup between start/refresh) =====

  applyUpgrades(withResetHp: boolean): void {
    this.weaponManager.setLoadout(this.upgradeSystem.loadout);
    this.weaponManager.setDroneFleet(this.upgradeSystem.getDroneFleetSpec());
    this.upgradeSystem.applyToSystems({
      setMaxHp: (v) => this.playerSystem.setMaxHp(v),
      setWeaponUpgrades: (upgrades) => this.weaponManager.applyUpgrades(upgrades),
      setSpeedMult: (v) => this.playerSystem.setSpeedMult(v),
      setShieldBlockLevel: (v) => this.shieldSystem.setBlockLevel(v),
      setShieldRegenLevel: (v) => this.shieldSystem.setRegenLevel(v),
      setShieldOwned: (v) => this.shieldSystem.setOwned(v),
      setRateDurationMult: (v) => this.bonusManager.setRateDurationMult(v),
      setHealDurationMult: (v) => this.bonusManager.setHealDurationMult(v),
      setHealRateMult: (v) => this.bonusManager.setHealRateMult(v),
      ...(withResetHp ? { resetHp: () => this.playerSystem.resetHp() } : {}),
    });
  }

  // ===== Entities / combat =====

  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: EnemyRef | null): void {
    const playerPos = this.getPlayerPosition();
    this.ecs.spawnEnemy(kind, x, y, parent, playerPos);
  }

  /**
   * Единственный путь урона врагу для оружия и способностей.
   * HP/вспышка/смерть и публикация `enemy_killed` — в EnemyLifecycle.
   */
  private damageEnemy(enemy: EnemyRef, dmg: number): boolean {
    const id = enemy.marker.ecsId;
    if (id === null || id === undefined) return false;
    return this.ecs.damageEnemy(id, dmg);
  }

  private handleAim(mouseX: number, mouseY: number, winW: number, winH: number): void {
    const cp = this.cameraSystem.getPosition();
    const worldX = cp.x + (mouseX - winW / 2) / cp.zoom;
    const worldY = cp.y + (mouseY - winH / 2) / cp.zoom;
    const player = this.ecs.playerRef();
    if (!player) return;
    const angle = Math.atan2(worldY - player.position.y, worldX - player.position.x);
    this.weaponManager.setManualAim(angle);
  }

  private onWeaponFired(id: WeaponId): void {
    if (WEAPON_CATALOG[id].fireSound === "droneShot") {
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
    this.physics.clear();
    this.renderer.destroy?.();
  }
}