/**
 * EnemyAI - фабрика и менеджер ИИ стратегий для врагов.
 * Создает стратегии для каждого типа врага и управляет их обновлением.
 */

import type { Enemy } from '../types';
import type { GameContext } from './GameContext';
import type { IEnemyStrategy } from './IEnemyStrategy';
import { EnemyKind } from '../balance';
import { DroneStrategy } from './strategies/DroneStrategy';
import { HunterStrategy } from './strategies/HunterStrategy';
import { FighterStrategy } from './strategies/FighterStrategy';
import { CruiserStrategy } from './strategies/CruiserStrategy';
import { CarrierStrategy } from './strategies/CarrierStrategy';

export class EnemyAI {
  private strategies: Map<string, IEnemyStrategy> = new Map();

  constructor() {
    this.registerStrategies();
  }

  /**
   * Зарегистрировать все доступные стратегии.
   */
  private registerStrategies(): void {
    this.strategies.set(EnemyKind.Drone, new DroneStrategy());
    this.strategies.set(EnemyKind.Hunter, new HunterStrategy());
    this.strategies.set(EnemyKind.Fighter, new FighterStrategy());
    this.strategies.set(EnemyKind.Cruiser, new CruiserStrategy());
    this.strategies.set(EnemyKind.Carrier, new CarrierStrategy());
  }

  /**
   * Получить стратегию для типа врага.
   */
  getStrategy(kind: EnemyKind): IEnemyStrategy | null {
    return this.strategies.get(kind) || null;
  }

  /**
   * Обновить AI всех врагов (только движение).
   * Позиция применяется отдельно в EnemySystem.
   * @param enemies - массив врагов для обновления
   * @param context - контекст игры
   * @param dt - дельта времени
   */
  updateAI(enemies: Enemy[], context: GameContext, dt: number): void {
    for (const enemy of enemies) {
      if (enemy.dead) continue;

      // Получаем стратегию для типа врага
      const strategy = this.getStrategy(enemy.kind);

      if (strategy) {
        strategy.update(enemy, context, dt);
      } else {
        // Fallback - простое движение к игроку
        this.fallbackUpdate(enemy, context, dt);
      }
    }
  }

  /**
   * Резервное обновление для врагов без стратегии.
   */
  private fallbackUpdate(enemy: Enemy, context: GameContext, dt: number): void {
    const angleToPlayer = Math.atan2(
      context.playerY - enemy.y,
      context.playerX - enemy.x
    );
    
    const speed = enemy.speed;
    const k = 1 - Math.exp(-6 * dt);
    enemy.vx += (Math.cos(angleToPlayer) * speed - enemy.vx) * k;
    enemy.vy += (Math.sin(angleToPlayer) * speed - enemy.vy) * k;
    enemy.angle = angleToPlayer;
  }

  /**
   * Обработать спавн дронов от Carrier.
   * Возвращает массив координат для спавна.
   */
  processCarrierSpawns(enemies: Enemy[], context: GameContext, dt: number): Array<{ x: number; y: number }> {
    const spawns: Array<{ x: number; y: number }> = [];

    for (const carrier of enemies) {
      if (carrier.kind !== EnemyKind.Carrier || carrier.dead) continue;

      const maxDrones = 12 + Math.floor(context.wave / 5);

      if (carrier.burstActive) {
        carrier.burstCd -= dt;
        if (carrier.burstCd <= 0 && carrier.burstSpawned < maxDrones) {
          carrier.burstCd = 0.35;
          carrier.burstSpawned++;
          // Случайный оффсет чтобы дроны не спавнились в центре
          const angle = Math.random() * Math.PI * 2;
          const offset = carrier.r + 25;
          spawns.push({
            x: carrier.x + Math.cos(angle) * offset,
            y: carrier.y + Math.sin(angle) * offset,
          });
        }
        // Конец бурста?
        if (carrier.burstSpawned >= maxDrones) {
          carrier.burstActive = false;
          carrier.burstRestT = Math.random() * (6 - 3) + 3;
        }
      } else {
        carrier.burstRestT -= dt;
        if (carrier.burstRestT <= 0) {
          carrier.burstActive = true;
          carrier.burstSpawned = 0;
        }
      }
    }

    return spawns;
  }
}
