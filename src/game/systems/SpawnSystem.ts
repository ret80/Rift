/**
 * SpawnSystem — enemy spawn management via rifts.
 * Responsible for generating enemy queues, class selection, rift placement,
 * and announcing new enemy types.
 */

import { t } from "../../i18n";
import {
    C,
    EnemyKind,
    pickKindFor,
    pickKindForEnabled,
    waveTotalFor,
    zoneRadiusFor,
} from "../balance";
import type { EventBus } from "../core/EventBus";
import { TAU } from "../math";
import type { RiftField } from "../rifts";

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

// ============================== Spawn Constants ==============================

/** Процент врагов для стартового залпа (30%) */
const START_SPAWN_PCT = 0.3;
/** Процент убитых для создания нового разлома (10%) */
const KILL_THRESHOLD_PCT = 0.1;
/** Зона расширения для разломов (90%) */
const RIFT_THRESHOLD = 0.9;
/** Минимальное расстояние от игрока для размещения разлома */
const MIN_PLAYER_DIST = 220;
/** Минимальное расстояние от края зоны для размещения разлома */
const MIN_EDGE_DIST = 100;
/** Минимальное расстояние между разломами (чтобы не соприкасались) */
const MIN_RIFT_DIST = 140;
/** Количество проб по углу при поиске точки разлома */
const RIFT_ANGLE_PROBES = 7;
/** Угловой шаг между пробами (радианы) */
const RIFT_ANGLE_STEP = 0.4;
/** Количество проб по радиусу при поиске точки разлома */
const RIFT_RADIUS_PROBES = 4;

