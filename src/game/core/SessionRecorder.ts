/**
 * SessionRecorder — пассивная запись забега.
 *
 * Рекордер не владеет миром и не меняет его: `GameWorld` вызывает
 * `beginTick`/`endTick`, а рекордер только читает `PlayerControls` и строит
 * сэмпл поведения. RNG, физика и порядок систем не затрагиваются.
 *
 * Запись стартует двумя способами:
 *   • `arm()` до забега — `startRun` включает её с тика 0 (`replayable`);
 *   • `start()` посреди забега — частичная запись (`replayable=false`),
 *     пригодная для профиля, но не для точного реплея.
 */

import {
  checkpointWorld,
  sampleBehavior,
  recordToJsonl,
  type BehaviorSample,
  type SessionBuild,
  type SessionCheckpoint,
  type SessionEndReason,
  type SessionMeta,
  type SessionRecordV1,
  type SessionRecorderPort,
  type SessionRecorderStatus,
  type SessionRunInfo,
} from "./SessionRecord";
import type { GameWorld } from "./GameWorld";
import type { PlayerControls, PlayerIntent } from "./PlayerControls";
import { loadBestWave } from "../upgrades";
import type { RunMetrics } from "../sim/MetricsSink";

/** Предел длины записи: 15 минут. */
export const SESSION_MAX_TICKS = 15 * 60 * 60;
/** Как часто снимать checkpoint, тиков. */
export const SESSION_CHECKPOINT_INTERVAL = 60;

export interface SessionRecorderOptions {
  /** Хэш сборки; в браузере — `dev`, в CLI — git SHA. */
  gitSha: string;
  /** Переопределить id сессии (фикстуры, тесты). */
  sessionId?: string;
  /** Предел длины записи в тиках. */
  maxTicks?: number;
  /**
   * Готовую запись нужно сохранить.
   *
   * Вызывается и при `stop()`, и при автозавершении (`game_over`, лимит):
   * иначе такие записи молча терялись бы.
   */
  onFinalize?: (record: SessionRecordV1) => void;
}

export class SessionRecorder implements SessionRecorderPort {
  private readonly gitSha: string;
  private readonly fixedSessionId: string | undefined;
  private readonly maxTicks: number;
  private readonly onFinalize: ((record: SessionRecordV1) => void) | undefined;

  private state: SessionRecorderStatus = "off";
  private endReason: SessionEndReason | null = null;

  private sessionId = "";
  private createdAt = "";
  private build: SessionBuild = { gitSha: "unknown", balanceHash: "hp1:dmg1" };
  private seed: SessionRecordV1["seed"] | null = null;
  private meta: SessionMeta | null = null;
  private run: SessionRunInfo | null = null;

  private intents: PlayerIntent[] = [];
  private samples: BehaviorSample[] = [];
  private checkpoints: SessionCheckpoint[] = [];
  private end: SessionRecordV1["end"] = null;

  private callIndex = 0;
  private pendingIntent: PlayerIntent | null = null;
  private controls: PlayerControls | null = null;
  private abilityThisTick = false;
  private lastCheckpointTick = -1;

  constructor(options: SessionRecorderOptions) {
    this.gitSha = options.gitSha;
    this.fixedSessionId = options.sessionId;
    this.maxTicks = options.maxTicks ?? SESSION_MAX_TICKS;
    this.onFinalize = options.onFinalize;
  }

  /** Текущее состояние для HUD и хоста. */
  get status(): SessionRecorderStatus {
    return this.state;
  }

  /** Взведённая запись начнётся со следующего `startRun`. */
  arm(): void {
    if (this.state === "recording") return;
    this.state = "armed";
  }

  /** Начать частичную запись прямо сейчас (F9 во время забега). */
  start(world: GameWorld): void {
    if (this.state === "recording") return;
    this.begin(world, world.tickIndex, false);
  }

  /**
   * Остановить запись и вернуть её. `metrics` — только если у хоста есть
   * `MetricsSink`; в браузере метрики не считаются.
   */
  stop(
    world: GameWorld,
    reason: SessionEndReason = "user_stop",
    metrics?: RunMetrics,
  ): SessionRecordV1 | null {
    if (this.state === "recording") {
      this.endReason = reason;
      this.finalize(world, metrics);
    }
    return this.toRecord();
  }

  /** Дописать метрики в уже завершённую запись. */
  attachMetrics(metrics: RunMetrics): void {
    if (this.end && !this.end.metrics) this.end = { ...this.end, metrics };
  }

  /** Собрать запись (null — запись ещё не начиналась). */
  toRecord(): SessionRecordV1 | null {
    if (!this.seed || !this.meta || !this.run) return null;
    return {
      schemaVersion: 1,
      sessionId: this.sessionId,
      createdAt: this.createdAt,
      build: this.build,
      seed: this.seed,
      meta: this.meta,
      run: { ...this.run },
      intents: [...this.intents],
      samples: [...this.samples],
      checkpoints: [...this.checkpoints],
      end: this.end ? { ...this.end } : null,
    };
  }

  /** JSONL-текст готовой записи. */
  toJsonl(): string | null {
    const record = this.toRecord();
    return record ? recordToJsonl(record) : null;
  }

