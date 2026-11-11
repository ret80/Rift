/**
 * GameWorld — DOM-free игровой мир.
 *
 * Единственный источник правды симуляции: ECS-мир, системы, физика, волны,
 * оружие, враги и игрок. Мир не знает ни о canvas, ни о рендере, ни об
 * аудио-классах, ни о вводе: всё внешнее приходит через `WorldPorts` и
 * `PlayerControls`.
 *
 * Запускается и в браузере (`GameContext` — презентационный хост), и в Node
 * без `window`/`document`. Тикает только фиксированным шагом `FIXED_DT`.
 */

import { AbilitySystem } from "../abilities/AbilitySystem";
import { AsteroidField } from "../asteroids";import { EnemyKind, GRAZE_PARTS_PER_COIN, GRAZE_PARTS_WAVE_CAP,
  PLAYER_HITBOX_RADIUS,
  PLAYER_MAX_SPEED,
  WAVE_CLEAN_CLEAR_MULT,
  killPartsMultiplier,
  waveClearParts,
  waveTotalFor,
} from "../balance";
import type { WaveCompositionOverride } from "../balance/waves";
import type { PickupKind } from "../balance";
import { EcsWorld, resetGameEntityIds } from "../ecs";
import type { EnemyRef, PlayerRef } from "../ecs";
import { SystemSchedule } from "../ecs/SystemSchedule";
import { AllyDroneSystem } from "../ecs/systems/AllyDroneSystem";
import type { DroneOrder } from "../ecs/components/AllyDroneComponent";
import { Fx } from "../fx";
import { LoadoutSystem } from "../loadout/LoadoutSystem";
import { BonusManager } from "../loadout/bonuses/BonusManager";
import type { PhysicsEngineId } from "../physics/index";
import { createPhysicsEngine, PhysicsSystem } from "../physics/index";
import { RiftField } from "../rifts";
import { ApplyPickupSystem } from "../systems/ApplyPickupSystem";
import { CollisionSystem } from "../systems/CollisionSystem";
import { CountdownSystem } from "../systems/CountdownSystem";
import { DeathSystem } from "../systems/DeathSystem";
import { GrazeSystem } from "../systems/GrazeSystem";
import { PickupDropSystem } from "../systems/PickupDropSystem";
import { PlayerSystem } from "../systems/PlayerSystem";
import { ScoringSystem } from "../systems/ScoringSystem";
import { ShieldSystem } from "../systems/ShieldSystem";
import { SpawnSystem, type SpawnDependencies } from "../systems/SpawnSystem";
import { UpgradeSystem } from "../systems/UpgradeSystem";
import { WaveFlowSystem } from "../systems/WaveFlowSystem";
import { WaveOrchestrator } from "../systems/WaveOrchestrator";
import { ZoneSystem } from "../systems/ZoneSystem";
import { loadBestWave, saveBestWave } from "../upgrades";
import type { PlayerSnapshot, WeaponId } from "../weapons/Weapon";
import { WEAPON_CATALOG } from "../weapons/WeaponCatalog";
import { WeaponManager } from "../weapons/WeaponManager";
import { EventBus } from "./EventBus";
import type { GameFSMContext } from "./GameFSM";
import { GAME_TRANSITIONS } from "./GameFSM";
import { AgentControls, type PlayerControls } from "./PlayerControls";
import {
  resolveBalanceOverrides,
  type BalanceOverrides,
  type ResolvedBalanceOverrides,
} from "../balance/BalanceOverrides";
import type { SessionRecorderPort } from "./SessionRecord";
import type { PlayerAgent, PlayerView, PlayerViewBullet, PlayerViewEnemy } from "../sim/agents/PlayerAgent";
import {
  createRngStreams,
  type Rng,
  type RngStream,
  type RngStreams,
  type SeedSet,
} from "./rng";
import { FIXED_DT } from "./SimulationClock";
import { GameStateMachine } from "./StateMachine";
import { DEFAULT_WORLD_VIEW, type WorldPorts, type WorldView } from "./WorldPorts";
import type { WorldFrame } from "./WorldFrame";

