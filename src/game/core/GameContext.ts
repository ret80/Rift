/**
 * GameContext — презентационный хост игры.
 *
 * Держит то, что существует только в браузере: canvas, рендер-бэкенд,
 * ввод/геймпад, аудио, меню-сцену, камеру, HUD, кадровый цикл и requestAnimationFrame.
 * Игровой мир (`GameWorld`) — отдельный DOM-free объект; контекст владеет им,
 * передаёт порты и делегирует игровые операции.
 *
 * Геттеры-делегаты (`ctx.ecs`, `ctx.playerSystem`, …) сохранены, чтобы
 * презентационные файлы не пришлось переписывать в том же шаге.
 */

import { t } from "../../i18n";
import { clearTestProfile, loadTestProfile, saveTestProfile } from "../debug/TestProfile";
import { AbilitySystem } from "../abilities/AbilitySystem";
import { AsteroidField } from "../asteroids";
import type { EnemyKind, PickupKind } from "../balance";
import { estimateRunParts } from "../balance/drops";
import type { DoctrineOffer } from "../meta/doctrines";
import type { WaveCompositionOverride } from "../balance/waves";
import type { ParamProfileId } from "../balance/params/profiles";
import type { EnemyRef, PlayerRef } from "../ecs";
import type { DroneOrder } from "../ecs/components/AllyDroneComponent";
import { EcsWorld } from "../ecs";
import type { SystemSchedule } from "../ecs/SystemSchedule";
import { Fx } from "../fx";
import { GAMEPAD_CODES, GamepadManager } from "../gamepad";
import { InputManager } from "../input";
import type { LoadoutSystem } from "../loadout/LoadoutSystem";
import type { BonusManager } from "../loadout/bonuses/BonusManager";
import type { PhysicsEngineId, PhysicsSystem } from "../physics/index";
import { MenuScene } from "../presentation/menu/MenuScene";
import { getDpr, NullRenderer, PicoGLRenderer, type IRenderer } from "../render/index";
import { RiftField } from "../rifts";
import { Starfield } from "../starfield";
import { AudioManager } from "../systems/AudioManager";
import { CameraSystem } from "../systems/CameraSystem";
import type { CollisionSystem } from "../ecs/systems/CollisionSystem";
import type { CountdownSystem } from "../ecs/systems/CountdownSystem";
import type { DeathSystem } from "../systems/DeathSystem";
import { DebugSystem } from "../systems/DebugSystem";
import type { GrazeSystem } from "../ecs/systems/GrazeSystem";
import { InputSystem } from "../systems/InputSystem";
import type { PickupDropSystem } from "../ecs/systems/PickupDropSystem";
import type { PlayerSystem } from "../ecs/systems/PlayerSystem";
import { RendererSystem } from "../presentation/RendererSystem";
import type { ScoringSystem } from "../ecs/systems/ScoringSystem";
import type { ShieldSystem } from "../ecs/systems/ShieldSystem";
import type { SpawnSystem } from "../ecs/systems/SpawnSystem";
import type { UpgradeSystem } from "../systems/UpgradeSystem";
import type { WaveFlowSystem } from "../ecs/systems/WaveFlowSystem";
import type { WaveOrchestrator } from "../waves/WaveOrchestrator";
import type { ZoneSystem } from "../ecs/systems/ZoneSystem";
import type { PlayerSnapshot, WeaponId } from "../weapons/Weapon";
import type { WeaponManager } from "../weapons/WeaponManager";
import type { EventBus } from "./EventBus";
import type { GameFSMContext } from "./GameFSM";
import { GameFrame } from "./GameFrame";
import type { Hooks } from "./GameHooks";
import { GameLoop } from "./GameLoop";
import { GameRender } from "./GameRender";
import { GameStart } from "./GameStart";
import { GameUpgrades } from "./GameUpgrades";
import { createGameWorld, GameWorld } from "./GameWorld";
import type { PersistencePort } from "./PersistencePort";
import { HumanControls, type PlayerControls } from "./PlayerControls";
import { RecordingControls } from "./RecordingControls";
import { SessionRecorder } from "./SessionRecorder";
import { recordToJsonl, type SessionRecordV1 } from "./SessionRecord";
import { PresentationFrame } from "./PresentationFrame";
import { SimulationClock } from "./SimulationClock";
import type { GameStateMachine } from "./StateMachine";
import type { WorldFrame } from "./WorldFrame";
import { getViewport, readUrlParam } from "./env";
import { createRandomSeed, createSeedSet } from "./rng";



