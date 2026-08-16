/**
 * Player - сущность игрока.
 * Инкапсулирует всю логику движения, стрельбы, даша и управления дронами/минами.
 */

import { 
  PLAYER_MAX_SPEED, 
  PLAYER_ACCEL, 
  PLAYER_RADIUS,
  DASH_TIME,
  DASH_ACCEL,
  DASH_SPEED,
  MAX_GUNS,
  MAX_ALLY_DRONES,
  GUN_OFFS,
  RATE_BOOST_TIME,
} from '../balance';
import type { EventBus } from '../core/EventBus';

export interface PlayerConfig {
  eventBus: EventBus;
}

export class Player {
  // Позиция и движение
  public x: number = 0;
  public y: number = 0;
  public vx: number = 0;
  public vy: number = 0;
  public angle: number = -Math.PI / 2;
  
  // Здоровье
  public hp: number = 100;
  public maxHp: number = 100;
  public invuln: number = 0;
  
  // Оружие
  public guns: number = 1;
  public fireCd: number = 0;
  public rateBoost: number = 0;
  public rateT: number = 0;
  
  // Даш
  public dashT: number = 0;
  
  // Мины
  public mineDropT: number = -1;
  
  // Дроны
  public allyDrones: AllyDrone[] = [];
  
  private eventBus: EventBus;

  constructor(config: PlayerConfig) {
    this.eventBus = config.eventBus;
  }

  /**
   * Обновить состояние игрока.
   * @param dt - дельта времени в секундах
   * @param inputDir - направление ввода (нормализованный вектор) или null
   * @param aimAngle - угол прицеливания или null
   */
  update(
    dt: number,
    inputDir: { x: number; y: number } | null,
    aimAngle: number | null,
  ): void {
    // Обновление таймеров
    if (this.rateT > 0) {
      this.rateT -= dt;
      if (this.rateT <= 0) {
        this.rateBoost = 0;
      }
    }
    
    if (this.invuln > 0) {
      this.invuln -= dt;
    }
    
    if (this.dashT > 0) {
      this.dashT -= dt;
    }
    
    if (this.mineDropT > 0) {
      this.mineDropT -= dt;
    }
    
    // Прицеливание
    if (aimAngle !== null) {
      this.angle = aimAngle;
    }
    
    // Движение
    if (inputDir !== null) {
      const isDashing = this.dashT > 0;
      const accel = isDashing ? PLAYER_ACCEL * DASH_ACCEL : PLAYER_ACCEL;
      const maxSpeed = isDashing ? PLAYER_MAX_SPEED * DASH_SPEED : PLAYER_MAX_SPEED;
      
      this.vx += inputDir.x * accel * dt;
      this.vy += inputDir.y * accel * dt;
      
      // Ограничение скорости
      const speed = Math.hypot(this.vx, this.vy);
      if (speed > maxSpeed) {
        const scale = maxSpeed / speed;
        this.vx *= scale;
        this.vy *= scale;
      }
    } else {
      // Трение при отсутствии ввода
      this.vx *= 0.95;
      this.vy *= 0.95;
    }
    
    // Интеграция позиции
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Обновление кулдауна стрельбы
    if (this.fireCd > 0) {
      const rateMult = this.rateBoost > 0 ? 1.5 : 1.0;
      this.fireCd -= dt * rateMult;
    }
    
    // Обновление дронов
    this.updateDrones(dt);
  }

  /**
   * Активировать даш.
   */
  activateDash(): void {
    if (this.dashT <= 0) {
      this.dashT = DASH_TIME;
      this.eventBus.publish('dash_activated', { x: this.x, y: this.y });
    }
  }

  /**
   * Попытаться выстрелить.
   * @returns true если выстрел произошел
   */
  tryFire(): boolean {
    if (this.fireCd > 0) return false;
    
    this.fireCd = 0.15 / (this.rateBoost > 0 ? 1.5 : 1.0);
    return true;
  }

  /**
   * Получить количество активных орудий.
   */
  getActiveGuns(): number {
    return Math.min(this.guns, MAX_GUNS);
  }

  /**
   * Получить смещения орудий для мульти-гана.
   */
  getGunOffsets(): number[] {
    const count = this.getActiveGuns();
    return GUN_OFFS.slice(0, count);
  }

  /**
   * Добавить дрон-компаньон.
   */
  addDrone(drone: AllyDrone): void {
    if (this.allyDrones.length < MAX_ALLY_DRONES) {
      this.allyDrones.push(drone);
    }
  }

  /**
   * Удалить мертвые дроны.
   */
  cleanupDrones(): void {
    this.allyDrones = this.allyDrones.filter(d => d.hp > 0);
  }

  /**
   * Обновить дроны-компаньоны.
   */
  private updateDrones(dt: number): void {
    for (const drone of this.allyDrones) {
      if (drone.fireCd > 0) {
        drone.fireCd -= dt;
      }
      if (drone.retargetT > 0) {
        drone.retargetT -= dt;
      }
    }
  }

  /**
   * Нанести урон игроку.
   * @returns true если игрок получил урон (не в неуязвимости)
   */
  takeDamage(amount: number): boolean {
    if (this.invuln > 0) return false;
    
    this.hp -= amount;
    this.invuln = 0.5;
    
    this.eventBus.publish('player_damaged', {
      hp: this.hp,
      maxHp: this.maxHp,
      amount,
    });
    
    return true;
  }

  /**
   * Полечить игрока.
   */
  heal(amount: number): number {
    const oldHp = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    const healed = this.hp - oldHp;
    
    if (healed > 0) {
      this.eventBus.publish('player_healed', {
        hp: this.hp,
        maxHp: this.maxHp,
        amount: healed,
      });
    }
    
    return healed;
  }

  /**
   * Проверить, жив ли игрок.
   */
  isAlive(): boolean {
    return this.hp > 0;
  }

  /**
   * Сбросить состояние для нового раунда.
   */
  reset(startX: number = 0, startY: number = 0): void {
    this.x = startX;
    this.y = startY;
    this.vx = 0;
    this.vy = 0;
    this.angle = -Math.PI / 2;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.guns = 1;
    this.fireCd = 0;
    this.rateBoost = 0;
    this.rateT = 0;
    this.dashT = 0;
    this.mineDropT = -1;
    this.allyDrones = [];
  }
}

export interface AllyDrone {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
  phase: number;
  hp: number;
  maxHp: number;
  targetIndex: number | null;
  retargetT: number;
  flash: number;
}