/** Конфигурация мира. Seed — входные данные прогона, а не глобальная переменная. */
export interface GameWorldConfig {
  /** Seed-набор прогона (мастер-seed + потоки). */
  seed: SeedSet;
  /** Стартовая волна (для отладки и сценариев). */
  startWave?: number;
  /** Физический бэкенд: custom/planck/p2. */
  physics?: PhysicsEngineId;
  /** Порты хоста: звук, эффекты, хуки, хранилище. */
  ports: WorldPorts;
  /** Начальное сечение камеры/вьюпорта. */
  view?: Partial<WorldView>;
  /** Пропустить обратный отсчёт (headless-прогоны). */
  skipCountdown?: boolean;
  /** Тестовый режим: без сохранений и начисления деталей. */
  testMode?: boolean;
  /** Явные множители баланса; при 1.0 поведение бит-в-бит прежнее. */
  balance?: BalanceOverrides;
  /** Пассивный рекордер: только читает мир и не влияет на тики. */
  recorder?: SessionRecorderPort;
  /** Порт управления; по умолчанию — AgentControls (агент задаёт намерения). */
  controls?: PlayerControls;
  /**
   * Фабрика агента игрока. Получает поток `agent` из SeedSet, поэтому
   * решения агента не сдвигают боевые броски и считаются в rngDraws.
   */
  agent?: (rng: Rng) => PlayerAgent;
}

export class GameWorld {
  readonly ports: WorldPorts;
  readonly seedSet: SeedSet;
  readonly rngStreams: RngStreams;
  readonly eventBus: EventBus;
  readonly controls: PlayerControls;
  /** Агент игрока (null — управляет человек). */
  readonly agent: PlayerAgent | null;
  private readonly agentControls: AgentControls | null;

  readonly physics: PhysicsSystem;
  readonly ecs: EcsWorld;
  /** Явный порядок ECS-систем по фазам. */
  readonly schedule = new SystemSchedule();

  readonly scoringSystem: ScoringSystem;
  readonly upgradeSystem: UpgradeSystem;
  readonly fx: Fx;

  readonly bonusManager: BonusManager;
  readonly shieldSystem: ShieldSystem;
  readonly grazeSystem: GrazeSystem;
  readonly playerSystem: PlayerSystem;
  readonly abilitySystem: AbilitySystem;
  readonly spawnSystem: SpawnSystem;
  /** Рой дронов игрока: принимает приказы из тактического режима. */
  readonly allyDroneSystem: AllyDroneSystem;
  readonly weaponManager: WeaponManager;
  readonly countdownSystem: CountdownSystem;
  readonly applyPickupSystem: ApplyPickupSystem;
  readonly loadoutSystem: LoadoutSystem;
  readonly dropSystem: PickupDropSystem;
  readonly collisionSystem: CollisionSystem;
  readonly zoneSystem: ZoneSystem;
  readonly waveOrchestrator: WaveOrchestrator;
  readonly waveFlowSystem: WaveFlowSystem;
  readonly asteroidField: AsteroidField;
  readonly riftField: RiftField;

  readonly fsm: GameStateMachine<GameFSMContext>;
  deathSystem!: DeathSystem;

  /** Номер тика с начала мира: `time = tickIndex * FIXED_DT`. */
  tickIndex = 0;
  /** Стартовая волна (отладка/сценарий). */
  startWave: number;
  /** Тестовый режим `?test=...`: не сохранять рекорд и не начислять детали. */
  testMode: boolean;
  /** Одиночный тест уровня: после зачистки/смерти вернуть в отладку. */
  singleWaveTest = false;
  /** Тест уже завершён: защита от повторного возврата в отладку. */
  private testLevelEnded = false;
  /** Множители баланса прогона. */
  readonly balance: ResolvedBalanceOverrides;
  /** Пассивный рекордер сессии (null — запись выключена). */
  readonly recorder: SessionRecorderPort | null;

  /** Сечение камеры/вьюпорта (обновляется хостом или сценарием). */
  private _view: WorldView;

  /** Касания (graze) с последней выданной деталью — источник награды за риск. */
  private grazePartsProgress = 0;
  /** Сколько деталей за graze уже выдано на этой волне. */
  private grazePartsAwarded = 0;
  /** Игрок получил урон на текущей волне (чистая зачистка уже невозможна). */
  private waveDamaged = false;

  private worldFrame: WorldFrame | null = null;
  private readonly unsubscribers: Array<() => void> = [];

  readonly physicsEngineId: PhysicsEngineId;