export class GameContext {
  readonly hooks: Hooks;
  readonly storage: PersistencePort;

  /** Seed-набор забега: `?seed=` или случайный мастер-seed. */
  readonly seedSet = createSeedSet(this.readSeedParam());

  readonly audio = new AudioManager();
  readonly renderer: IRenderer;

  /** DOM-free игровой мир: единственный источник правды симуляции. */
  readonly world: GameWorld;

  readonly cameraSystem = new CameraSystem();
  readonly debugSystem = new DebugSystem();

  readonly input: InputManager;
  readonly inputSystem: InputSystem;
  readonly gamepad = new GamepadManager();
  /** Человеческий ввод без обёрток: сюда пишут мышь/тач/геймпад. */
  readonly humanControls: HumanControls;
  /** Пассивная запись забега (работает только в dev/`?debug`). */
  readonly recorder: SessionRecorder;
  /** Порт управления игроком; в dev — с записью способности. */
  readonly controls: PlayerControls;

  readonly starfield: Starfield;
  readonly rendererSystem: RendererSystem;
  readonly menuScene: MenuScene;

  readonly render: GameRender;
  readonly presentation: PresentationFrame;
  readonly frame: GameFrame;
  readonly start: GameStart;
  readonly upgrades: GameUpgrades;
  readonly loop: GameLoop;

  /** Фиксированный шаг мира для браузерного кадра. */
  readonly clock = new SimulationClock();

  /** Размер вьюпорта в CSS-пикселях (обновляется в resize). */
  readonly viewport = { width: 0, height: 0 };

  private _paused = false;
  /** Тактический режим: мир стоит, игрок отдаёт приказы дронам. */
  private _tactical = false;
  /** Выбор доктрины после босс-волны: мир стоит, но это не пауза. */
  private _doctrineOffer: DoctrineOffer | null = null;
  /** Идёт запись тестового уровня: файл ждёт кнопки «Выгрузить». */
  private testRecording = false;
  /** Готовая запись тестового уровня для выгрузки. */
  private testRecord: SessionRecordV1 | null = null;

  /** Текущее направление навигации (стик или D-pad). */
  private _navDir: "up" | "down" | "left" | "right" | null = null;
  /** Кандидат направления — для дебаунса шумного hat-стика. */
  private _navCandidate: "up" | "down" | "left" | "right" | null = null;
  /** Сколько кандидат держится стабильно, секунды. */
  private _navCandidateT = 0;
  /** Время до следующего шага автоповтора, секунды. */
  private _navRepeatT = 0;
  private static readonly NAV_INITIAL_DELAY = 0.45;
  private static readonly NAV_REPEAT_INTERVAL = 0.18;
  private static readonly NAV_DEADZONE = 0.3;
  private static readonly NAV_DEBOUNCE = 0.03;

