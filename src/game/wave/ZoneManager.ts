/**
 * ZoneManager - управление зоной (безопасная область).
 * Отвечает за расширение, схлопывание и проверку границ зоны.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import { ZONE_EXPAND_SPEED, ZONE_EDGE_HYSTERESIS } from '../balance';

export interface ZoneConfig {
  eventBus: EventBus;
  state: GameState;
}

export class ZoneManager {
  private eventBus: EventBus;
  private state: GameState;
  
  // Состояние края зоны
  private edgeOutT: number = 0;
  private edgeTickT: number = 0;
  private edgeWarned: boolean = false;

  constructor(config: ZoneConfig) {
    this.eventBus = config.eventBus;
    this.state = config.state;
  }

  /**
   * Обновить состояние зоны.
   * @param dt - дельта времени
   * @param playerX - позиция игрока X
   * @param playerY - позиция игрока Y
   */
  update(dt: number, playerX: number, playerY: number): void {
    const zone = this.state.zone;
    
    if (!zone.active) return;

    // Расширение зоны
    if (zone.radius < zone.targetRadius) {
      zone.radius = Math.min(
        zone.targetRadius,
        zone.radius + ZONE_EXPAND_SPEED * dt
      );
      
      this.eventBus.publish('zone_expanded', {
        radius: zone.radius,
        targetRadius: zone.targetRadius,
      });
    }

    // Схлопывание зоны (после зачистки волны)
    if (zone.collapseT >= 0) {
      zone.collapseT += dt;
      zone.alpha = Math.max(0, 1 - zone.collapseT / 2.5);
      
      if (zone.collapseT >= 2.5) {
        zone.active = false;
        zone.alpha = 0;
        zone.collapseT = -1;
      }
    }

    // Проверка нахождения игрока на краю зоны
    this.updateEdgeCheck(playerX, playerY, dt);
  }

  /**
   * Проверить, находится ли игрок на краю зоны.
   */
  private updateEdgeCheck(playerX: number, playerY: number, dt: number): void {
    const zone = this.state.zone;
    if (!zone.active) return;

    const distToCenter = Math.hypot(playerX - zone.x, playerY - zone.y);
    const distToEdge = zone.radius - distToCenter;
    const inDanger = distToEdge < ZONE_EDGE_HYSTERESIS;

    if (inDanger) {
      this.edgeOutT += dt;
      
      if (this.edgeOutT > 0.4 && !this.edgeWarned) {
        this.edgeWarned = true;
        // Можно отправить событие предупреждения
      }
      
      if (this.edgeOutT > 1.2) {
        this.edgeTickT += dt;
        
        if (this.edgeTickT > 0.33) {
          this.edgeTickT = 0;
          // Нанести урон игроку за нахождение вне зоны
          this.eventBus.publish('player_damaged', {
            hp: this.state.player.hp,
            maxHp: this.state.player.maxHp,
            amount: 10,
            reason: 'zone_edge',
          });
        }
      }
    } else {
      this.edgeOutT = 0;
      this.edgeTickT = 0;
      this.edgeWarned = false;
    }
  }

  /**
   * Инициализировать зону для новой волны.
   */
  initWave(waveX: number, waveY: number, targetRadius: number): void {
    const zone = this.state.zone;
    
    zone.x = waveX;
    zone.y = waveY;
    zone.targetRadius = targetRadius;
    zone.radius = 0;
    zone.alpha = 0;
    zone.collapseT = -1;
    zone.active = true;
    
    this.edgeOutT = 0;
    this.edgeTickT = 0;
    this.edgeWarned = false;
  }

  /**
   * Начать схлопывание зоны (после зачистки волны).
   */
  startCollapse(): void {
    const zone = this.state.zone;
    if (zone.active && zone.collapseT < 0) {
      zone.collapseT = 0;
      this.eventBus.publish('zone_collapsing', {
        x: zone.x,
        y: zone.y,
        radius: zone.radius,
      });
    }
  }

  /**
   * Получить текущий радиус зоны.
   */
  getRadius(): number {
    return this.state.zone.radius;
  }

  /**
   * Проверить, активна ли зона.
   */
  isActive(): boolean {
    return this.state.zone.active;
  }

  /**
   * Получить позицию центра зоны.
   */
  getCenter(): { x: number; y: number } {
    return { x: this.state.zone.x, y: this.state.zone.y };
  }
}
