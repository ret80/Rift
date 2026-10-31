/**
 * SpawnSystem — спавн врагов через разломы.
 *
 * Собственное состояние системы — только счётчики волны. Правила состава
 * волны, геометрия разломов и тосты новых видов вынесены в `waves/`:
 *   • WaveComposition  — сколько и каких врагов;
 *   • RiftPlacement    — где размещать разломы;
 *   • WaveAnnouncements — когда показывать тост о новом виде.
 */

import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
import { EnemyKind } from "../balance";
import type { RandomSource } from "../math";
import type { RiftField } from "../rifts";
import {
  WAVE_RIFT_THRESHOLD,
  buildWaveQueue,
  killThreshold,
  reinforcementCount,
  riftCountFor,
  startSpawnCount,
  waveTotal,
  zoneRadius,
} from "../waves/WaveComposition";
import { MIN_RIFT_DIST, placeRiftPoints } from "../waves/RiftPlacement";
import { WaveAnnouncements } from "../waves/WaveAnnouncements";

/** Dependencies injected to avoid tight coupling with Game. */
export interface SpawnDependencies {
  countdownSystem: { isCountdownActive?(): boolean };
  zoneState: {
    radius: number;
    active: boolean;
    x: number;
    y: number;
    targetRadius?: number;
  } | null;
  riftField: RiftField;
  hooks: { onToast?(data: { text: string; color?: string }): void };
  wave: number;
  killedWave: number;
  playerX: number;
  playerY: number;
}

/** Источник зависимостей спавна (из GameContext) для engine.run(dt). */
export type SpawnDepsSource = () => SpawnDependencies;

export class SpawnSystem extends PhasedSystem {
  private riftField: RiftField;
  private getDeps: SpawnDepsSource;
  private readonly announcements = new WaveAnnouncements();
  private readonly random: RandomSource;
  private enabledEnemies: EnemyKind[] | null = null;

  /** Общее количество врагов на текущей волне */
  private total = 0;
  /** Сколько врагов уже заспавнено (передано в разломы) */
  private spawned = 0;
  /** Сколько врагов убито на текущей волне */
  private killed = 0;
  /** Следующий порог убитых для создания нового разлома */
  private nextThreshold = 0;
  /** Сколько врагов было убито при последнем созданном разломе */
  private lastTriggeredKills = 0;
  /** Количество стартовых разломов для текущей волны */
  private startRifts = 0;

  get allocated(): number {
    return this.spawned;
  }

  constructor(config: {
    riftField: RiftField;
    getDeps: SpawnDepsSource;
    random?: RandomSource;
  }) {
    super(Phase.Spawn);
    this.riftField = config.riftField;
    this.getDeps = config.getDeps;
    this.random = config.random ?? Math.random;
  }

  /** Тик спавна внутри engine.run(dt). */
  process(_dt: number): void {
    this.update(this.getDeps());
  }

  /**
   * Set which enemy kinds are allowed to spawn.
   * Null means all enemies enabled (default).
   */
  setEnabledEnemies(enemies: EnemyKind[] | null): void {
    this.enabledEnemies = enemies;
  }

  /**
   * Clear announced classes.
   */
  clearAnnounced(): void {
    this.announcements.clear();
  }

  /**
   * Сброс состояния для новой волны.
   * Сбрасывает все счётчики, чтобы initWave() вызвался при следующем update().
   */
  reset(): void {
    this.total = 0;
    this.spawned = 0;
    this.killed = 0;
    this.nextThreshold = 0;
    this.lastTriggeredKills = 0;
    this.startRifts = 0;
  }

  update(deps: SpawnDependencies): void {
    const { countdownSystem, zoneState, hooks } = deps;

    const inCountdown = countdownSystem?.isCountdownActive?.();
    const zoneOn = zoneState?.active ?? false;

    if (inCountdown || !zoneOn) {
      return;
    }

    const killedWave = deps.killedWave;

    // Инициализация волны: ждём пока зона расширится достаточно
    if (this.total <= 0) {
      const zoneR = zoneState?.radius ?? 0;
      const zoneTarget = zoneState?.targetRadius ?? 0;
      if (zoneTarget > 0 && zoneR < zoneTarget * WAVE_RIFT_THRESHOLD) return;
      this.initWave(deps);
      // Анонсируем типы врагов из стартовых разломов
      this.announce(deps, hooks);
      return;
    }

    // Обновляем счётчик убитых
    this.killed = killedWave;

    // Проверяем, нужно ли создать подкрепление
    this.trySpawnReinforcements(killedWave, deps);

    // Анонсируем новые типы врагов
    this.announce(deps, hooks);
  }