  constructor(canvas: HTMLCanvasElement, hooks: Hooks, storage: PersistencePort) {
    this.hooks = hooks;
    this.storage = storage;

    // Запись — только dev или явный ?debug=1. В прод-сборке F9 не
    // перехватывается, а рекордер никогда не включается.
    const dev = import.meta.env.DEV || readUrlParam("debug") === "1";
    this.recorder = new SessionRecorder({
      gitSha: "dev",
      onFinalize: (record) => {
        // Запись тестового уровня не скачивается сама: её забирают
        // кнопкой «Выгрузить» в меню отладки.
        if (this.testRecording) {
          this.testRecording = false;
          this.testRecord = record;
          return;
        }
        this.downloadRecord(record);
      },
    });

    // Рендер-бэкенд: PicoGL; NullRenderer — через URL-параметр ?renderer=null
    // или при отсутствии поддержки WebGL2 / сбое инициализации GPU.
    const useNull = readUrlParam("renderer") === "null";
    let renderer: IRenderer;
    if (useNull) {
      renderer = new NullRenderer(canvas);
    } else {
      // Проверяем поддержку WebGL2 на свежем canvas, чтобы не «отравлять»
      // игровой canvas запросом несовместимого типа контекста.
      const supported = (() => {
        try {
          return !!document.createElement("canvas").getContext("webgl2");
        } catch {
          return false;
        }
      })();
      if (!supported) {
        console.warn("[Rift] WebGL2 недоступен в этом браузере — используется NullRenderer");
        renderer = new NullRenderer(canvas);
      } else {
        try {
          renderer = new PicoGLRenderer(canvas);
        } catch (err) {
          console.warn("[Rift] Не удалось инициализировать WebGL2 — используется NullRenderer", err);
          renderer = new NullRenderer(canvas);
        }
      }
    }
    this.renderer = renderer;

    // Мир создаётся до презентации: он не зависит от canvas и DOM.
    const physicsParam = readUrlParam("physics");
    const { width, height } = getViewport();
    this.viewport.width = width;
    this.viewport.height = height;

    // Ввод и порт управления создаются ДО мира: GameWorld принимает
    // PlayerControls в конфиге, иначе он подставляет AgentControls и игрок
    // остаётся без человеческого управления (ось всегда 0).
    this.input = new InputManager({
      onPauseKey: () => this.togglePause(),
      onLoseFocus: () => {
        // Потеря фокуса сохраняет уже записанное: иначе запись молча теряется.
        if (this.recorder.status === "recording") this.stopRecording("focus_lost");
        if (this.fsm.is("playing", "active", "dying") && !this._paused) {
          this.togglePause();
          this.audio.setSuspended(true);
        }
      },
      ...(dev ? { onRecordKey: () => this.toggleRecording() } : {}),
      onTacticalKey: () => this.toggleTactical(),
      onLockKey: () => this.world.cycleLock(),
    });
    this.humanControls = new HumanControls(this.input);
    // Обёртка нужна и для кнопки `?record`: способность пишется по факту
    // срабатывания, а рекордер сам игнорирует вызовы вне записи.
    this.controls = new RecordingControls(
      this.humanControls,
      () => this.recorder.noteAbility(),
    );

    this.world = createGameWorld({
      seed: this.seedSet,
      startWave: 1,
      physics: (physicsParam as PhysicsEngineId | null) ?? "planck",
      controls: this.controls,
      // Без этого порта мир не пишет тики, и любая запись остаётся пустой.
      recorder: this.recorder,
      ports: {
        audio: this.audio,
        storage,
        hooks: {
          onBanner: (banner) => hooks.onBanner(banner),
          onToast: (toast) => hooks.onToast(toast),
          // Мир отдаёт номер волны без текста: подпись локализует хост.
          onCountdown: (count) =>
            hooks.onCountdown(
              count
                ? {
                    id: count.id,
                    label: t("game.waveN", { n: String(count.wave).padStart(2, "0") }),
                    value: count.value,
                  }
                : null,
            ),
          onGameOver: () => hooks.onGameOver(),
          onStats: (stats) => hooks.onStats(stats),
          onWaveCleared: (wave) => hooks.onWaveCleared?.(wave),
          // Награда за босс-волну: мир замирает на выбор, не показывая паузу.
          onDoctrineOffer: (offer) => {
            this._doctrineOffer = offer;
            if (offer) {
              this.setPaused(true);
              this.audio.setSuspended(true);
            } else if (!this._tactical) {
              this.setPaused(false);
              this.audio.setSuspended(false);
            }
            hooks.onDoctrineOffer?.(offer);
          },
          // Микрозадача: не мутируем мир посреди тика/кадра, когда
          // зачистка тестовой волны приходит из WaveFlowSystem.
          onTestRunEnd: (reason) => {
            // Тест закончился (зачистка/смерть): закрываем запись, но файл
            // остаётся в памяти до кнопки «Выгрузить».
            this.finishTestRecording();
            queueMicrotask(() => hooks.onTestRunEnd?.(reason));
          },
        },
      },
      view: { width, height, cameraX: 0, cameraY: 0, zoom: 1 },
    });

    console.info(`[Rift] seed ${this.seedSet.master}`);

    this.inputSystem = new InputSystem(canvas, {
      onAimUpdate: (mouseX, mouseY, winW, winH) => this.handleAim(mouseX, mouseY, winW, winH),
      onFiringChanged: (firing) => this.humanControls.setFiring(firing),
      onAltFiringChanged: (altFiring) => this.humanControls.setAltFiring(altFiring),
    });

    // Геймпад: создаём и подключаем к InputManager.
    this.input.setGamepadSource(this.gamepad);
    this._setupGamepadListeners();

    this.starfield = new Starfield();
    this.rendererSystem = new RendererSystem({
      fx: this.world.fx,
      starfield: this.starfield,
      asteroidField: this.world.asteroidField,
      riftField: this.world.riftField,
      anchorSystem: this.world.anchorSystem,
    });

    this.menuScene = new MenuScene(
      this.starfield,
      this.world.asteroidField,
      this.world.riftField,
      this.rendererSystem,
      this.renderer,
      this.cameraSystem.getRawCamera(),
    );

    this.resize();

    this.render = new GameRender(this);
    this.presentation = new PresentationFrame(this);
    this.frame = new GameFrame(this, this.presentation);
    this.start = new GameStart(this);
    this.upgrades = new GameUpgrades(this);
    this.loop = new GameLoop((dt) => this.frame.step(dt), () => this.resize());
  }

