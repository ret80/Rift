/**
 * Enemy - сущность врага.
 * Содержит данные о позиции, здоровье, типе и состоянии ИИ.
 */

import type { EnemyKind } from '../balance';
import type { IEnemyStrategy } from '../ai/IEnemyStrategy';

export interface EnemyData {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  dead: boolean;
  parent: Enemy | null;
}

export class Enemy implements EnemyData {
  public kind: EnemyKind;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public angle: number;
  public hp: number;
  public maxHp: number;
  public r: number;
  public speed: number;
  public contact: number;
  public score: number;
  public boltDmg: number;
  public fireCd: number;
  public mode: number;
  public modeT: number;
  public strafeDir: number;
  public seed: number;
  public spawnCd: number;
  public flash: number;
  public hitCd: number;
  public dead: boolean;
  public parent: Enemy | null;

  /** Стратегия ИИ для этого врага */
  public strategy: IEnemyStrategy | null = null;

  constructor(data: EnemyData) {
    this.kind = data.kind;
    this.x = data.x;
    this.y = data.y;
    this.vx = data.vx;
    this.vy = data.vy;
    this.angle = data.angle;
    this.hp = data.hp;
    this.maxHp = data.maxHp;
    this.r = data.r;
    this.speed = data.speed;
    this.contact = data.contact;
    this.score = data.score;
    this.boltDmg = data.boltDmg;
    this.fireCd = data.fireCd;
    this.mode = data.mode;
    this.modeT = data.modeT;
    this.strafeDir = data.strafeDir;
    this.seed = data.seed;
    this.spawnCd = data.spawnCd;
    this.flash = data.flash;
    this.hitCd = data.hitCd;
    this.dead = data.dead;
    this.parent = data.parent ?? null;
  }

  /**
   * Получить урон от контакта (для тарана).
   */
  getContactDamage(): number {
    return this.contact;
  }

  /**
   * Нанести урон врагу.
   * @returns true если враг умер
   */
  takeDamage(amount: number): boolean {
    this.hp -= amount;
    this.flash = 0.15; // визуальный эффект попадания
    this.hitCd = 0.1;
    
    if (this.hp <= 0) {
      this.dead = true;
      return true;
    }
    return false;
  }

  /**
   * Обновить позицию на основе скорости.
   */
  integrate(dt: number): void {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
  }

  /**
   * Проверить, готов ли враг к атаке.
   */
  canFire(): boolean {
    return this.fireCd <= 0 && this.boltDmg > 0;
  }

  /**
   * Сбросить кулдаун стрельбы.
   */
  resetFireCooldown(baseCd: number = 1.0): void {
    this.fireCd = baseCd;
  }
}