  /**
   * Инициализация волны: создаёт стартовые разломы с 30% врагов.
   * Все стартовые разломы размещаются разом, разведённые друг от друга.
   */
  private initWave(deps: SpawnDependencies): void {
    this.total = waveTotal(deps.wave);
    this.spawned = 0;
    this.killed = 0;
    this.nextThreshold = killThreshold(this.total);
    this.lastTriggeredKills = 0;
    this.startRifts = riftCountFor(deps.wave, this.random);

    const zone = deps.zoneState;
    const zoneX = zone?.x ?? 0;
    const zoneY = zone?.y ?? 0;
    const zoneR = zone?.radius ?? zoneRadius(deps.wave);

    // Размещаем все стартовые точки разом (разводим друг от друга)
    const points = placeRiftPoints(
      this.startRifts,
      zoneX,
      zoneY,
      zoneR,
      deps.playerX,
      deps.playerY,
      this.existingRiftPoints(),
      MIN_RIFT_DIST,
    );

    const startCount = startSpawnCount(this.total);
    const perRift = Math.floor(startCount / this.startRifts);
    const remainder = startCount % this.startRifts;

    for (let i = 0; i < this.startRifts; i++) {
      const count = perRift + (i < remainder ? 1 : 0);
      const queue = buildWaveQueue(count, deps.wave, this.enabledEnemies, this.random);
      this.spawnRiftAt(deps, queue, points[i]);
      this.spawned += count;
    }
  }

  /**
   * Проверка необходимости создания подкрепления.
   * Создаёт разлом при достижении порога убитых, разведённый от существующих.
   */
  private trySpawnReinforcements(killed: number, deps: SpawnDependencies): void {
    if (this.total <= 0) return;
    if (killed < this.nextThreshold) return;
    if (killed <= this.lastTriggeredKills) return;
    if (this.spawned >= this.total) return;

    const count = reinforcementCount(this.total, this.spawned);
    if (count <= 0) return;

    const zone = deps.zoneState;
    const zoneX = zone?.x ?? 0;
    const zoneY = zone?.y ?? 0;
    const zoneR = zone?.radius ?? zoneRadius(deps.wave);

    // Точка подкрепления разводится от существующих разломов и игрока
    const points = placeRiftPoints(
      1,
      zoneX,
      zoneY,
      zoneR,
      deps.playerX,
      deps.playerY,
      this.existingRiftPoints(),
      MIN_RIFT_DIST,
    );

    const queue = buildWaveQueue(count, deps.wave, this.enabledEnemies, this.random);
    this.spawnRiftAt(deps, queue, points[0]);
    this.spawned += count;

    this.lastTriggeredKills = killed;
    this.nextThreshold = killed + killThreshold(this.total);
  }

  /** Координаты уже активных разломов. */
  private existingRiftPoints(): Array<{ x: number; y: number }> {
    return this.riftField.riftList.map((r) => ({ x: r.x, y: r.y }));
  }

  /** Показать тосты для новых видов врагов из очередей разломов. */
  private announce(deps: SpawnDependencies, hooks: SpawnDependencies["hooks"]): void {
    const queue = this.riftField.riftList.flatMap((r) => r.queue);
    this.announcements.announce(queue, hooks);
  }

  /**
   * Создаёт разлом с указанной очередью врагов в готовой точке.
   */
  private spawnRiftAt(
    deps: SpawnDependencies,
    queue: EnemyKind[],
    point: { x: number; y: number },
  ): void {
    const size = 80 + this.random() * 40;
    deps.riftField.spawn(point.x, point.y, queue, 0, size);
  }
}
