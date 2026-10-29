/**
 * EntityPoolSystem — пулы сущностей с однотипными операциями.
 * Управляет массивом beamList. Враги, пикапы, снаряды и дроны
 * перенесены в ECS-мир (EcsWorld), поэтому здесь они — производные
 * getter'ы поверх ECS и точки регистрации/очистки.
 */

import type { Enemy, Bullet, EBullet, Pickup, AllyDrone, LaserBeam } from "../types";
import type { PickupKind } from "../balance";
import type { EcsWorld } from "../ecs";

export class EntityPoolSystem {
  private readonly ecs: EcsWorld;

  constructor(ecs: EcsWorld) {
    this.ecs = ecs;
  }

  /* Entity pools (private backing fields) */
  // Все сущности (враги, дроны, пикапы, снаряды, лучи) перенесены в ECS-мир,
  // поэтому ниже только производные getter'ы и регистрация/очистка.

  /* Лучи лазера хранятся в ECS-мире; отсюда — производное чтиво. */
  get beamList(): LaserBeam[] {
    return this.ecs.beams();
  }

  /* Враги хранятся в ECS-мире; отсюда — производное чтиво. */
  get enemyList(): Enemy[] {
    return this.ecs.enemies();
  }

  /* Дроны-компаньоны хранятся в ECS-мире; отсюда — производное чтиво. */
  get allyDroneList(): AllyDrone[] {
    return this.ecs.allyDrones();
  }

  /* Снаряды игрока хранятся в ECS-мире; отсюда — производное чтиво. */
  get bulletList(): Bullet[] {
    return this.ecs.bullets();
  }

  /* Вражеские снаряды хранятся в ECS-мире; отсюда — производное чтиво. */
  get enemyBulletList(): EBullet[] {
    return this.ecs.enemyBullets();
  }

  /* Pickups хранятся в ECS-мире; отсюда — производное чтиво. */
  get pickupList(): Pickup[] {
    return this.ecs.pickups();
  }

  /* Зарегистрировать врага в ECS-мире. */
  addEnemy(enemy: Enemy): void {
    this.ecs.addEnemy(enemy);
  }

  /* Зарегистрировать снаряд игрока в ECS-мире. */
  addBullet(bullet: Bullet): void {
    this.ecs.addBullet(bullet);
  }

  /* Зарегистрировать вражеский снаряд в ECS-мире. */
  addEnemyBullet(bullet: EBullet): void {
    this.ecs.addEnemyBullet(bullet);
  }

  /* Зарегистрировать дрон-компаньон в ECS-мире. */
  addAllyDrone(drone: AllyDrone): void {
    this.ecs.addAllyDrone(drone);
  }

  /* Зарегистрировать визуальный луч лазера в ECS-мире. */
  addBeam(beam: LaserBeam): void {
    this.ecs.addBeam(beam);
  }

  /* Очистить визуальные лучи лазера (перед перезапуском забега). */
  clearBeams(): void {
    this.ecs.clearBeams();
  }

  /* Очистить врагов (перед перезапуском забега). */
  clearEnemies(): void {
    this.ecs.clearEnemies();
  }

  /* Очистить снаряды игрока (перед перезапуском забега). */
  clearBullets(): void {
    this.ecs.clearBullets();
  }

  /* Очистить вражеские снаряды (перед перезапуском забега). */
  clearEnemyBullets(): void {
    this.ecs.clearEnemyBullets();
  }

  /* Очистить дроны-компаньоны (перед перезапуском забега). */
  clearAllyDrones(): void {
    this.ecs.clearAllyDrones();
  }

  /* Spawn enemy bullet — в ECS-мир */
  spawnEnemyBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    dmg: number,
    heavy: boolean,
    cruiser: boolean
  ): void {
    this.ecs.addEnemyBullet({
      x, y, vx, vy, life, dmg, heavy, cruiser,
      r: cruiser ? 5.5 : heavy ? 3.4 : 2.5,
      px: x, py: y,
      grazed: false,
    });
  }

  /* Spawn pickup — в ECS-мир */
  spawnPickup(
    kind: PickupKind,
    x: number,
    y: number,
    vx: number,
    vy: number
  ): void {
    this.ecs.spawnPickup(kind, x, y, vx, vy);
  }

  /* Очистить пикапы (перед перезапуском забега) */
  clearPickups(): void {
    this.ecs.clearPickups();
  }
}