  constructor(config: GameWorldConfig) {
    this.ports = config.ports;
    this.seedSet = config.seed;
    this.rngStreams = createRngStreams(config.seed);
    this.controls = config.controls ?? new AgentControls();
    this.agent = config.agent ? config.agent(this.rng("agent")) : null;
    this.agentControls = this.controls instanceof AgentControls ? this.controls : null;
    if (this.agent && !this.agentControls) {
      throw new Error("GameWorld: PlayerAgent требует AgentControls");
    }
    this.startWave = config.startWave ?? 1;
    this.testMode = config.testMode ?? false;
    this.balance = resolveBalanceOverrides(config.balance);
    this.recorder = config.recorder ?? null;
    this.physicsEngineId = config.physics ?? "planck";
    this._view = { ...DEFAULT_WORLD_VIEW, ...(config.view ?? {}) };

    // Часы мира — время тика, а не стенное время: события детерминированы.
    this.eventBus = new EventBus(() => this.time);

    this.physics = new PhysicsSystem(
      createPhysicsEngine(this.physicsEngineId),
      () => this.ecs.physicsBodies(),
    );

    this.scoringSystem = new ScoringSystem({}, this.ports.storage);
    this.upgradeSystem = UpgradeSystem.create(this.ports.storage);

    this.ecs = new EcsWorld(
      this.eventBus,
      () => this.getPlayerHitbox(),
      {
        getPlayer: () => this.getPlayerPosition(),
        getZoneBounds: () => this.getZoneBounds(),
        getIntegrate: () => !this.physics.integratesPositions,
        getPlayerMotion: () => this.getPlayerPosition(),
        isCombatActive: () => this.fsm.is("playing", "active"),
        audio: this.ports.audio,
        rngCombat: this.rng("combat"),
        rngSpawn: this.rng("spawn"),
        getEnemyHpMult: () => this.balance.enemyHpMult,
        getEnemyDamageMult: () => this.balance.enemyDamageMult,
      },
    );

    this.fx = new Fx(this.ecs, this.rng("fx"));
    const fxPort = this.ports.fx ?? this.fx;

    this.waveOrchestrator = new WaveOrchestrator({
      hooks: {
        onBanner: (banner) => this.ports.hooks.onBanner(banner),
        onToast: (text, color) => this.ports.hooks.onToast({ text, color }),
        hitPlayerRaw: (amount) => {
          this.waveDamaged = true;
          this.playerSystem.hitRaw(amount);
        },
        hitPlayerShielded: (amount) => this.hitPlayerByEnvironment(amount),
        shakeScreen: (strength) => fxPort.addShake(strength),
        onWaveCleared: (wave) => {
          if (this.singleWaveTest) {
            this.endSingleWaveTest("cleared");
            return;
          }
          if (this.testMode) return;
          // Чистая зачистка (ни одного полученного удара) платит больше:
          // награда за мастерство, а не за время в бою.
          const mult = this.waveDamaged ? 1 : WAVE_CLEAN_CLEAR_MULT;
          this.upgradeSystem.addParts(Math.round(waveClearParts(wave) * mult));
        },
        onWaveAdvanced: () => {
          const nextWave = this.waveOrchestrator.wave;
          this.ecs.setEnemyWave(nextWave);
          this.countdownSystem.startWave(nextWave);
        },
      },
      playerMaxSpeed: PLAYER_MAX_SPEED,
      getPlayerMaxHp: () => this.playerSystem.getMaxHp(),
    });

    this.zoneSystem = new ZoneSystem({
      getZoneState: () => this.waveOrchestrator.zoneState,
      getAsteroids: () => this.ecs.asteroids(),
    });

    this.asteroidField = new AsteroidField(
      {
        addScore: (n) => this.scoringSystem.add(n),
        spawnPickup: (kind, x, y, vx, vy) => this.ecs.spawnPickup(kind, x, y, vx, vy),
        fx: fxPort,
        audio: this.ports.audio,
        ecs: this.ecs,
      },
      this.eventBus,
      this.rng("drops"),
    );

    this.riftField = new RiftField(
      {
        spawnEnemy: (kind, x, y) => this.spawnEnemy(kind, x, y, null),
        fx: fxPort,
        audio: this.ports.audio,
      },
      this.ecs,
      this.rng("spawn"),
      this.rng("fx"),
    );

    this.bonusManager = new BonusManager();
    this.bonusManager.setHealHook((amount) => this.playerSystem.heal(amount));
    this.shieldSystem = new ShieldSystem();
    this.grazeSystem = new GrazeSystem(this.eventBus, fxPort, this.scoringSystem);

    // Игрок — Singleton-сущность ECS-мира.
    this.ecs.registerPlayer();
    this.playerSystem = new PlayerSystem(
      this.eventBus,
      this.controls,
      fxPort,
      () => this.ecs.playerRef(),
      () => !this.physics.integratesPositions,
    );
    this.playerSystem.setShield(this.shieldSystem);

    this.abilitySystem = new AbilitySystem(
      this.controls,
      {
        getPlayerX: () => this.playerSystem.getPlayerRef()?.position.x ?? 0,
        getPlayerY: () => this.playerSystem.getPlayerRef()?.position.y ?? 0,
        movePlayerTo: (x, y) => this.playerSystem.teleportTo(x, y),
        getEnemies: () => this.ecs.enemies(),
        damageEnemy: (enemy, dmg) => this.damageEnemy(enemy, dmg),
      },
      fxPort,
      (id) => this.eventBus.publish("ability_used", { id }),
    );

    this.spawnSystem = new SpawnSystem({
      riftField: this.riftField,
      getDeps: () => this.buildSpawnDeps(),
      random: () => this.rng("spawn").next(),
    });

    this.weaponManager = new WeaponManager(
      {
        getPlayer: () => this.getPlayerSnapshot(),
        getEnemies: () => this.ecs.enemies(),
        // Все выстрелы игрока проходят здесь — одна точка учёта для метрик.
        addBullet: (b) => {
          this.ecs.addBullet(b);
          this.eventBus.publish("player_shot", {});
        },
        getDrones: () => this.ecs.allyDrones(),
        addAllyDrone: (d) => this.ecs.addAllyDrone(d),
        getBonuses: () => this.bonusManager.getBonuses(),
        getBeams: () => this.ecs.beams(),
        addBeam: (b) => this.ecs.addBeam(b),
        damageEnemy: (enemy, dmg) => this.damageEnemy(enemy, dmg),
      },
      (id) => this.onWeaponFired(id),
      this.rng("combat"),
      this.rng("fx"),
    );

    this.allyDroneSystem = new AllyDroneSystem({
      getPlayer: () => this.ecs.playerRef(),
      getRateMult: () => this.bonusManager.getRateMult(),
      getHitChance: () => this.weaponManager.getHitChance(),
      getEnemies: () => this.ecs.enemies(),
      addBullet: (b) => this.ecs.addBullet(b),
      onDroneFired: () => this.onWeaponFired("drone"),
      getRng: () => this.rng("combat"),
    });

    this.countdownSystem = new CountdownSystem({
      hooks: {
        onBanner: (b) => this.ports.hooks.onBanner(b),
        onToast: (t) => this.ports.hooks.onToast(t),
        onCountdown: (c) => this.ports.hooks.onCountdown(c),
        countdownDone: () => {
          this.fsm.fire("countdown_done");
        },
      },
      eventBus: this.eventBus,
    });

    this.applyPickupSystem = new ApplyPickupSystem({
      applyBonus: (pickup) => this.bonusManager.applyPickup(pickup),
      rechargeShield: (amount) => this.shieldSystem.recharge(amount),
      equipWeapon: (id) => this.weaponManager.equipWeapon(id),
      grantAbility: (id) => this.abilitySystem.grant(id),
      playPickupSound: (kind) => this.ports.audio.playPickupSound(kind as PickupKind),
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

    this.dropSystem = new PickupDropSystem(this.eventBus, {
      spawnPickup: (kind, x, y, vx, vy) => this.ecs.spawnPickup(kind, x, y, vx, vy),
      addParts: (n) => {
        if (!this.testMode) this.upgradeSystem.addParts(n);
      },
      // Комбо множит детали за убийство: серия убийств — это мастерство,
      // а не количество врагов на карте.
      getPartsMultiplier: () => killPartsMultiplier(this.scoringSystem.comboMult),
    }, this.rng("drops"));

    this.collisionSystem = new CollisionSystem(
      this.eventBus,
      this.physics,
      this.ecs,
      () => this.buildWorld(),
      () => this.waveOrchestrator.wave,
    );

    this.waveFlowSystem = new WaveFlowSystem({
      orchestrator: this.waveOrchestrator,
      scoringSystem: this.scoringSystem,
      spawnSystem: this.spawnSystem,
      upgradeSystem: this.upgradeSystem,
      countdownSystem: this.countdownSystem,
      getEnemyList: () => this.ecs.enemies(),
      getPlayerPosition: () => this.getPlayerPosition(),
    });

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
    this.schedule.add(this.allyDroneSystem);
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
      onStartRun: () => {
        this.startRun();
      },
      countdownDone: () => {
        this.fsm.fire("countdown_done");
      },
      onPause: () => {},
    };
    this.fsm = new GameStateMachine<GameFSMContext>("menu", GAME_TRANSITIONS, fsmCtx);

    // Scoring подписывается первым: killedWave обновляется до проверки
    // завершения волны.
    this.scoringSystem.subscribeToEvents(this.eventBus);
    this.setupListeners();

    this.deathSystem = this.createDeathSystem();
    this.skipCountdown = config.skipCountdown ?? false;
  }

  /** Пропускать ли обратный отсчёт (headless). */
  private readonly skipCountdown: boolean;

  // ============================== RNG / время ==============================

  /** Поток случайности по имени. */
  rng(stream: RngStream): Rng {
    return this.rngStreams.rng(stream);
  }

  /** Время мира в секундах: только целые тики. */
  get time(): number {
    return this.tickIndex * FIXED_DT;
  }

  /** Счётчики бросков по потокам (для снапшотов). */
  rngDraws(): Record<RngStream, number> {
    return this.rngStreams.drawCounts();
  }

  // ============================== View ==============================

  get view(): WorldView {
    return this._view;
  }

  /** Обновить сечение камеры/вьюпорта (в браузере — каждый кадр). */
  setView(view: Partial<WorldView>): void {
    this._view = { ...this._view, ...view };
  }

  // ============================== Tick ==============================

  /**
   * Один тик мира.
   *
   * Принимает только `FIXED_DT`: переменный шаг ломает детерминизм, поэтому
   * хост обязан прогонять мир через `SimulationClock`.
   */
  tick(dt: number): void {
    if (dt !== FIXED_DT) {
      throw new Error(`GameWorld.tick: ожидается FIXED_DT (${FIXED_DT}), получено ${dt}`);
    }

    // Порядок жёсткий: агент решает по текущему снимку, намерение попадает
    // в AgentControls, и только потом оружие видит прицел/огонь этого тика.
    if (this.agent && this.agentControls) {
      this.agentControls.setIntent(this.agent.update(this.buildPlayerView(), FIXED_DT));
    }

    // Рекордер снимает намерение ПОСЛЕ решения агента: иначе запись
    // агентского прогона отставала бы от мира на один тик.
    this.recorder?.beginTick(this, this.controls);

    // Управление применяется до тика систем, иначе оно попадёт в следующий тик.
    this.weaponManager.setManualAim(this.controls.aimAngle);
    this.weaponManager.setManualFiring(this.controls.firing);

    // В dying/over игровые системы не тикают, чтобы не оставлять «сиротские» пули.
    if (!this.fsm.is("dying", "over")) {
      this.ecs.update(FIXED_DT);
      this.tickIndex++;
    }

    // Пояс астероидов — часть мира, а не презентации.
    this.asteroidField.update(FIXED_DT, this.asteroidEnv());

    // Сэмпл и checkpoint снимаются после всех систем: позиция/HP уже
    // отражают результат тика.
    this.recorder?.endTick(this);
  }

  /** Окружение пояса астероидов из сечения мира и зоны. */
  private asteroidEnv() {
    const zone = this.waveOrchestrator.zoneState;
    return {
      camX: this._view.cameraX,
      camY: this._view.cameraY,
      viewW: this._view.width,
      viewH: this._view.height,
      zone: zone.active ? { x: zone.x, y: zone.y, r: zone.radius } : null,
      physicsIntegrates: !this.physics.integratesPositions,
      physicsResolves: this.physics.resolvesVelocity,
    };
  }

  // ============================== Run lifecycle ==============================

  /**
   * Начать новый забег: полный сброс мира, апгрейды, отсчёт.
   * Seed-потоки сбрасываются — повторный забег на том же мире воспроизводим.
   */
  startRun(): void {
    this.singleWaveTest = false;
    this.testLevelEnded = false;
    this.rngStreams.reset();
    this.agent?.reset();
    this.agentControls?.reset();
    this.tickIndex = 0;
    this.scoringSystem.reset();
    this.resetWaveEconomy();
    this.scoringSystem.setKilledWave(0);

    this.playerSystem.reset();

    this.ecs.clearEnemies();
    this.ecs.clearBullets();
    this.ecs.clearEnemyBullets();
    this.ecs.clearPickups();
    this.ecs.clearAllyDrones();
    this.allyDroneSystem.reset();
    this.loadoutSystem.reset();
    this.weaponManager.reset();
    this.bonusManager.reset();
    this.shieldSystem.reset();
    this.grazeSystem.reset();
    this.abilitySystem.reset();
    this.ecs.clearBeams();

    this.applyUpgrades(true);

    this.spawnSystem.clearAnnounced();
    this.ecs.resetEnemyWave();

    const resetWaveStart = this.testMode
      ? this.startWave
      : Math.max(this.startWave, loadBestWave(this.ports.storage));
    this.ecs.setEnemyWave(resetWaveStart);

    this.waveOrchestrator.reset(resetWaveStart);

    this.riftField.reset();
    this.asteroidField.hardReset();
    this.physics.reset();
    this.fx.reset();
    this.deathSystem = this.createDeathSystem();

    this.ports.hooks.onBanner(null);
    this.ports.hooks.onCountdown(null);
    this.ports.hooks.onToast(null);

    // FSM: menu/over → playing. В браузере хост делает это раньше; повторный
    // переход в текущее состояние — noop.
    if (this.fsm.is("menu", "over")) this.fsm.fire("start");

    this.countdownSystem.startWave(this.waveOrchestrator.wave);
    // Headless: волна стартует сразу, без отсчёта и баннеров.
    if (this.skipCountdown) this.countdownSystem.skip();

    // Запись стартует с нулевого тика; взведённый рекордер включается здесь.
    this.recorder?.onRunStart(this);
  }

  /** Приказ рою дронов из тактического режима. */
  setDroneOrder(order: DroneOrder, focusTargetId: number | string | null = null): void {
    this.allyDroneSystem.setOrder(order, focusTargetId);
  }

  /** Текущий приказ роя — для HUD и символов в тактическом режиме. */
  get droneOrder(): DroneOrder {
    return this.allyDroneSystem.currentOrder;
  }

  /** Пропускается ли обратный отсчёт (нужно записи и повтору). */
  get skipCountdownEnabled(): boolean {
    return this.skipCountdown;
  }

  /** Вернуть мир в состояние «до забега» (без презентационных сбросов). */
  reset(): void {
    this.singleWaveTest = false;
    this.testLevelEnded = false;
    this.testMode = false;
    this.rngStreams.reset();
    this.tickIndex = 0;
    this.riftField.reset();
    this.asteroidField.reset();
    this.physics.reset();
    this.fx.reset();
  }

  /** Применить персистентные апгрейды к игроку и оружию. */
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

  /** Сбросить награду за мастерство к началу забега/волны. */
  resetWaveEconomy(): void {
    this.grazePartsProgress = 0;
    this.grazePartsAwarded = 0;
    this.waveDamaged = false;
  }

  /**
   * Урон от среды (буря на кромке): проходит через щит, но без кадров
   * неуязвимости и с отдельным источником в метриках.
   */
  hitPlayerByEnvironment(amount: number): void {
    if (amount <= 0) return;
    const afterShield = this.shieldSystem.absorb(amount);
    this.playerSystem.hitRaw(afterShield);
    this.eventBus.publish("player_zone_damaged", { dmg: afterShield, source: "zone_storm" });
  }

  /** Включить тестовую волну точного состава. */
  setWaveOverride(override: WaveCompositionOverride): void {
    this.testMode = true;
    this.spawnSystem.setWaveComposition(override);
  }

  /** Сменить физический движок (только до первых тиков). */
  setPhysicsEngine(id: PhysicsEngineId): void {
    this.physics.setEngine(createPhysicsEngine(id));
  }

  // ============================== Reads ==============================

  /** Позиция игрока + скорость + угловая скорость курса. */
  getPlayerPosition(): { x: number; y: number; vx: number; vy: number; turnRate: number } {
    const ref = this.ecs.playerRef();
    return ref
      ? {
          x: ref.position.x,
          y: ref.position.y,
          vx: ref.velocity.vx,
          vy: ref.velocity.vy,
          turnRate: ref.marker.turnRate,
        }
      : { x: 0, y: 0, vx: 0, vy: 0, turnRate: 0 };
  }

  /** Снимок игрока для оружия. */
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

  /** Живая связка компонентов игрока. */
  getPlayerWorld(): PlayerRef {
    const ref = this.ecs.playerRef();
    if (ref) return ref;
    throw new Error("playerRef is null while world is active");
  }

  /** Хитбокс игрока в мировых координатах. */
  private getPlayerHitbox(): { x: number; y: number; r: number } {
    const ref = this.ecs.playerRef();
    return ref
      ? { x: ref.position.x, y: ref.position.y, r: ref.radius.r }
      : { x: 0, y: 0, r: PLAYER_HITBOX_RADIUS };
  }

  /** Границы зоны для врагов/констрейнтов. */
  getZoneBounds(): { x: number; y: number; radius: number; active: boolean; targetRadius: number } {
    const z = this.waveOrchestrator.zoneState;
    return { x: z.x, y: z.y, radius: z.radius, active: z.active, targetRadius: z.targetRadius };
  }

  /** Единое мировое сечение кадра (переиспользуемый буфер). */
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

  /**
   * Снимок мира для агента игрока.
   *
   * Строится заново каждый тик: агент не должен держать ссылки на ECS
   * и случайно мутировать состояние.
   */
  buildPlayerView(): PlayerView {
    const player = this.getPlayerSnapshot();

    const enemies: PlayerViewEnemy[] = [];
    for (const enemy of this.ecs.enemies()) {
      if (enemy.marker.dead) continue;
      enemies.push({
        x: enemy.position.x,
        y: enemy.position.y,
        vx: enemy.velocity.vx,
        vy: enemy.velocity.vy,
        kind: String(enemy.marker.kind),
        hp: enemy.life.remaining,
      });
    }

    const enemyBullets: PlayerViewBullet[] = [];
    for (const bullet of this.ecs.enemyBullets()) {
      enemyBullets.push({
        x: bullet.position.x,
        y: bullet.position.y,
        vx: bullet.velocity.vx,
        vy: bullet.velocity.vy,
      });
    }

    const zone = this.waveOrchestrator.zoneState;
    return {
      time: this.time,
      player,
      enemies,
      enemyBullets,
      zone:
        zone && zone.active
          ? { x: zone.x, y: zone.y, radius: zone.radius, active: true }
          : null,
    };
  }

  // ============================== Entities ==============================

  /** Заспавнить врага в точке. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: EnemyRef | null): void {
    const playerPos = this.getPlayerPosition();
    this.ecs.spawnEnemy(kind, x, y, parent, playerPos);
  }

  /**
   * Единственный путь урона врагу для оружия и способностей.
   *
   * Публикует `enemy_damaged` — из него симуляция считает нанесённый урон,
   * попадания и разбивку по видам врагов.
   */
  /** Нанести урон врагу; событие `enemy_damaged` публикует EnemyLifecycle. */
  damageEnemy(enemy: EnemyRef, dmg: number): boolean {
    const id = enemy.marker.ecsId;
    if (id === null || id === undefined) return false;
    return this.ecs.damageEnemy(id, dmg);
  }

  /** Зависимости спавна для engine.run(dt). */
  private buildSpawnDeps(): SpawnDependencies {
    const player = this.getPlayerWorld();
    return {
      countdownSystem: this.countdownSystem,
      zoneState: this.waveOrchestrator.zoneState,
      riftField: this.riftField,
      hooks: { onToast: (data) => this.ports.hooks.onToast(data) },
      wave: this.waveOrchestrator.wave,
      killedWave: this.scoringSystem.killedWave,
      playerX: player.position.x,
      playerY: player.position.y,
    };
  }

  // ============================== Internal ==============================

  /** DeathSystem создаётся на каждый забег: он держит свой таймер анимации. */
  private createDeathSystem(): DeathSystem {
    return new DeathSystem(
      () => this.getPlayerPosition(),
      this.ports.fx ?? this.fx,
      this.ports.audio,
      this.ecs,
      this.scoringSystem,
      {
        onGameOver: () => {
          if (this.singleWaveTest) {
            this.endSingleWaveTest("died");
            return;
          }
          if (!this.testMode) saveBestWave(this.waveOrchestrator.wave, this.ports.storage);
          this.ports.hooks.onGameOver();
        },
        onStats: (score, best, isBest, _wave, kills, time) => {
          // В одиночном тесте экран итогов не нужен: хост вернёт в отладку.
          if (this.singleWaveTest) return;
          this.ports.hooks.onStats({
            score,
            best,
            isBest,
            wave: this.waveOrchestrator.wave,
            kills,
            time,
          });
        },
      },
      this.rng("fx"),
      () => this.testMode,
    );
  }

  /** Завершить одиночный тест уровня ровно один раз. */
  private endSingleWaveTest(reason: "cleared" | "died"): void {
    if (!this.singleWaveTest || this.testLevelEnded) return;
    this.testLevelEnded = true;
    this.ports.hooks.onTestRunEnd?.(reason);
  }

  /** Игровые подписки на событийную шину (звук, волны, пикапы). */
  private setupListeners(): void {
    const bus = this.eventBus;

    this.unsubscribers.push(
      bus.subscribe("wave_started", (event) => {
        if (!this.fsm.is("playing", "active")) return;
        const wave = event.payload.wave;
        this.ports.audio.setCombatWave(wave);
        this.ports.audio.setCombat(true);
        this.scoringSystem.setKilledWave(0);
        this.resetWaveEconomy();
        this.spawnSystem.reset();
        const pos = this.getPlayerPosition();
        const total = this.spawnSystem.compositionTotal ?? waveTotalFor(wave);
        this.waveOrchestrator.initWave(pos.x, pos.y, wave, total);
        this.waveOrchestrator.setSpeedMult(this.upgradeSystem.getApplied("speedMult"));
      }),
    );

    this.unsubscribers.push(
      bus.subscribe("game_over", () => {
        this.ports.audio.setCombat(false);
        this.ports.hooks.onToast(null);
        this.fsm.fire("player_died");
        // Рекордер финализирует запись в конце текущего тика, когда
        // tickIndex уже отражает полный тик смерти.
        this.recorder?.onRunEnd("game_over", this);
      }),
    );

    this.unsubscribers.push(
      bus.subscribe("enemy_killed", () => {
        this.waveFlowSystem.checkWaveClear();
        if (this.waveOrchestrator.waveState === "cleared") {
          this.ports.audio.setCombat(false);
        }
      }),
    );

    this.unsubscribers.push(
      bus.subscribe("drone_hit", () => {
        this.ports.audio.playDroneHit();
      }),
    );

    // Любой полученный урон отменяет бонус за чистую зачистку волны.
    this.unsubscribers.push(
      bus.subscribe("player_damaged", () => {
        this.waveDamaged = true;
      }),
    );
    this.unsubscribers.push(
      bus.subscribe("player_zone_damaged", () => {
        this.waveDamaged = true;
      }),
    );

    // Graze — риск, а не просто очки: каждые GRAZE_PARTS_PER_COIN касаний
    // дают деталь, но с потолком на волну.
    this.unsubscribers.push(
      bus.subscribe("bullet_grazed", (event) => {
        this.awardGrazeParts(event.payload.count);
      }),
    );

    this.unsubscribers.push(
      bus.subscribe("pickup_collected", (event) => {
        this.applyPickupSystem.apply(event.payload.kind as PickupKind);
      }),
    );
  }

  /** Выстрел игрока: звук по типу оружия. */
  private onWeaponFired(id: WeaponId): void {
    if (WEAPON_CATALOG[id].fireSound === "droneShot") {
      this.ports.audio.playDroneShot();
    } else {
      this.ports.audio.playShoot();
    }
  }

  /** Детали за касания снарядов: 1 за каждые GRAZE_PARTS_PER_COIN, с потолком на волну. */
  private awardGrazeParts(count: number): void {
    if (this.testMode) return;
    this.grazePartsProgress += count;
    while (
      this.grazePartsProgress >= GRAZE_PARTS_PER_COIN &&
      this.grazePartsAwarded < GRAZE_PARTS_WAVE_CAP
    ) {
      this.grazePartsProgress -= GRAZE_PARTS_PER_COIN;
      this.grazePartsAwarded++;
      this.upgradeSystem.addParts(1);
    }
  }

  /** Отписаться от событий (уничтожение мира). */
  destroy(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
    this.physics.clear();
  }
}

/** Фабрика мира — единственная точка создания симуляции. */
export function createGameWorld(config: GameWorldConfig): GameWorld {
  // Новый мир — новый ряд id сущностей: прогоны с одним seed должны
  // совпадать не только по поведению, но и по идентификаторам в снимках.
  resetGameEntityIds();
  return new GameWorld(config);
}
