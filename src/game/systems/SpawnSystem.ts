/**
 * SpawnSystem — управление спавном врагов через рифты.
 * Отвечает за генерацию очередей врагов, выбор классов, размещение рифтов
 * и анонс новых типов врагов.
 */

import { t } from "../../i18n";
import type { EventBus } from "../core/EventBus";
import type { RiftField } from "../rifts";
import type { Fx } from "../fx";
import type { AudioEngine } from "../audio";
import {
  C,
  waveTotalFor,
  zoneRadiusFor,
  pickKindFor,
  type EnemyKind,
} from "../balance";
import { rand, TAU } from "../math";

export interface SpawnHooks {
  fx: Fx;
  audio: AudioEngine;
}

/** Данные о текущей волне для спавна. */
export interface WaveSpawnData {
  wave: number;
  total: number;
  allocated: number;
  killed: number;
  peakAlive: number;
  stepSize: number;
  dropThreshold: number;
}

export class SpawnSystem {
  private hooks: SpawnHooks;
  private eventBus: EventBus;
  private riftField: RiftField;
  private fx: Fx;
  private audio: AudioEngine;
  private currentWave = 1;
  private announcedKinds = new Set<EnemyKind>();
  private lastSpawnTime = 0;
  private riftSpawnTimers = 0;
  private spawnQueue: EnemyKind[] = [];
  private spawnIdx = 0;

  constructor(config: {
    hooks: SpawnHooks;
    eventBus: EventBus;
    riftField: RiftField;
    fx: Fx;
    audio: AudioEngine;
  }) {
    this.hooks = config.hooks;
    this.eventBus = config.eventBus;
    this.riftField = config.riftField;
    this.fx = config.fx;
    this.audio = config.audio;
  }

  /**
   * Получить общее количество врагов для волны.
   */
  waveTotalCount(w: number): number {
    return waveTotalFor(w);
  }

  /**
   * Получить радиус зоны для волны.
   */
  zoneRadius(w: number): number {
    return zoneRadiusFor(w);
  }

  /**
   * Выбрать класс врага с учётом прогрессии волн.
   */
  pickKind(w: number): EnemyKind {
    return pickKindFor(w);
  }

  /**
   * Построить очередь врагов для спавна.
   * Гарантирует хотя бы минимальное количество каждого разблокированного класса.
   */
   buildQueue(count: number, wave: number): EnemyKind[] {
     const q: EnemyKind[] = [];
     for (let i = 0; i < count; i++) q.push(this.pickKindForWave(wave));
     return q;
   }

  /**
   * Получить количество рифтов для волны.
   */
  riftCountFor(w: number): number {
    if (w === 1) return 2;
    if (w < 6) return 3;
    if (w < 12) return 4;
    if (w < 20) return 4 + (Math.random() < 0.5 ? 1 : 0);
    return 5;
  }