  /** Мастер-seed из `?seed=`, иначе случайный. */
  private readSeedParam(): number {
    const raw = readUrlParam("seed");
    const parsed = raw === null ? NaN : Number(raw);
    return Number.isFinite(parsed) ? parsed >>> 0 : createRandomSeed();
  }

  // ============================== Delegates ==============================
  // Презентационный слой читает мир через эти геттеры. Они исчезнут, когда
  // файлы перейдут на `ctx.world.*` напрямую.

  get fsm(): GameStateMachine<GameFSMContext> { return this.world.fsm; }
  get eventBus(): EventBus { return this.world.eventBus; }
  get ecs(): EcsWorld { return this.world.ecs; }
  get schedule(): SystemSchedule { return this.world.schedule; }
  get physics(): PhysicsSystem { return this.world.physics; }
  get fx(): Fx { return this.world.fx; }
  get asteroidField(): AsteroidField { return this.world.asteroidField; }
  get riftField(): RiftField { return this.world.riftField; }
  get scoringSystem(): ScoringSystem { return this.world.scoringSystem; }
  get upgradeSystem(): UpgradeSystem { return this.world.upgradeSystem; }
  get bonusManager(): BonusManager { return this.world.bonusManager; }
  get shieldSystem(): ShieldSystem { return this.world.shieldSystem; }
  get grazeSystem(): GrazeSystem { return this.world.grazeSystem; }
  get playerSystem(): PlayerSystem { return this.world.playerSystem; }
  get abilitySystem(): AbilitySystem { return this.world.abilitySystem; }
  get spawnSystem(): SpawnSystem { return this.world.spawnSystem; }
  get weaponManager(): WeaponManager { return this.world.weaponManager; }
  get countdownSystem(): CountdownSystem { return this.world.countdownSystem; }
  get loadoutSystem(): LoadoutSystem { return this.world.loadoutSystem; }
  get dropSystem(): PickupDropSystem { return this.world.dropSystem; }
  get collisionSystem(): CollisionSystem { return this.world.collisionSystem; }
  get zoneSystem(): ZoneSystem { return this.world.zoneSystem; }
  get waveOrchestrator(): WaveOrchestrator { return this.world.waveOrchestrator; }
  get waveFlowSystem(): WaveFlowSystem { return this.world.waveFlowSystem; }
  get deathSystem(): DeathSystem { return this.world.deathSystem; }

  /** Стартовая волна (применяется при следующем забеге). */
  get startWave(): number { return this.world.startWave; }
  set startWave(wave: number) { this.world.startWave = wave; }

  /** Тестовый режим `?test=...`. */
  get testMode(): boolean { return this.world.testMode; }
  set testMode(on: boolean) { this.world.testMode = on; }

  // ============================== Gamepad ==============================

  private _setupGamepadListeners(): void {
    window.addEventListener("gamepadconnected", this._onGamepadConnected);
    window.addEventListener("gamepaddisconnected", this._onGamepadDisconnected);
  }

  private _onGamepadConnected = (e: Event) => {
    const gp = e as GamepadEvent;
    console.log(`[Gamepad] подключён: ${gp.gamepad.id.slice(0, 40)}`);
  };

  private _onGamepadDisconnected = (e: Event) => {
    const gp = e as GamepadEvent;
    console.log(`[Gamepad] отключён: ${gp.gamepad.id.slice(0, 40)}`);
  };

  // ============================== Pause ==============================

  get paused(): boolean {
    return this._paused;
  }

  /** Тактический режим включён. */
  get tactical(): boolean {
    return this._tactical;
  }

