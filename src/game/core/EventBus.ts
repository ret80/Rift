/**
 * EventBus — central event bus for decoupling systems.
 * Systems subscribe to events and publish them without knowing each other.
 */

// ===== Event Payload Types =====

export interface EnemyKilledPayload {
  /** Очки за убийство врага. */
  score: number;
  kind: string;
  x: number;
  y: number;
  /** Семя врага — для детерминированного дропа. */
  seed?: number;
  /** Элитный враг (учёт для кредитов и статистики). */
  elite?: boolean;
}

export interface WaveStartedPayload {
  wave: number;
}

export interface PickupCollectedPayload {
  kind: string;
  x: number;
  y: number;
}

export interface AsteroidHitPayload {
  index: number;
  dmg: number;
  vx: number;
  vy: number;
  x: number;
  y: number;
}

export interface DroneHitPayload {
  x: number;
  y: number;
  dmg: number;
  dead: boolean;
}

export interface DronePushPlayerPayload {
  vx: number;
  vy: number;
}

export interface BulletGrazedPayload {
  /** Сколько снарядов засчитано как касание за кадр. */
  count: number;
  /** Позиция корабля в момент касания — для эффектов. */
  x: number;
  y: number;
}

/** Начисление очков без прямого вызова системы счёта. */
export interface ScoreAddedPayload {
  /** Сколько очков начислено. */
  amount: number;
}

/** Урон, нанесённый врагу (для метрик симуляции). */
export interface EnemyDamagedPayload {
  /** Нанесённый урон. */
  dmg: number;
  /** Вид врага. */
  kind: string;
  /** Погиб ли враг от этого удара. */
  killed: boolean;
}

/** Выстрел игрока (для метрик: все выстрелы считаются в одной точке). */
export interface PlayerShotPayload {
  /** Необязательная подпись источника. */
  source?: string;
}

// ===== GameEventMap — discriminated union =====

export type GameEventMap = {
  enemy_killed: EnemyKilledPayload;
  /** `angle` — направление на источник удара для активного щита. */
  player_damaged: { dmg: number; source?: string; angle?: number };
  /**
   * Урон среды (буря на кромке) — отдельный канал.
   *
   * `player_damaged` применяется через PlayerSystem.hit: кадры
   * неуязвимости и щит. Для непрерывного урона среды это не подходит —
   * он уже прошёл через щит и не должен давать неуязвимость.
   */
  player_zone_damaged: { dmg: number; source: string };
  wave_started: WaveStartedPayload;
  pickup_collected: PickupCollectedPayload;
  asteroid_hit: AsteroidHitPayload;
  game_over: Record<string, never>;
  drone_hit: DroneHitPayload;
  drone_push_player: DronePushPlayerPayload;
  bullet_grazed: BulletGrazedPayload;
  score_added: ScoreAddedPayload;
  enemy_damaged: EnemyDamagedPayload;
  player_shot: PlayerShotPayload;
  ability_used: { id: string };
};

export type EventType = keyof GameEventMap;

export interface GameEvent<T extends EventType = EventType> {
  type: T;
  payload: GameEventMap[T];
  timestamp: number;
}

export type EventCallback<T extends EventType = EventType> = (event: GameEvent<T>) => void;

// ===== EventBus =====

export class EventBus {
  private listeners: Map<EventType, Set<EventCallback>> = new Map();

  /**
   * Часы мира для метки события.
   *
   * В браузере по умолчанию берётся `performance.now()`, в симуляции хост
   * инжектит детерминированное время `tick * FIXED_DT` — иначе timestamp
   * события делал бы прогон невоспроизводимым.
   */
  private readonly now: () => number;

  constructor(now?: () => number) {
    this.now = now ?? (() => (typeof performance === "undefined" ? 0 : performance.now()));
  }

  /** Subscribe to a specific event type. */
  subscribe<T extends EventType>(eventType: T, callback: EventCallback<T>): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback as EventCallback);

    return () => {
      this.listeners.get(eventType)?.delete(callback as EventCallback);
    };
  }

  /** Publish an event with a typed payload. */
  publish<T extends EventType>(eventType: T, payload: GameEventMap[T]): void {
    const event: GameEvent<T> = {
      type: eventType,
      payload,
      timestamp: this.now(),
    };

    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      const snapshot = Array.from(callbacks);
      for (const cb of snapshot) {
        try {
          cb(event);
        } catch (err) {
          console.error(`[EventBus] Error in ${eventType} listener:`, err);
        }
      }
    }
  }

  /** Clear all listeners (for round reset). */
  clear(): void {
    this.listeners.clear();
  }
}
