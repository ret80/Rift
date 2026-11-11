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
  constructor(
    private readonly eventBus: EventBus,
    /** Множитель входящего урона (аура Щитоносца). */
    private readonly damageMultiplier?: (enemy: EnemyRef) => number,
    /** Побочный эффект смерти (деление Делителя). */
    private readonly onDeath?: (enemy: EnemyRef) => void,
  ) {}

  /**
   * Нанести урон и, если HP закончилось, завершить жизненный цикл врага.
   * Повторный урон по уже мёртвому врагу игнорируется.
   */
  damageEnemy(enemy: EnemyRef, dmg: number): boolean {
    if (enemy.marker.dead) return false;
    const finalDmg = dmg * (this.damageMultiplier?.(enemy) ?? 1);
    // Щит элиты — отдельный слой над HP: сначала гасит урон, затем бьёт корпус.
    let hpDmg = finalDmg;
    if (enemy.marker.shieldHp > 0) {
      const absorbed = Math.min(enemy.marker.shieldHp, hpDmg);
      enemy.marker.shieldHp -= absorbed;
      hpDmg -= absorbed;
    }
    if (hpDmg > 0) enemy.life.remaining -= hpDmg;
    enemy.marker.flash = 1;
    const killed = enemy.life.remaining <= 0;
    if (killed) this.die(enemy);
    // Единственная точка публикации урона: сюда приходят и пули, и лазер,
    // и всё остальное, поэтому метрики не зависят от пути выстрела.
    this.eventBus.publish("enemy_damaged", {
      dmg: finalDmg,
      kind: String(enemy.marker.kind),
      killed,
    });
    return killed;
  }

  /**
   * Мгновенная гибель без расчёта урона — контакт с игроком и другие
   * сценарии, где враг должен исчезнуть целиком. HP обнуляется, чтобы
   * инвариант «живой враг имеет HP > 0» сохранялся.
   */
  forceKill(enemy: EnemyRef): void {
    if (enemy.marker.dead) return;
    enemy.marker.shieldHp = 0;
    enemy.life.remaining = 0;
    enemy.marker.flash = 1;
    this.die(enemy);
  }

  /** Лечение врага (регенерация/вампиризм); мёртвых не воскрешает. */
  healEnemy(enemy: EnemyRef, amount: number): void {
    if (enemy.marker.dead || amount <= 0) return;
    enemy.life.remaining = Math.min(enemy.life.max, enemy.life.remaining + amount);
  }

  /** Единственная точка публикации `enemy_killed` (дроп, счёт, волна). */
  private die(enemy: EnemyRef): void {
    enemy.marker.dead = true;
    this.onDeath?.(enemy);
    this.eventBus.publish("enemy_killed", {
      score: enemy.marker.score,
      kind: enemy.marker.kind,
      x: enemy.position.x,
      y: enemy.position.y,
      seed: enemy.marker.seed,
      elite: enemy.marker.affix !== null,
    });
  }
}