  /**
   * Войти в тактический режим или выйти из него.
   *
   * Мир замирает через ту же паузу, что и Esc, но без экрана паузы:
   * открывается тактический оверлей с приказами рою. Вход во время паузы
   * игнорируется, чтобы два оверлея не спорили за экран.
   */
  toggleTactical(): void {
    if (!this.fsm.is("playing", "active")) return;
    if (this._paused && !this._tactical) return;
    this._tactical = !this._tactical;
    this.setPaused(this._tactical);
    this.audio.setSuspended(this._tactical);
    this.hooks.onTactical?.(this._tactical);
  }

  /** Выйти из тактического режима (смена экрана, смерть, Esc). */
  private exitTactical(): void {
    if (!this._tactical) return;
    this._tactical = false;
    this.setPaused(false);
    this.audio.setSuspended(false);
    this.hooks.onTactical?.(false);
  }

  /**
   * Приказ рою дронов. В фокусе целью становится враг под прицелом
   * игрока (или ближайший к линии прицела); без цели приказ не меняется.
   */
  setDroneOrder(order: DroneOrder): void {
    if (order === "focus") {
      const target = this.pickFocusTarget();
      if (!target) {
        this.hooks.onToast({ text: t("hud.orderNoTarget"), color: "#ffb84d" });
        return;
      }
      this.world.setDroneOrder(order, target.marker.ecsId ?? null);
    } else {
      this.world.setDroneOrder(order);
    }
    const key = order === "escort"
      ? "hud.orderEscort"
      : order === "assault"
        ? "hud.orderAssault"
        : "hud.orderFocus";
    this.hooks.onToast({ text: t(key), color: "#7dff9e" });
  }

