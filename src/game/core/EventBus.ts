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

// ===== GameEventMap — discriminated union =====

export type GameEventMap = {
  enemy_killed: EnemyKilledPayload;
  player_damaged: { dmg: number };
  wave_started: WaveStartedPayload;
  pickup_collected: PickupCollectedPayload;
  asteroid_hit: AsteroidHitPayload;
  game_over: Record<string, never>;
  drone_hit: DroneHitPayload;
  drone_push_player: DronePushPlayerPayload;
  bullet_grazed: BulletGrazedPayload;
  score_added: ScoreAddedPayload;
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
      timestamp: performance.now(),
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
