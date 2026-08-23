/**
 * SpawnSystem — enemy spawn management via rifts.
 * Responsible for generating enemy queues, class selection, rift placement,
 * and announcing new enemy types.
 */

import { t } from "../../i18n";
import type { EventBus } from "../core/EventBus";
import type { RiftField } from "../rifts";
import type { Fx } from "../fx";
import type { AudioManager } from "./AudioManager";
import {
  C,
  waveTotalFor,
  zoneRadiusFor,
  pickKindFor,
  pickKindForEnabled,
  EnemyKind,
} from "../balance";
import { rand, TAU } from "../math";

export interface SpawnHooks {
  fx: Fx;
  audio: AudioManager;
}

/** Dependencies injected to avoid tight coupling with Game. */
export interface SpawnDependencies {
  countdownSystem: { isCountdownActive?(): boolean };
  gameState: {
    zone: {
      radius: number;
      active: boolean;
      x: number;
      y: number;
      targetRadius?: number;
    } | null;
  };
  riftField: RiftField;
  hooks: { onToast?(data: { text: string; color?: string }): void };
  wave: number;
  allocated: number;
  killedWave: number;
}

/** Data about current wave for spawning. */
export interface WaveSpawnData {
  wave: number;
  total: number;
  allocated: number;
  killed: number;
  peakAlive: number;
  stepSize: number;
  dropThreshold: number;
}

// ============================== Spawn Constants ==============================

/** Number of enemies per spawn batch */
const BATCH_SPAWN = 20;
/** Minimum spawn rate interval (seconds) */
const SPAWN_RATE_MIN = 0.3;
/** Spawn rate reduction per wave */
const SPAWN_RATE_RAMP = 0.03;
/** Minimum rift spawn timer ticks */
const RIFT_SPAWN_TIMER = 3;
/** Zone expansion threshold for rift spawning (90%) */
const RIFT_THRESHOLD = 0.9;
/** Minimum distance from player for rift placement */
const MIN_PLAYER_DIST = 220;
/** Minimum distance from zone edge for rift placement */
const MIN_EDGE_DIST = 100;
/** Rift placement search iterations */
const RIFT_SAMPLE_ITERATIONS = 16;

export class SpawnSystem {
  private hooks: SpawnHooks;
  private eventBus: EventBus;
  private riftField: RiftField;
  private fx: Fx;
  private audio: AudioManager;
  private currentWave = 1;
  private announcedKinds = new Set<EnemyKind>();
  private lastSpawnTime = 0;
  private riftSpawnTimers = 0;
  private spawnQueue: EnemyKind[] = [];
  private spawnIdx = 0;
  private enabledEnemies: EnemyKind[] | null = null;