export class SpawnSystem {
  private eventBus: EventBus;
  private riftField: RiftField;
  private announcedKinds = new Set<EnemyKind>();
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
    eventBus: EventBus;
    riftField: RiftField;
  }) {
    this.eventBus = config.eventBus;
    this.riftField = config.riftField;
  }

  /**
   * Get total enemy count for a wave.
   */
  waveTotalCount(w: number): number {
    return waveTotalFor(w);
  }

  /**
   * Get zone radius for a wave.
   */
  zoneRadius(w: number): number {
    return zoneRadiusFor(w);
  }

  /**
   * Select enemy class with wave progression.
   */
  pickKind(w: number): EnemyKind {
    return pickKindFor(w);
  }

  /**
   * Build enemy spawn queue.
   * Guarantees at least a minimum count of each unlocked class.
   * Progressive composition: more tricky enemies on later waves.
   */
  buildQueue(count: number, wave: number): EnemyKind[] {
    const q: EnemyKind[] = [];
    for (let i = 0; i < count; i++) q.push(this.pickKindForWave(wave));
    return q;
  }

  /**
   * Class weights for wave progression.
   * Drones decrease, hunters and fighters grow.
   * Uses canonical kindWeights from balance/waves.ts.
   */
  private pickKindForWave(w: number): EnemyKind {
    if (this.enabledEnemies && this.enabledEnemies.length > 0) {
      return pickKindForEnabled(w, this.enabledEnemies);
    }
    // Use canonical kindWeights from balance/waves.ts
    return pickKindFor(w);
  }

  /**
   * Set which enemy kinds are allowed to spawn.
   * Null means all enemies enabled (default).
   */
  setEnabledEnemies(enemies: EnemyKind[] | null): void {
    this.enabledEnemies = enemies;
  }

  /**
   * Get rift count for a wave.
   */
  riftCountFor(w: number): number {
    if (w === 1) return 2;
    if (w < 6) return 3;
    if (w < 12) return 4;
    if (w < 20) return 4 + (Math.random() < 0.5 ? 1 : 0);
    return 5;
  }

  /**
   * Размещает N точек спавна разломов в зоне так, чтобы они:
   *  - были не ближе MIN_PLAYER_DIST к игроку;
   *  - были не ближе MIN_EDGE_DIST к краю зоны;
   *  - были разнесены друг от друга и от уже существующих разломов на minDist.
   *
   * Механизм: отталкиваемся от «противоположной игроку» стороны зоны.
   * Базовый луч идёт от игрока через центр зоны и продолжаетcя за центр —
   * это самая дальняя от игрока точка. Стартовые разломы распределяются
   * равномерным угловым шагом вокруг центра, начиная с этого луча. Для каждой
   * точки подбираем безопасный радиус и при необходимости сдвигаем по углу,
   * разводя относительно игрока и уже размещённых разломов.
   */
  placeRiftPoints(
    count: number,
    zoneX: number,
    zoneY: number,
    zoneRadius: number,
    playerX: number,
    playerY: number,
    existing: Array<{ x: number; y: number }>,
    minDist: number
  ): Array<{ x: number; y: number }> {
    const placed: Array<{ x: number; y: number }> = [];
    // Все точки-конкуренты: уже существующие разломы + только что размещённые
    const occupied = [...existing];

    // Дальний от игрока луч: направление «игрок → центр», продолженное за центр
    const awayAngle = Math.atan2(zoneY - playerY, zoneX - playerX);

    // Допустимый диапазон радиуса: не близко к игроку и не у самого края
    const rMax = Math.max(60, zoneRadius - MIN_EDGE_DIST);

    // Угловой шаг для равномерного распределения стартовых разломов
    const step = TAU / Math.max(1, count);

    for (let i = 0; i < count; i++) {
      // Равномерно вокруг центра, начиная с дальнего от игрока луча
      const baseAngle = awayAngle + (i - (count - 1) / 2) * step;

      let best: { x: number; y: number } | null = null;
      let bestScore = -Infinity;

      // Пробуем несколько смещений по углу и несколько радиусов,
      // выбирая наиболее «чистую» точку (максимум минимальной дистанции).
      for (let a = 0; a < RIFT_ANGLE_PROBES; a++) {
        const angle = baseAngle + (a - (RIFT_ANGLE_PROBES - 1) / 2) * RIFT_ANGLE_STEP;
        for (let r = 0; r < RIFT_RADIUS_PROBES; r++) {
          // Радиус от дальнего к ближнему к краю, но в пределах rMax
          const radius = rMax * (0.55 + 0.45 * (r / (RIFT_RADIUS_PROBES - 1)));
          const x = zoneX + Math.cos(angle) * radius;
          const y = zoneY + Math.sin(angle) * radius;

          const dPlayer = Math.hypot(x - playerX, y - playerY);
          const dEdge = zoneRadius - Math.hypot(x - zoneX, y - zoneY);
          if (dPlayer < MIN_PLAYER_DIST || dEdge < MIN_EDGE_DIST) continue;

          let dOcc = Infinity;
          for (const o of occupied) {
            dOcc = Math.min(dOcc, Math.hypot(x - o.x, y - o.y));
          }
          if (dOcc < minDist) continue;

          // Приоритет: чем дальше от occupied и от игрока — тем лучше
          const score = Math.min(dOcc, 300) + Math.min(dPlayer, 300) * 0.5;
          if (score > bestScore) {
            bestScore = score;
            best = { x, y };
          }
        }
      }

      // Если идеальной точки нет — берём компромисс: игнорируем требование
      // разнесения от occupied, но сохраняем дистанцию от игрока и края.
      if (!best) {
        best = this.fallbackRiftPoint(zoneX, zoneY, zoneRadius, playerX, playerY);
      }

      placed.push(best);
      occupied.push(best);
    }

    return placed;
  }

  /**
   * Запасная точка: максимально далеко от игрока и края, игнорируя occupied.
   */
  private fallbackRiftPoint(
    zoneX: number,
    zoneY: number,
    zoneRadius: number,
    playerX: number,
    playerY: number
  ): { x: number; y: number } {
    const awayAngle = Math.atan2(zoneY - playerY, zoneX - playerX);
    const radius = Math.max(60, (zoneRadius - MIN_EDGE_DIST) * 0.8);
    return {
      x: zoneX + Math.cos(awayAngle) * radius,
      y: zoneY + Math.sin(awayAngle) * radius,
    };
  }

  /**
   * Announce new enemy classes.
   */
  announceNewKinds(queue: EnemyKind[], wave: number, onToast: (t: { text: string; color?: string }) => void): void {
    for (const k of queue) {
      if (!this.announcedKinds.has(k)) {
        this.announcedKinds.add(k);
        const key = ("toast." + k) as "toast.drone";
        onToast({ text: t(key), color: C.rift });
      }
    }
  }

  /**
   * Clear announced classes.
   */
  clearAnnounced(): void {
    this.announcedKinds.clear();
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

  /**
   * Инициализация волны: создаёт стартовые разломы с 30% врагов.
   * Все стартовые разломы размещаются разом, разведённые друг от друга.
   */
  initWave(deps: SpawnDependencies): void {
    this.total = this.waveTotalCount(deps.wave);
    this.spawned = 0;
    this.killed = 0;
    this.nextThreshold = Math.ceil(this.total * KILL_THRESHOLD_PCT);
    this.lastTriggeredKills = 0;
    this.startRifts = this.riftCountFor(deps.wave);

    const zone = deps.zoneState;
    const zoneX = zone?.x ?? 0;
    const zoneY = zone?.y ?? 0;
    const zoneR = zone?.radius ?? this.zoneRadius(deps.wave);

    // Размещаем все стартовые точки разом (разводим друг от друга)
    const points = this.placeRiftPoints(
      this.startRifts,
      zoneX, zoneY, zoneR,
      deps.playerX, deps.playerY,
      this.existingRiftPoints(),
      MIN_RIFT_DIST
    );

    // Стартовый пул: 30% врагов
    const startCount = Math.ceil(this.total * START_SPAWN_PCT);
    const perRift = Math.floor(startCount / this.startRifts);
    const remainder = startCount % this.startRifts;

    for (let i = 0; i < this.startRifts; i++) {
      const count = perRift + (i < remainder ? 1 : 0);
      const queue = this.buildQueue(count, deps.wave);
      this.spawnRiftAt(deps, queue, points[i]);
      this.spawned += count;
    }
  }

  /**
   * Проверка необходимости создания подкрепления.
   * Создаёт разлом при достижении порога убитых, разведённый от существующих.
   */
  trySpawnReinforcements(killed: number, deps: SpawnDependencies): void {
    if (this.total <= 0) return;
    if (killed < this.nextThreshold) return;
    if (killed <= this.lastTriggeredKills) return;
    if (this.spawned >= this.total) return;

    // Количество врагов для подкрепления: 10% от total
    const count = Math.min(
      Math.ceil(this.total * 0.1),
      this.total - this.spawned
    );
    if (count <= 0) return;

    const zone = deps.zoneState;
    const zoneX = zone?.x ?? 0;
    const zoneY = zone?.y ?? 0;
    const zoneR = zone?.radius ?? this.zoneRadius(deps.wave);

    // Точка подкрепления разводится от существующих разломов и игрока
    const points = this.placeRiftPoints(
      1,
      zoneX, zoneY, zoneR,
      deps.playerX, deps.playerY,
      this.existingRiftPoints(),
      MIN_RIFT_DIST
    );

    const queue = this.buildQueue(count, deps.wave);
    this.spawnRiftAt(deps, queue, points[0]);
    this.spawned += count;

    this.lastTriggeredKills = killed;
    this.nextThreshold = killed + Math.ceil(this.total * KILL_THRESHOLD_PCT);
  }

  /** Координаты уже активных разломов. */
  private existingRiftPoints(): Array<{ x: number; y: number }> {
    return this.riftField.riftList.map((r) => ({ x: r.x, y: r.y }));
  }

  update(dt: number, deps: SpawnDependencies): void {
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
      if (zoneTarget > 0 && zoneR < zoneTarget * RIFT_THRESHOLD) return;
      this.initWave(deps);
      // Анонсируем типы врагов из стартовых разломов
      this.announceNewKinds(
        this.riftField.riftList.flatMap((r) => r.queue),
        deps.wave,
        (data) => { hooks.onToast?.(data); }
      );
      return;
    }

    // Обновляем счётчик убитых
    this.killed = killedWave;

    // Проверяем, нужно ли создать подкрепление
    this.trySpawnReinforcements(killedWave, deps);

    // Анонсируем новые типы врагов
    this.announceNewKinds(
      this.riftField.riftList.flatMap((r) => r.queue),
      deps.wave,
      (data) => { hooks.onToast?.(data); }
    );
  }

  /**
   * Создаёт разлом с указанной очередью врагов в готовой точке.
   */
  private spawnRiftAt(
    deps: SpawnDependencies,
    queue: EnemyKind[],
    point: { x: number; y: number }
  ): void {
    const size = 80 + Math.random() * 40;
    deps.riftField.spawn(point.x, point.y, queue, 0, size);
  }
}
