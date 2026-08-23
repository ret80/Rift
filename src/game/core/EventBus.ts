/**
 * EventBus — central event bus for decoupling systems.
 * Systems subscribe to events and publish them without knowing each other.
 */

// ===== Event Payload Types =====

export interface EnemyKilledPayload {
  scoreValue?: number;
  kind?: string;
  x: number;
  y: number;
  enemy?: unknown;
  score?: number;
}

export interface PlayerHealedPayload {
  hp: number;
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

export interface MineDetonatedPayload {
  x: number;
  y: number;
  damage: number;
  radius: number;
}

export interface DroneFiredPayload {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
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

export interface PlayerHitPayload {
  dmg: number;
  x: number;
  y: number;
}

export interface FireBulletPayload {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  isEnemy: boolean;
}

export interface SpawnPickupPayload {
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

// ===== GameEventMap — discriminated union =====

export type GameEventMap = {
  enemy_killed: EnemyKilledPayload;
  player_damaged: { dmg: number };
  player_healed: PlayerHealedPayload;
  zone_expanded: { radius: number };
  zone_collapsing: { radius: number };
  wave_started: WaveStartedPayload;
  wave_cleared: Record<string, never>;
  pickup_collected: PickupCollectedPayload;
  enemy_spawned: { kind: string; x: number; y: number };
  rift_spawned: { x: number; y: number; kind: string };
  rift_closed: { x: number; y: number };
  asteroid_destroyed: { score: number; x: number; y: number };
  asteroid_hit: AsteroidHitPayload;
  mine_detonated: MineDetonatedPayload;
  dash_activated: Record<string, never>;
  game_over: Record<string, never>;
  score_changed: { delta: number; total: number };
  enemy_fired: { x: number; y: number; angle: number };
  physics_collision: { ax: number; ay: number; bx: number; by: number };
  drone_fired: DroneFiredPayload;
  drone_hit: DroneHitPayload;
  drone_push_player: DronePushPlayerPayload;
  player_fired: { x: number; y: number; angle: number };
  // Legacy
  player_hit: PlayerHitPayload;
  wave_start: { wave: number };
  spawn_enemy: { kind: string; x: number; y: number };
  fire_bullet: FireBulletPayload;
  spawn_pickup: SpawnPickupPayload;
  popup: { text: string; x: number; y: number; color: string };
  camera_shake: { strength: number; duration: number };
  zone_update: { radius: number; active: boolean };
  carrierSpawnDrone: { x: number; y: number };
  enemyFire: { x: number; y: number; angle: number };
  enemyBulletSpawn: { x: number; y: number; vx: number; vy: number; life: number; dmg: number };
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

  /** Check if any listeners are registered for an event. */
  hasListeners(eventType: EventType): boolean {
    const set = this.listeners.get(eventType);
    return set !== undefined && set.size > 0;
  }

  // ===== Aliases for backward compatibility =====

  /** Alias for subscribe. */
  on<T extends EventType>(eventType: T, callback: EventCallback<T>): () => void {
    return this.subscribe(eventType, callback);
  }

  /** Alias for publish. */
  emit<T extends EventType>(eventType: T, payload: GameEventMap[T]): void {
    this.publish(eventType, payload);
  }
}