  /** Забыть всё (незавершённая запись не должна попасть в файл). */
  discard(): void {
    this.state = "off";
    this.endReason = null;
    this.seed = null;
    this.meta = null;
    this.run = null;
    this.intents = [];
    this.samples = [];
    this.checkpoints = [];
    this.end = null;
    this.pendingIntent = null;
    this.controls = null;
    this.callIndex = 0;
    this.abilityThisTick = false;
    this.lastCheckpointTick = -1;
  }

  // ============================== Порт мира ==============================

  onRunStart(world: GameWorld): void {
    // Новый забег при активной записи закрывает предыдущую: она уже не
    // относится к текущему миру.
    if (this.state === "recording") {
      this.endReason = "user_stop";
      this.finalize(world);
    }

    if (this.state !== "armed") return;
    this.begin(world, world.tickIndex, world.tickIndex === 0);
  }

  onRunEnd(reason: SessionEndReason, world: GameWorld): void {
    if (this.state !== "recording") return;
    // Финализируем в конце тика: tickIndex тогда уже включает тик смерти.
    this.endReason = reason;
    void world;
  }

  noteAbility(): void {
    if (this.state === "recording") this.abilityThisTick = true;
  }

  beginTick(_world: GameWorld, controls: PlayerControls): void {
    if (this.state !== "recording") return;
    this.controls = controls;
    this.pendingIntent = {
      moveX: controls.axis.x,
      moveY: controls.axis.y,
      aimAngle: controls.aimAngle,
      firing: controls.firing,
      altFiring: controls.altFiring,
      ability: false,
    };
    this.abilityThisTick = false;
  }

  endTick(world: GameWorld): void {
    if (this.state !== "recording" || !this.pendingIntent || !this.controls) return;

    const ability =
      this.abilityThisTick || this.controls.lastConsumedAbility === true;
    const intent: PlayerIntent = { ...this.pendingIntent, ability };
    this.pendingIntent = null;

    this.intents.push(intent);
    this.samples.push(
      sampleBehavior(world, this.callIndex, this.controls, ability),
    );

    this.callIndex++;
    this.abilityThisTick = false;

    if (
      world.tickIndex > 0 &&
      world.tickIndex % SESSION_CHECKPOINT_INTERVAL === 0 &&
      world.tickIndex !== this.lastCheckpointTick
    ) {
      this.addCheckpoint(world);
    }

    if (this.endReason !== null) {
      this.finalize(world);
      return;
    }
    if (this.callIndex >= this.maxTicks) {
      this.endReason = "limit";
      this.finalize(world);
    }
  }

  // ============================== Внутреннее ==============================

  private begin(world: GameWorld, startTick: number, replayable: boolean): void {
    this.discard();
    this.createdAt = new Date().toISOString();
    this.sessionId =
      this.fixedSessionId ??
      `${this.createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${world.seedSet.master}`;

    this.seed = {
      master: world.seedSet.master,
      streams: { ...world.seedSet.streams },
    };
    this.meta = {
      // Запись фиксирует состояние забега на старте, а не сейв: прокачка
      // забега живёт в памяти и в хранилище не попадает.
      upgrades: { ...world.upgradeSystem.playerUpgrades },
      weaponLoadout: world.upgradeSystem.loadout,
      droneLoadout: world.upgradeSystem.droneLoadout,
      bestWave: loadBestWave(world.ports.storage),
      physicsEngine: world.physicsEngineId,
    };
    this.build = {
      gitSha: this.gitSha,
      balanceHash: `hp${world.balance.enemyHpMult}:dmg${world.balance.enemyDamageMult}`,
    };
    this.run = {
      runId: "run-1",
      startTick,
      replayable,
      startWave: world.waveOrchestrator.wave,
      testMode: world.testMode,
      skipCountdown: world.skipCountdownEnabled,
      physics: world.physicsEngineId,
      ticks: 0,
      endReason: null,
      balance: {
        enemyHpMult: world.balance.enemyHpMult,
        enemyDamageMult: world.balance.enemyDamageMult,
      },
    };
    this.state = "recording";
    this.endReason = null;
    this.callIndex = 0;
    this.lastCheckpointTick = -1;
  }

  private addCheckpoint(world: GameWorld): void {
    const checkpoint = checkpointWorld(world);
    this.checkpoints.push(checkpoint);
    this.lastCheckpointTick = checkpoint.tick;
  }

  private finalize(world: GameWorld, metrics?: RunMetrics): void {
    if (this.state !== "recording" || !this.run) return;
    const reason = this.endReason ?? "user_stop";

    // Финальный снимок нужен реплею: без него последний тик не с чем сравнить.
    if (world.tickIndex !== this.lastCheckpointTick) this.addCheckpoint(world);

    this.run.ticks = this.intents.length;
    this.run.endReason = reason;
    this.end = {
      tick: world.tickIndex,
      reason,
      ...(metrics ? { metrics } : {}),
    };
    this.state = "off";
    this.endReason = null;
    this.pendingIntent = null;
    this.controls = null;

    const record = this.toRecord();
    if (record) this.onFinalize?.(record);
  }
}
