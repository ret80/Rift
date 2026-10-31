/**
 * BulletDomain — жизненный цикл снарядов игрока и врагов.
 *
 * Владеет спавном из спецификаций, чтением живых связок и удалением по
 * сущности. DTO для чтения нет: рендер и коллизии работают с `BulletRef`
 * и `EnemyBulletRef`.
 */

import type { BulletSpawn, EnemyBulletSpawn } from "../spawn";
import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { BulletComponent } from "../components/BulletComponent";
import { BulletSweepComponent } from "../components/BulletSweepComponent";
import { EnemyBulletComponent } from "../components/EnemyBulletComponent";
import { HomingRef } from "../components/HomingRef";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import type { BulletRef, EnemyBulletRef, EnemyRef } from "../refs";

export class BulletDomain {
  private readonly bulletRefs = new WeakMap<GameEntity, BulletRef>();
  private readonly enemyBulletRefs = new WeakMap<GameEntity, EnemyBulletRef>();

  constructor(private readonly ecs: EcsEngine) {}

  /** Зарегистрировать снаряд игрока как ECS-сущность из чистых данных. */
  addBullet(bullet: BulletSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new BulletComponent(bullet.dmg));
    entity.components.add(new PositionComponent(bullet.x, bullet.y));
    entity.components.add(new VelocityComponent(bullet.vx, bullet.vy));
    entity.components.add(new LifeComponent(bullet.life, bullet.life));
    if (bullet.homing) {
      entity.components.add(new HomingRef(
        this.entityIdForEnemy(bullet.homing.target),
        bullet.homing.turnRate,
        bullet.homing.lockRange,
      ));
    }
    this.ecs.add(entity);
  }

  /** Зарегистрировать вражеский снаряд как ECS-сущность из чистых данных. */
  addEnemyBullet(bullet: EnemyBulletSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new EnemyBulletComponent(bullet.dmg, bullet.heavy, bullet.cruiser));
    entity.components.add(new PositionComponent(bullet.x, bullet.y));
    entity.components.add(new VelocityComponent(bullet.vx, bullet.vy));
    entity.components.add(new LifeComponent(bullet.life, bullet.life));
    entity.components.add(new RadiusComponent(bullet.r));
    entity.components.add(new BulletSweepComponent(bullet.px, bullet.py, bullet.grazed));
    this.ecs.add(entity);
  }

  /**
   * Спавн вражеского снаряда напрямую в ECS-мир.
   * Единственная точка создания вражеской пули.
   */
  spawnEnemyBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    dmg: number,
    heavy: boolean,
    cruiser: boolean,
  ): void {
    this.addEnemyBullet({
      x, y, vx, vy, life, dmg, heavy, cruiser,
      r: cruiser ? 5.5 : heavy ? 3.4 : 2.5,
      px: x, py: y,
      grazed: false,
    });
  }

  /** Живые связки снарядов игрока для рендера и коллизий. */
  bullets(out: BulletRef[] = []): BulletRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(BulletComponent)) {
      const ref = this.bulletRefOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  /** Живые связки вражеских снарядов для рендера и коллизий. */
  enemyBullets(out: EnemyBulletRef[] = []): EnemyBulletRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(EnemyBulletComponent)) {
      const ref = this.enemyBulletRefOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  /** Удалить снаряд игрока по живой связке. */
  removeBullet(bullet: BulletRef): void {
    this.ecs.remove(bullet.entity);
  }

  /** Удалить вражеский снаряд по живой связке. */
  removeEnemyBullet(bullet: EnemyBulletRef): void {
    this.ecs.remove(bullet.entity);
  }

  /** Удалить все снаряды игрока. */
  clearBullets(): void {
    for (const entity of [...this.ecs.entitiesWith(BulletComponent)]) {
      this.ecs.remove(entity);
    }
  }

  /** Удалить все вражеские снаряды. */
  clearEnemyBullets(): void {
    for (const entity of [...this.ecs.entitiesWith(EnemyBulletComponent)]) {
      this.ecs.remove(entity);
    }
  }

  private bulletRefOf(entity: GameEntity): BulletRef | null {
    const cached = this.bulletRefs.get(entity);
    if (cached) return cached;
    const bullet = entity.components.get(BulletComponent);
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const life = entity.components.get(LifeComponent);
    if (!bullet || !position || !velocity || !life) return null;
    const homing = entity.components.get(HomingRef) ?? undefined;
    const ref: BulletRef = { entity, bullet, position, velocity, life, homing };
    this.bulletRefs.set(entity, ref);
    return ref;
  }

  private enemyBulletRefOf(entity: GameEntity): EnemyBulletRef | null {
    const cached = this.enemyBulletRefs.get(entity);
    if (cached) return cached;
    const bullet = entity.components.get(EnemyBulletComponent);
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const life = entity.components.get(LifeComponent);
    const radius = entity.components.get(RadiusComponent);
    const sweep = entity.components.get(BulletSweepComponent);
    if (!bullet || !position || !velocity || !life || !radius || !sweep) return null;
    const ref: EnemyBulletRef = { entity, bullet, position, velocity, life, radius, sweep };
    this.enemyBulletRefs.set(entity, ref);
    return ref;
  }

  private entityIdForEnemy(target: EnemyRef | null): number | string | null {
    return target?.marker.ecsId ?? null;
  }
}