  constructor(config: {
    hooks: SpawnHooks;
    eventBus: EventBus;
    riftField: RiftField;
    fx: Fx;
    audio: AudioManager;
  }) {
    this.hooks = config.hooks;
    this.eventBus = config.eventBus;
    this.riftField = config.riftField;
    this.fx = config.fx;
    this.audio = config.audio;
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
   */
  private kindWeights(w: number): Record<EnemyKind, number> {
    return {
      drone: Math.max(0.1, 0.6 - w * 0.015),
      hunter: Math.max(0.1, 0.3 + w * 0.01),
      fighter: Math.max(0.1, 0.1 + w * 0.015),
      cruiser: Math.max(0, (w - 6) * 0.02),
      carrier: Math.max(0, (w - 10) * 0.01),
    };
  }

  /**
   * Select enemy class with wave progression and weights.
   */
  private pickKindForWave(w: number): EnemyKind {
    if (this.enabledEnemies && this.enabledEnemies.length > 0) {
      return pickKindForEnabled(w, this.enabledEnemies);
    }
    const weights = this.kindWeights(w);
    let total = 0;
    for (const wt of Object.values(weights)) total += wt;
    let roll = Math.random() * total;
    for (const [kind, wt] of Object.entries(weights) as [EnemyKind, number][]) {
      roll -= wt;
      if (roll <= 0) return kind;
    }
    return EnemyKind.Drone;
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
   * Find a point for rift placement.
   */
  spawnRiftPoint(zoneX: number, zoneY: number, zoneRadius: number): { x: number; y: number } {
    // Rifts spawn only after zone is large enough, using actual zone radius
    const inner = zoneRadius * 0.25;
    const outer = Math.max(
      inner + 80,
      Math.min(zoneRadius * 0.62, zoneRadius - 100)
    );
    let bestP = { x: zoneX, y: zoneY - zoneRadius * 0.5 };
    let bestScore = -1;
    for (let i = 0; i < RIFT_SAMPLE_ITERATIONS; i++) {
      const a = Math.random() * TAU;
      const rr = rand(inner, outer);
      const x = zoneX + Math.cos(a) * rr;
      const y = zoneY + Math.sin(a) * rr;
      const dist = Math.hypot(x - zoneX, y - zoneY);
      const dPlayer = dist;
      const dEdge = zoneRadius - dist;
      // Skip if too close to player or zone edge
      if (dPlayer < MIN_PLAYER_DIST || dEdge < MIN_EDGE_DIST) continue;
      let dRifts = 1e9;
      for (const rf of this.riftField.riftList) {
        dRifts = Math.min(dRifts, Math.hypot(x - rf.x, y - rf.y));
      }
      const dEnemies = 1e9;
      const score =
        Math.min(dPlayer, 400)
        + Math.min(dRifts, 300) * 1.5
        + Math.min(dEnemies, 250);
      if (score > bestScore) {
        bestScore = score;
        bestP = { x, y };
      }
    }
    return bestP;
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
   * Update spawn logic.
   */
  update(dt: number, deps: SpawnDependencies): void {
    const { countdownSystem, gameState, hooks, wave } = deps;
    this.currentWave = wave;

    // Check if we need to spawn more enemies
    const totalNeeded = this.waveTotalCount(wave);

    const inCountdown = countdownSystem?.isCountdownActive?.();
    const zoneOn = gameState?.zone?.active ?? false;

    if (inCountdown || !zoneOn) {
      return;
    }

    const allocated = deps.allocated;
    const killedWave = deps.killedWave;
    const remaining = totalNeeded - killedWave;

    if (remaining > 0 && allocated < totalNeeded) {
      // Try to spawn next enemy from queue
      if (this.spawnQueue.length === 0 || this.spawnIdx >= this.spawnQueue.length) {
        // Build new queue
        this.spawnQueue = this.buildQueue(
          Math.min(BATCH_SPAWN, totalNeeded - allocated),
          wave
        );
        this.spawnIdx = 0;

        // Announce new kinds
        this.announceNewKinds(
          this.spawnQueue,
          wave,
          (data) => {
            hooks.onToast?.(data);
          }
        );
      }

      // Spawn enemies based on spawn rate
      const spawnRate = Math.max(SPAWN_RATE_MIN, 1.0 - wave * SPAWN_RATE_RAMP);
      if (!this.lastSpawnTime) this.lastSpawnTime = 0;
      this.lastSpawnTime += dt;

      if (this.lastSpawnTime >= spawnRate && this.spawnIdx < this.spawnQueue.length) {
        this.lastSpawnTime = 0;
        this.spawnNextEnemy(deps);
      }
    }
  }

  private spawnNextEnemy(deps: SpawnDependencies): void {
    if (this.spawnIdx >= this.spawnQueue.length) return;

    const kind = this.spawnQueue[this.spawnIdx++];
    if (!kind) return;

    // Create rifts if needed
    const riftCount = this.riftCountFor(deps.wave);
    if (deps.riftField.riftList.length < riftCount) {
      this.riftSpawnTimers += 1;
      if (this.riftSpawnTimers >= RIFT_SPAWN_TIMER) {
        this.riftSpawnTimers = 0;
        this.spawnRift(deps);
      }
      // Wait for rift to be created before spawning
      return;
    }

    // Find an open rift to spawn from — enemies ONLY spawn from rifts
    for (const rf of deps.riftField.riftList) {
      if (rf.state === "opening" || rf.state === "spawning") {
        rf.queue.push(kind);
        return;
      }
    }

    // If all rifts are closing/closed, create a new rift
    this.spawnRift(deps);
  }

  private spawnRift(deps: SpawnDependencies): void {
    const queue = this.buildQueue(3 + Math.floor(Math.random() * 3), deps.wave);
    // Rifts spawn only after zone is large enough
    const gameState = deps.gameState;
    const zoneX = gameState?.zone?.x ?? 0;
    const zoneY = gameState?.zone?.y ?? 0;
    const zoneR = gameState?.zone?.radius ?? this.zoneRadius(deps.wave);
    const zoneTarget = gameState?.zone?.targetRadius ?? this.zoneRadius(deps.wave);
    if (zoneR < zoneTarget * RIFT_THRESHOLD) return; // wait for full zone expansion (90%)
    const point = this.spawnRiftPoint(zoneX, zoneY, zoneR);
    const size = 80 + Math.random() * 40;
    deps.riftField.spawn(point.x, point.y, queue, 0, size);
  }
}
