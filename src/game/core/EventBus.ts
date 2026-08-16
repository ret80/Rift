/**
 * EventBus - центральная шина событий для декуплинга систем.
 * Системы подписываются на события и публикуют их, не зная друг о друге.
 */

export type EventType =
  | 'enemy_killed'
  | 'player_damaged'
  | 'player_healed'
  | 'zone_expanded'
  | 'zone_collapsing'
  | 'wave_started'
  | 'wave_cleared'
  | 'pickup_collected'
  | 'enemy_spawned'
  | 'rift_spawned'
  | 'rift_closed'
  | 'asteroid_destroyed'
  | 'mine_detonated'
  | 'dash_activated'
  | 'game_over'
  | 'score_changed'
  | 'enemy_fired'
  | 'physics_collision';

export interface GameEvent {
  type: EventType;
  payload: Record<string, unknown>;
  timestamp: number;
}

export type EventCallback = (event: GameEvent) => void;

export class EventBus {
  private listeners: Map<EventType, Set<EventCallback>> = new Map();

  /**
   * Подписаться на событие определенного типа.
   */
  subscribe(eventType: EventType, callback: EventCallback): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(callback);

    // Возвращаем функцию отписки
    return () => {
      this.listeners.get(eventType)?.delete(callback);
    };
  }

  /**
   * Опубликовать событие.
   */
  publish(eventType: EventType, payload: Record<string, unknown> = {}): void {
    const event: GameEvent = {
      type: eventType,
      payload,
      timestamp: performance.now(),
    };

    const callbacks = this.listeners.get(eventType);
    if (callbacks) {
      // Копируем в массив, чтобы изменения во время итерации не сломали подписку
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

  /**
   * Очистить все подписчики (для сброса состояния между раундами).
   */
  clear(): void {
    this.listeners.clear();
  }

  /**
   * Проверить, есть ли подписчики на событие.
   */
  hasListeners(eventType: EventType): boolean {
    const set = this.listeners.get(eventType);
    return set !== undefined && set.size > 0;
  }
}
