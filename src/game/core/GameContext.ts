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
import { EcsWorld } from "../ecs";
import { AllyDroneSystem } from "../ecs/systems/AllyDroneSystem";
import { BaseRenderer, PicoGLRenderer, NullRenderer, type IRenderer } from "../render/index";
import { PhysicsSystem } from "../physics/index";
import type { PhysicsEngineId } from "../physics/index";
import { createPhysicsEngine, normalizePhysicsEngine } from "../physics/index";
import { DebugSystem } from "../systems/DebugSystem";
import { MenuScene } from "../systems/MenuScene";
import { ScoringSystem } from "../systems/ScoringSystem";
import { EventBus } from "./EventBus";
import type { GameFSMContext } from "./GameFSM";
import { GAME_TRANSITIONS } from "./GameFSM";
import { GameStateMachine } from "./StateMachine";
import type { AsteroidWorld, PlayerWorld, WorldFrame } from "./WorldFrame";
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
    const rendererParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("renderer")
        : null;
    const useNull = rendererParam === "null";
    const usePicoGL = !useNull && (rendererParam === null || rendererParam === "picogl");
    this.renderer = useNull
      ? new NullRenderer(canvas)
      : usePicoGL
        ? new PicoGLRenderer(canvas)
        : new BaseRenderer(canvas);

    // Физический бэкенд: выбирается через меню настроек (persisted) или
    // URL-параметр ?physics=<id>. По умолчанию — Planck.js.
    const physicsParam =
      typeof window !== "undefined"
        ? new URLSearchParams(window.location.search).get("physics")
        : null;
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
      getPlayerRef: () => this.playerSystem.getPlayerRef(),
      getAsteroids: () =>
        this.ecs.asteroids() as Array<{ x: number; y: number; r: number; vx: number; vy: number }>,
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
    // RiftField — теперь ECS-система: жизненный цикл ведёт engine.run.
    this.ecs.engine.systems.add(this.riftField);

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
    this.ecs.engine.systems.add(this.scoringSystem);
    this.ecs.engine.systems.add(this.bonusManager);
    this.ecs.engine.systems.add(this.shieldSystem);
    // Игрок — Singleton-сущность ECS-мира: компонент владеет состоянием,
    // PlayerSystem его потребляет. Никакого «зеркала»-состояния нет.
    const playerState = this.ecs.registerPlayer();
    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.input,
      this.fx,
      playerState,
      () => !this.physics.integratesPositions,
    );
    this.playerSystem.setShield(this.shieldSystem);
    this.ecs.engine.systems.add(this.playerSystem);

    this.abilitySystem = new AbilitySystem(
      this.input,
      {
        getPlayerX: () => this.playerSystem.getPlayerRef().x,
        getPlayerY: () => this.playerSystem.getPlayerRef().y,
        movePlayerTo: (x, y) => this.playerSystem.teleportTo(x, y),
        getEnemies: () => this.ecs.enemies(),
        killEnemy: (enemy) => this.killEnemy(enemy),
        damageEnemy: (enemy, dmg) => {
          const id = enemy.ecsId;
          if (id !== null && id !== undefined) this.ecs.damageEnemy(id, dmg);
        },
      },
      this.fx,
    );
    // Ability — ECS-система (priority -8): кулдауны/активация до игровых систем.
    this.ecs.engine.systems.add(this.abilitySystem);
    this.spawnSystem = new SpawnSystem({
      eventBus: this.eventBus,
      riftField: this.riftField,
      getDeps: () => this.buildSpawnDeps(),
    });

    this.weaponManager = new WeaponManager(
      {
        getPlayer: () => this.playerSystem.getPlayerRef(),
        getEnemies: () => this.ecs.enemies(),
        getBullets: () => this.ecs.bullets(),
        addBullet: (b) => this.ecs.addBullet(b),
        getDrones: () => this.ecs.allyDrones(),
        addAllyDrone: (d) => this.ecs.addAllyDrone(d),
        getBonuses: () => this.bonusManager.getBonuses(),
        getBeams: () => this.ecs.beams(),
        addBeam: (b) => this.ecs.addBeam(b),
        getZone: () => this.getZoneSnapshot(),
        killEnemy: (enemy) => this.killEnemy(enemy),
        damageEnemy: (enemy, dmg) => {
          const id = enemy.ecsId;
          if (id !== null && id !== undefined) this.ecs.damageEnemy(id, dmg);
        },
      },
      (id) => this.onWeaponFired(id),
    );
    // Оружие и физика — ECS-системы внутри engine.run(dt): оружие (priority 5)
    // спавнит пули, физика (priority 6) их интегрирует и собирает контакты.
    this.ecs.engine.systems.add(this.weaponManager);
    this.ecs.engine.systems.add(this.physics);

    // Дроны-компаньоны: ECS-система ведёт орбиту/цель/стрельбу/гибель по компонентам.
    this.ecs.engine.systems.add(new AllyDroneSystem({
      getPlayer: () => this.playerSystem.getPlayerRef(),
      getRateMult: () => this.bonusManager.getRateMult(),
      getHitChance: () => this.weaponManager.getHitChance(),
      getEnemies: () => this.ecs.enemies(),
      addBullet: (b) => this.ecs.addBullet(b),
      onDroneFired: () => this.onWeaponFired("drone"),
    }));

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
    this.ecs.engine.systems.add(this.countdownSystem);

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
    // Loadout — ECS-система (priority 12): пересборка HUD-слотов после игровых систем.
    this.ecs.engine.systems.add(this.loadoutSystem);

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
    // Коллизии — ECS-система (priority 7): после физики (6), до zone/spawn.
    this.ecs.engine.systems.add(this.collisionSystem);

    this.waveFlowSystem = new WaveFlowSystem({
      eventBus: this.eventBus,
      orchestrator: this.waveOrchestrator,
      scoringSystem: this.scoringSystem,
      spawnSystem: this.spawnSystem,
      upgradeSystem: this.upgradeSystem,
      countdownSystem: this.countdownSystem,
      getEnemyList: () => this.ecs.enemies(),
      getPlayerPosition: () => this.getPlayerPosition(),
    });
    // Зона и волны — ECS-системы внутри engine.run(dt): waveFlow (8) обновляет
    // zoneState, zoneSystem (9) клампит игрока/астероиды, ZoneClampSystem (10)
    // клампит врагов — всё после физики/коллизий (6/7).
    this.ecs.engine.systems.add(this.waveFlowSystem);
    this.ecs.engine.systems.add(this.zoneSystem);
    // Спавн — ECS-система (priority 8): после коллизий (7), до волны/зоны (9/10).
    this.ecs.engine.systems.add(this.spawnSystem);

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

  /** Хитбокс игрока в игровых координатах (для систем пикапов). */
  private getPlayerHitbox(): { x: number; y: number; r: number } {
    const state = this.playerSystem.getPlayerRef();
    return { x: state.x, y: state.y, r: PLAYER_HITBOX_RADIUS };
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
    };
  }

  /** Единое мировое сечение для систем и рендера (справочные ссылки на пулы). */
  buildWorld(): WorldFrame {
    const zoneState = this.waveOrchestrator.zoneState;
    return {
      player: this.getPlayerWorld(),
      enemies: this.ecs.enemies(),
      bullets: this.ecs.bullets(),
      enemyBullets: this.ecs.enemyBullets(),
      pickups: this.ecs.pickups(),
      allyDrones: this.ecs.allyDrones(),
      beams: this.ecs.beams(),
      asteroids: this.ecs.asteroids() as AsteroidWorld[],
      zone: zoneState && zoneState.active ? zoneState : null,
    };
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
      playerX: player.x,
      playerY: player.y,
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

  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null): void {
    const playerPos = this.getPlayerPosition();
    this.ecs.spawnEnemy(kind, x, y, parent, playerPos);
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
    this.physics.clear();
    this.renderer.destroy?.();
  }
}