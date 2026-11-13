/**
 * EnemyAI - фабрика и менеджер ИИ стратегий для врагов.
 * Создает стратегии для каждого типа врага и управляет их обновлением.
 */

import type { EnemyRef } from '../ecs';
import type { GameContext } from './GameContext';
import type { IEnemyStrategy } from './IEnemyStrategy';
import { EnemyKind } from '../balance';
import { DroneStrategy } from './strategies/DroneStrategy';
import { HunterStrategy } from './strategies/HunterStrategy';
import { FighterStrategy } from './strategies/FighterStrategy';
import { CruiserStrategy } from './strategies/CruiserStrategy';
import { CarrierStrategy } from './strategies/CarrierStrategy';
import { MinerStrategy } from './strategies/MinerStrategy';
import { MineStrategy } from './strategies/MineStrategy';
import { BossStrategy } from './strategies/BossStrategy';
import { NeedleStrategy } from './strategies/NeedleStrategy';
import { ShieldbearerStrategy } from './strategies/ShieldbearerStrategy';
import { HarpoonerStrategy } from './strategies/HarpoonerStrategy';
import { SplitterStrategy } from './strategies/SplitterStrategy';
import { JammerStrategy } from './strategies/JammerStrategy';
import { VortexStrategy } from './strategies/VortexStrategy';
import { HiveMotherStrategy } from './strategies/HiveMotherStrategy';
import { TractorStrategy } from './strategies/TractorStrategy';
import { angleTo, smoothVelocity } from '../math';

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
    this.strategies.set(EnemyKind.Miner, new MinerStrategy());
    this.strategies.set(EnemyKind.Boss, new BossStrategy());
    this.strategies.set(EnemyKind.Mine, new MineStrategy());
    this.strategies.set(EnemyKind.Needle, new NeedleStrategy());
    this.strategies.set(EnemyKind.Shieldbearer, new ShieldbearerStrategy());
    this.strategies.set(EnemyKind.Harpooner, new HarpoonerStrategy());
    this.strategies.set(EnemyKind.Splitter, new SplitterStrategy());
    this.strategies.set(EnemyKind.Jammer, new JammerStrategy());
    this.strategies.set(EnemyKind.Vortex, new VortexStrategy());
    this.strategies.set(EnemyKind.HiveMother, new HiveMotherStrategy());
    this.strategies.set(EnemyKind.Tractor, new TractorStrategy());
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
  updateAI(enemies: EnemyRef[], context: GameContext, dt: number): void {
    for (const enemy of enemies) {
      if (enemy.marker.dead) continue;

      // Получаем стратегию для типа врага
      const strategy = this.getStrategy(enemy.marker.kind);

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
  private fallbackUpdate(enemy: EnemyRef, context: GameContext, dt: number): void {
    const angleToPlayer = angleTo(enemy.position.x, enemy.position.y, context.playerX, context.playerY);
    const speed = enemy.marker.speed;
    smoothVelocity(enemy.velocity, Math.cos(angleToPlayer) * speed, Math.sin(angleToPlayer) * speed, 6, dt);
    enemy.marker.angle = angleToPlayer;
  }

}