  /** Ближайший к линии прицела враг в пределах досягаемости. */
  private pickFocusTarget(): EnemyRef | null {
    const player = this.ecs.playerRef();
    if (!player) return null;
    const aim = this.humanControls.aimAngle ?? player.marker.angle;
    let best: EnemyRef | null = null;
    let bestScore = Infinity;
    for (const enemy of this.ecs.enemies()) {
      if (enemy.marker.dead) continue;
      const dx = enemy.position.x - player.position.x;
      const dy = enemy.position.y - player.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 800) continue;
      let delta = Math.abs(Math.atan2(dy, dx) - aim);
      if (delta > Math.PI) delta = Math.PI * 2 - delta;
      if (delta > 0.6) continue;
      const score = dist * (1 + delta * 2);
      if (score < bestScore) {
        bestScore = score;
        best = enemy;
      }
    }
    return best;
  }

  setPaused(paused: boolean): void {
    this._paused = paused;
    // На паузе время мира не идёт: накопитель не должен «догонять» после снятия.
    if (paused) this.clock.reset();
  }

  // ============================== Recording ==============================

  /**
   * Включить запись следующего тестового уровня.
   *
   * Взведённый рекордер стартует вместе с миром с тика 0, поэтому запись
   * пригодна и для профиля поведения, и для точного реплея.
   */
  armTestRecording(): void {
    this.testRecord = null;
    this.testRecording = true;
    this.recorder.discard();
    this.recorder.arm();
  }

  /** Состояние записи для кнопок в меню отладки. */
  getTestRecordingState(): { armed: boolean; ready: boolean } {
    return {
      armed: this.testRecording && this.recorder.status === "armed",
      ready: this.testRecord !== null,
    };
  }

  /** Скачать готовую запись тестового уровня (JSONL для симулятора). */
  downloadTestRecording(): boolean {
    if (!this.testRecord) return false;
    this.downloadRecord(this.testRecord);
    return true;
  }

  /** Закрыть запись теста: файл заберут кнопкой, автоскачивания нет. */
  private finishTestRecording(): void {
    if (!this.testRecording) return;
    if (this.recorder.status === "recording") {
      this.recorder.stop(this.world, "user_stop");
      return;
    }
    if (this.recorder.status === "armed") {
      this.recorder.discard();
      this.testRecording = false;
    }
  }

  /** F9: взвести до старта, начать/остановить во время забега. */
  private toggleRecording(): void {
    if (this.fsm.is("menu", "over")) {
      if (this.recorder.status === "off") this.recorder.arm();
      else this.recorder.discard();
      return;
    }
    if (this.recorder.status === "recording") this.stopRecording("user_stop");
    else this.recorder.start(this.world);
  }

  /** Остановить запись; сохранение сделает `onFinalize` рекордера. */
  private stopRecording(reason: "user_stop" | "focus_lost"): void {
    this.recorder.stop(this.world, reason);
  }

  /**
   * Кнопка `?record` в HUD: начать запись с нового забега или остановить её.
   *
   * Запись взводится до старта, поэтому начинается с нулевого тика и
   * остаётся пригодной для точного реплея.
   */
  toggleRecordButton(): void {
    if (this.recorder.status === "recording") {
      this.stopRecording("user_stop");
      return;
    }
    this.recorder.arm();
    this.startRun();
  }

  /** Скачать готовую запись JSONL (dev-инструмент, не геймплей). */
  private downloadRecord(record: SessionRecordV1): void {
    const blob = new Blob([recordToJsonl(record)], { type: "application/x-ndjson" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `rift-session-${record.sessionId}.jsonl`;
    link.click();
    URL.revokeObjectURL(url);
    this.hooks.onToast({ text: t("hud.recordSaved"), color: "#ffb84d" });
  }

  /**
   * Открыть ангар между волнами.
   * Мир замирает на паузе: игрок тратит детали и продолжает забег.
   */
  openHangar(): void {
    if (!this.fsm.is("playing", "active")) return;
    this.setPaused(true);
    this.hooks.onPause(true);
    this.audio.setSuspended(true);
  }

  /** Предложение доктрины после босс-волны; null — выбора нет. */
  get doctrineOffer(): DoctrineOffer | null {
    return this._doctrineOffer;
  }

  /** Выбрать доктрину из предложенных: мир снимает паузу и начинает отсчёт. */
  chooseDoctrine(id: string): void {
    this.world.chooseDoctrine(id);
  }

  /** Закрыть ангар: забег продолжается со следующей волны. */
  closeHangar(): void {
    this.setPaused(false);
    this.hooks.onPause(false);
    this.audio.setSuspended(false);
  }

  togglePause(): void {
    if (this.fsm.is("menu", "over")) return;
    // Выбор доктрины забирает паузу себе: Esc не должен снимать её без выбора.
    if (this._doctrineOffer) return;
    // Esc в тактике закрывает тактику, а не открывает экран паузы.
    if (this._tactical) {
      this.exitTactical();
      return;
    }
    this.setPaused(!this._paused);
    this.hooks.onPause(this._paused);
    this.audio.setSuspended(this._paused);
  }

  // ============================== Loop metrics ==============================

  get loopTime(): number {
    return this.loop ? this.loop.time : 0;
  }

  loopResetTime(): void {
    this.loop?.resetTime();
  }

  fps(): number {
    return this.loop ? this.loop.fps() : 60;
  }

  // ============================== View ==============================

  resize(): void {
    const { width, height } = getViewport();
    this.viewport.width = width;
    this.viewport.height = height;
    this.renderer.resize(width, height);
    this.cameraSystem.resize(width, height, getDpr());
    this.updateWorldView();
  }

  /** Передать миру текущее сечение камеры/вьюпорта. */
  updateWorldView(): void {
    const cam = this.cameraSystem.getPosition();
    this.world.setView({
      width: this.viewport.width,
      height: this.viewport.height,
      cameraX: cam.x,
      cameraY: cam.y,
      zoom: cam.zoom,
    });
  }

  // ============================== Frame entry ==============================

  handleDebugKeys(dt: number): void {
    // Опрос геймпада каждый кадр.
    this.gamepad.poll();

    // Пауза через кнопку Start на геймпаде.
    if (this.gamepad.isConnected) {
      if (this.gamepad.consumePress(GAMEPAD_CODES.Start)) {
        this.togglePause();
      }
      if (this.gamepad.consumePress(GAMEPAD_CODES.A)) {
        this.hooks.onGamepadConfirm?.();
      }
      if (this.gamepad.consumePress(GAMEPAD_CODES.B)) {
        this.hooks.onGamepadCancel?.();
      }
      if (this.gamepad.consumePress(GAMEPAD_CODES.LB)) {
        this.hooks.onGamepadTabLeft?.();
      }
      if (this.gamepad.consumePress(GAMEPAD_CODES.RB)) {
        this.hooks.onGamepadTabRight?.();
      }
      this._updateNavRepeat(dt);
    }

    this.debugSystem.handleDebugKeys(
      (key) => this.input.isKey(key),
      this.fsm.is("over"),
      () => this.fsm.fire("restart"),
    );
  }

  /** Шаг навигации с дебаунсом и автоповтором для стика/D-pad. */
  private _updateNavRepeat(dt: number): void {
    const nav = GameContext.NAV_DEADZONE;
    const ax = this.gamepad.axisX;
    const ay = this.gamepad.axisY;
    let raw: "up" | "down" | "left" | "right" | null = null;
    if (Math.abs(ax) > nav || Math.abs(ay) > nav) {
      raw = Math.abs(ax) >= Math.abs(ay)
        ? (ax > 0 ? "right" : "left")
        : (ay > 0 ? "down" : "up");
    }

    if (raw === null) {
      this._navDir = null;
      this._navCandidate = null;
      this._navCandidateT = 0;
      this._navRepeatT = 0;
      return;
    }

    if (raw !== this._navCandidate) {
      this._navCandidate = raw;
      this._navCandidateT = 0;
      return;
    }
    this._navCandidateT += dt;
    if (this._navCandidateT < GameContext.NAV_DEBOUNCE) return;

    if (raw !== this._navDir) {
      this._navDir = raw;
      this._fireNav(raw);
      this._navRepeatT = GameContext.NAV_INITIAL_DELAY;
      return;
    }

    this._navRepeatT -= dt;
    if (this._navRepeatT <= 0) {
      this._fireNav(raw);
      this._navRepeatT += GameContext.NAV_REPEAT_INTERVAL;
      if (this._navRepeatT <= 0) this._navRepeatT = GameContext.NAV_REPEAT_INTERVAL;
    }
  }

  /** Вызвать навигационный хук по направлению. */
  private _fireNav(dir: "up" | "down" | "left" | "right"): void {
    switch (dir) {
      case "up": this.hooks.onGamepadNavUp?.(); break;
      case "down": this.hooks.onGamepadNavDown?.(); break;
      case "left": this.hooks.onGamepadNavLeft?.(); break;
      case "right": this.hooks.onGamepadNavRight?.(); break;
    }
  }

  // ============================== Run lifecycle ==============================

  startRun(): void {
    this.exitTactical();
    if (this.fsm.is("menu", "over")) {
      this.fsm.fire("start");
    }
    this.start.startRun();
  }

  /**
   * Запустить одиночный тест уровня из меню отладки.
   *
   * Волна берётся точно выбранная, состав — только из отладочного списка,
   * без сохранения рекорда и начисления деталей. После зачистки или смерти
   * мир сообщит хосту `onTestRunEnd`, и меню отладки откроется снова.
   */
  /** Отладочный сдвиг скорости игрока и врагов, проценты (−50…+50). */
  setTestSpeed(percent: number): void {
    this.world.setTestSpeed(percent);
  }

  /** Отладочный сдвиг размера арены, проценты (−50…+50). */
  setTestZone(percent: number): void {
    this.world.setTestZone(percent);
  }

  /** Выбрать профиль параметров мира. */
  setParamProfile(profileId: ParamProfileId): void {
    this.world.setParamProfile(profileId);
  }

  startTestLevel(wave: number, enemies: EnemyKind[]): void {
    this.world.startWave = Math.max(1, Math.floor(wave));
    this.world.testMode = true;
    this.spawnSystem.setEnabledEnemies(enemies);
    this.startRun();
    // Тестовый профиль: игрок сразу появляется с собранным в ангаре набором.
    const profile = loadTestProfile(this.storage);
    if (profile) {
      this.world.upgradeSystem.applyProfile(profile);
      this.world.applyUpgrades(true);
    }
    // В тестовом режиме всё снаряжение открыто без достижений.
    this.world.setDebugUnlocks(true);
    // Тестовый забег не зарабатывает детали: выдаём оценку того, что игрок
    // заработал бы, дойдя до этой волны в обычном режиме.
    this.world.upgradeSystem.addParts(estimateRunParts(wave));
    this.world.singleWaveTest = true;
  }

  /* ======================== Debug economy ======================== */

  /** Бесконечные детали: тратятся всегда, баланс не меняется. */
  setPartsInfinite(on: boolean): void {
    this.world.upgradeSystem.partsWallet.setInfinite(on);
  }

  /** Бесконечные кредиты: покупки в Эхе Разлома никогда не уменьшают баланс. */
  setCreditsInfinite(on: boolean): void {
    this.world.creditSystem.setInfinite(on);
  }

  /** Запас деталей текущего забега (в бесконечном режиме — последний реальный). */
  getParts(): number {
    return this.world.upgradeSystem.getParts();
  }

  /** Включены ли бесконечные детали. */
  isPartsInfinite(): boolean {
    return this.world.upgradeSystem.isPartsInfinite();
  }

  /**
   * Открыть тестовый ангар: правим сохранённый набор покупок вне забега.
   *
   * Детали соответствуют оценке реального забега до выбранной волны —
   * так собранный корабль похож на тот, с которым игрок дошёл бы сюда сам.
   */
  openTestHangar(wave: number): void {
    const profile = loadTestProfile(this.storage);
    this.world.upgradeSystem.applyProfile(profile ?? {});
    this.world.setDebugUnlocks(true);
    // Ангар — песочница: покупки идут за детали. Бесконечный режим главнее.
    this.world.upgradeSystem.partsWallet.set(estimateRunParts(wave));
    this.world.applyUpgrades(false);
  }

  /** Закрыть тестовый ангар: запоминаем покупки для тестовой волны. */
  closeTestHangar(): void {
    saveTestProfile(this.storage, this.world.upgradeSystem.captureProfile());
    this.world.setDebugUnlocks(false);
  }

  /** Сбросить тестовый профиль к базовому кораблю. */
  resetTestProfile(): void {
    clearTestProfile(this.storage);
    this.world.upgradeSystem.applyProfile({});
    this.world.applyUpgrades(false);
  }

  toMenu(): void {
    this.exitTactical();
    // Выход из теста закрывает запись, не теряя уже записанные тики.
    this.finishTestRecording();
    // Досрочный выход не должен сжигать забег: кредиты начисляются так же,
    // как при смерти (защита от двойного начисления внутри мира).
    this.world.abandonRun();
    this.start.toMenu();
  }

  // ============================== Game delegates ==============================

  getPlayerPosition(): { x: number; y: number; vx: number; vy: number; turnRate: number } {
    return this.world.getPlayerPosition();
  }

  getPlayerSnapshot(): PlayerSnapshot {
    return this.world.getPlayerSnapshot();
  }

  getPlayerWorld(): PlayerRef {
    return this.world.getPlayerWorld();
  }

  getZoneBounds(): { x: number; y: number; radius: number; active: boolean; targetRadius: number } {
    return this.world.getZoneBounds();
  }

  buildWorld(): WorldFrame {
    return this.world.buildWorld();
  }

  applyUpgrades(withResetHp: boolean): void {
    this.world.applyUpgrades(withResetHp);
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: EnemyRef | null): void {
    this.world.spawnEnemy(kind, x, y, parent);
  }

  setWaveOverride(override: WaveCompositionOverride): void {
    this.world.setWaveOverride(override);
  }

  setPhysicsEngine(id: PhysicsEngineId): void {
    this.world.setPhysicsEngine(id);
  }

  /** Открыть/закрыть всё снаряжение без достижений (отладка). */
  setDebugUnlocks(on: boolean): void {
    this.world.setDebugUnlocks(on);
  }

  setEnabledPickups(pickups: PickupKind[] | null): void {
    this.dropSystem.setEnabledPickups(pickups);
  }

  // ============================== Aim ==============================

  private handleAim(mouseX: number, mouseY: number, winW: number, winH: number): void {
    const cp = this.cameraSystem.getPosition();
    const worldX = cp.x + (mouseX - winW / 2) / cp.zoom;
    const worldY = cp.y + (mouseY - winH / 2) / cp.zoom;
    const player = this.ecs.playerRef();
    if (!player) return;
    const angle = Math.atan2(worldY - player.position.y, worldX - player.position.x);
    this.humanControls.setAim(angle);
  }

  /** Звук выстрела для презентационных вызовов (menu/debug). */
  playWeaponSound(id: WeaponId): void {
    this.world.ports.audio.playDroneShot();
    void id;
  }

  destroy(): void {
    this.exitTactical();
    if (this.recorder.status === "recording") this.stopRecording("user_stop");
    this.world.destroy();
    this.loop.destroy();
    this.inputSystem.destroy();
    this.input.destroy();
    window.removeEventListener("gamepadconnected", this._onGamepadConnected);
    window.removeEventListener("gamepaddisconnected", this._onGamepadDisconnected);
    this.audio.destroy();
    this.renderer.destroy?.();
  }
}
