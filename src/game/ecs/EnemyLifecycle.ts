/**
 * EnemyLifecycle — единственный путь изменения запаса прочности врага и его
 * гибели.
 *
 * Раньше урон и смерть шли двумя путями: `EcsWorld.damageEnemy` списывал HP и
 * публиковал `enemy_killed`, а `GameContext.killEnemy` убивал врага напрямую и
 * публиковал событие повторно. Теперь обе операции сведены сюда: HP, вспышка
 * попадания и публикация события живут в одном месте, а вызывающий код видит
 * только узкий порт `EnemyDamagePort`.
 */

import type { EventBus } from "../core/EventBus";
import type { EnemyRef } from "./refs";

/** Узкий порт боя: единственный способ нанести врагу урон. */
export interface EnemyDamagePort {
  /** Нанести урон; true — враг погиб от этого удара. */
  damageEnemy(enemy: EnemyRef, dmg: number): boolean;
}

export class EnemyLifecycle implements EnemyDamagePort {
  constructor(private readonly eventBus: EventBus) {}

  /**
   * Нанести урон и, если HP закончилось, завершить жизненный цикл врага.
   * Повторный урон по уже мёртвому врагу игнорируется.
   */
  damageEnemy(enemy: EnemyRef, dmg: number): boolean {
    if (enemy.marker.dead) return false;
    enemy.life.remaining -= dmg;
    enemy.marker.flash = 1;
    if (enemy.life.remaining <= 0) {
      this.die(enemy);
      return true;
    }
    return false;
  }

  /**
   * Мгновенная гибель без расчёта урона — контакт с игроком и другие
   * сценарии, где враг должен исчезнуть целиком. HP обнуляется, чтобы
   * инвариант «живой враг имеет HP > 0» сохранялся.
   */
  forceKill(enemy: EnemyRef): void {
    if (enemy.marker.dead) return;
    enemy.life.remaining = 0;
    enemy.marker.flash = 1;
    this.die(enemy);
  }

  /** Единственная точка публикации `enemy_killed` (дроп, счёт, волна). */
  private die(enemy: EnemyRef): void {
    enemy.marker.dead = true;
    this.eventBus.publish("enemy_killed", {
      score: enemy.marker.score,
      kind: enemy.marker.kind,
      x: enemy.position.x,
      y: enemy.position.y,
      seed: enemy.marker.seed,
    });
  }
}
