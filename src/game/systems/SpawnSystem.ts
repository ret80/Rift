/**
 * SpawnSystem — управление спавном врагов через рифты.
 * Отвечает за генерацию очередей врагов, выбор классов, размещение рифтов
 * и анонс новых типов врагов.
 */

import { t } from "../i18n";
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
  private currentWave = 1;
  private announcedKinds = new Set<EnemyKind>();

  constructor(config: {
    hooks: SpawnHooks;
    eventBus: EventBus;
    riftField: RiftField;
  }) {
    this.hooks = hooks;
    this.eventBus = eventBus;
    this.riftField = riftField;
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

    // guarantee at least one of each unlocked class so the player meets them
    const need: Array<[EnemyKind, number]> = [
      ["fighter", 2],
      ["hunter", 4],
      ["cruiser", 5],
      ["carrier", 9],
    ];
    for (const [kind, minW] of need) {
      if (wave >= minW && !q.includes(kind)) {
        const di = q.indexOf("drone");
        if (di >= 0) q[di] = kind;
      }
    }
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
  spawnRiftPoint(zoneX: number, zoneY: number, zoneTarget: number): { x: number; y: number } {
    const inner = zoneTarget * 0.25;
    const outer = Math.max(
      inner + 80,
      Math.min(zoneTarget * 0.62, zoneTarget - 115)
    );
    let bestP = { x: zoneX, y: zoneY - zoneTarget * 0.5 };
    let bestScore = -1;
    for (let i = 0; i < 16; i++) {
      const a = Math.random() * TAU;
      const rr = rand(inner, outer);
      const x = zoneX + Math.cos(a) * rr;
      const y = zoneY + Math.sin(a) * rr;
      const dPlayer = Math.hypot(x - zoneX, y - zoneY);
      const dEdge = zoneTarget - Math.hypot(x - zoneX, y - zoneY);
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
}