  /**
   * Найти точку для размещения рифта.
   */
  spawnRiftPoint(zoneX: number, zoneY: number, zoneRadius: number): { x: number; y: number } {
    // Рифты спавнятся ТОЛЬКО ВНУТРИ зоны, используя фактический радиус зоны
    const inner = zoneRadius * 0.25;
    const outer = Math.max(
      inner + 80,
      Math.min(zoneRadius * 0.62, zoneRadius - 100)
    );
    let bestP = { x: zoneX, y: zoneY - zoneRadius * 0.5 };
    let bestScore = -1;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const rr = rand(inner, outer);
      const x = zoneX + Math.cos(a) * rr;
      const y = zoneY + Math.sin(a) * rr;
      const dist = Math.hypot(x - zoneX, y - zoneY);
      const dPlayer = dist;
      const dEdge = zoneRadius - dist;
      // Пропускаем если слишком близко к игроку (<220) или краю зоны (<100)
      if (dPlayer < 220 || dEdge < 100) continue;
      let dRifts = 1e9;
      for (const rf of this.riftField.list)
        dRifts = Math.min(dRifts, Math.hypot(x - rf.x, y - rf.y));
      let dEnemies = 1e9;
      const score = Math.min(dPlayer, 400) + Math.min(dRifts, 300) * 1.5 + Math.min(dEnemies, 250);
      if (score > bestScore) {
        bestScore = score;
        bestP = { x, y };
      }
    }
    return bestP;
  }

  /**
   * Анонсировать новые классы врагов.
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
   * Сбросить анонсированные классы.
   */
  clearAnnounced(): void {
    this.announcedKinds.clear();
  }

  private pickKindForWave(w: number): EnemyKind {
    return pickKindFor(w);
  }

  /**
     * Обновить спавн.
     */
  update(dt: number, wave: number, allocated: number, killedWave: number, game: any): void {
    this.currentWave = wave;
    
    // Check if we need to spawn more enemies
    const totalNeeded = this.waveTotalCount(wave);
    const remaining = totalNeeded - killedWave;
    
    const inCountdown = game.countdownSystem?.isCountdownActive?.();
    // Use GameState.zone for zone status after refactoring
    const gameState = game.gameState;
    const zoneR = gameState?.zone?.radius ?? 0;
    const zoneOn = gameState?.zone?.active ?? false;
    const zoneX = gameState?.zone?.x ?? 0;
    const zoneY = gameState?.zone?.y ?? 0;
    const zoneTarget = gameState?.zone?.targetRadius ?? this.zoneRadius(wave);
    const riftCount = game.riftField?.list?.length ?? 0;
    
    if (inCountdown || !zoneOn) {
      return;
    }
    
    if (remaining > 0 && allocated < totalNeeded) {
      // Try to spawn next enemy from queue
      if (this.spawnQueue.length === 0 || this.spawnIdx >= this.spawnQueue.length) {
        // Build new queue
        this.spawnQueue = this.buildQueue(Math.min(20, totalNeeded - allocated), wave);
        this.spawnIdx = 0;
        
        // Announce new kinds
        this.announceNewKinds(this.spawnQueue, wave, (data) => {
          game.hooks?.onToast?.(data);
        });
      }
      
      // Spawn enemies based on spawn rate
      const spawnRate = Math.max(0.3, 1.0 - wave * 0.03);
      if (!this.lastSpawnTime) this.lastSpawnTime = 0;
      this.lastSpawnTime += dt;
      
      if (this.lastSpawnTime >= spawnRate && this.spawnIdx < this.spawnQueue.length) {
        this.lastSpawnTime = 0;
        this.spawnNextEnemy(game, wave);
      }
    }
  }
  
  private spawnNextEnemy(game: any, wave: number) {
    if (this.spawnIdx >= this.spawnQueue.length) return;
    
    const kind = this.spawnQueue[this.spawnIdx++];
    if (!kind) return;
    
    // Create rifts if needed
    const riftCount = this.riftCountFor(wave);
    if (game.riftField.list.length < riftCount) {
      this.riftSpawnTimers += 1;
      if (this.riftSpawnTimers >= 3) {
        this.riftSpawnTimers = 0;
        this.spawnRift(game);
      }
      // Wait for rift to be created before spawning
      return;
    }
    
    // Find an open rift to spawn from - enemies ONLY spawn from rifts
    for (const rf of game.riftField.list) {
      if (rf.state === "opening" || rf.state === "spawning") {
        rf.queue.push(kind);
        return;
      }
    }
    
    // If all rifts are closing/closed, create a new rift
    this.spawnRift(game);
  }
  
  private spawnRift(game: any) {
    const queue = this.buildQueue(3 + Math.floor(Math.random() * 3), game.wave);
    // Рифы спавнятся только после того как зона достаточно большая
    // Use GameState.zone for zone info after refactoring
    const gameState = game.gameState;
    const zoneX = gameState?.zone?.x ?? 0;
    const zoneY = gameState?.zone?.y ?? 0;
    const zoneR = gameState?.zone?.radius ?? this.zoneRadius(game.wave);
    const zoneTarget = gameState?.zone?.targetRadius ?? this.zoneRadius(game.wave);
    if (zoneR < zoneTarget * 0.9) return; // ждём полного раскрытия зоны (90%)
    const point = this.spawnRiftPoint(zoneX, zoneY, zoneR);
    const size = 80 + Math.random() * 40;
    game.riftField.spawn(point.x, point.y, queue, 0, size);
  }
}
