/**
 * ShieldSystem — энергетический щит игрока.
 *
 * Щит блокирует часть входящего урона в процентах: при блокировке 20%
 * удар в 10 единиц снимает 8 корпуса. Каждая единица поглощённого урона
 * тратит энергию щита. Энергия постепенно восстанавливается; если она
 * упала до нуля, щит уходит в перезагрузку на SHIELD_OVERLOAD_TIME,
 * после чего сразу возвращается на максимум и снова работает.
 *
 * Процент блокировки и скорость восстановления приходят из прокачки.
 */

import {
  SHIELD_DRAIN_PER_DAMAGE,
  SHIELD_ENERGY_MAX,
  SHIELD_FLASH_TIME,
  SHIELD_OVERLOAD_TIME,
  shieldBlockPercent,
  shieldRegenPerSecond,
} from "../balance/player";

/** Снимок состояния щита для рендера и HUD. */
export interface ShieldSnapshot {
  /** Запас энергии 0..1. */
  energy: number;
  /** Процент блокируемого урона 0..1. */
  block: number;
  /** Щит в перезагрузке. */
  overloaded: boolean;
  /** Остаток перезагрузки, секунды. */
  overloadLeft: number;
  /** Остаток вспышки после срабатывания 0..1 (1 — только что сработал). */
  flash: number;
}

export class ShieldSystem {
  /** Уровень линии «процент щита». */
  private blockLevel = 0;
  /** Прибавка к скорости восстановления из линии прокачки (0..1+, доля). */
  private regenBonus = 0;

  /** Текущая энергия. */
  private energy = SHIELD_ENERGY_MAX;
  /** Остаток перезагрузки, секунды (0 — щит работает). */
  private overloadT = 0;
  /** Остаток вспышки после срабатывания, секунды. */
  private flashT = 0;

  /* ======================== Upgrade hooks ======================== */

  /** Задать процент блокировки урона по уровню прокачки. */
  setBlockLevel(level: number): void {
    this.blockLevel = Math.max(0, level);
  }

  /** Задать уровень линии скорости восстановления. */
  setRegenLevel(level: number): void {
    this.regenBonus = Math.max(0, level);
  }

  /** Процент блокируемого урона (0..1). */
  getBlockPercent(): number {
    return shieldBlockPercent(this.blockLevel);
  }

  /** Текущая скорость восстановления энергии, единиц в секунду. */
  getRegenRate(): number {
    return shieldRegenPerSecond(this.regenBonus);
  }

  /* ======================== State ======================== */

  /** Щит сейчас в перезагрузке. */
  isOverloaded(): boolean {
    return this.overloadT > 0;
  }

  /** Остаток перезагрузки, секунды. */
  getOverloadLeft(): number {
    return this.overloadT;
  }

  /** Запас энергии 0..1. */
  getEnergyRatio(): number {
    return this.energy / SHIELD_ENERGY_MAX;
  }

  /** Запас энергии в единицах. */
  getEnergy(): number {
    return this.energy;
  }

  /** Снимок для рендера и HUD. */
  getSnapshot(): ShieldSnapshot {
    return {
      energy: this.getEnergyRatio(),
      block: this.getBlockPercent(),
      overloaded: this.isOverloaded(),
      overloadLeft: this.overloadT,
      flash: this.flashT > 0 ? this.flashT / SHIELD_FLASH_TIME : 0,
    };
  }

  /* ======================== Combat ======================== */

  /**
   * Провести урон через щит.
   * Возвращает урон, который должен дойти до корпуса.
   */
  absorb(dmg: number): number {
    if (dmg <= 0 || this.overloadT > 0 || this.energy <= 0) return dmg;

    const block = this.getBlockPercent();
    const absorbed = dmg * block;
    // Энергии не хватает на полное поглощение — щит гасит столько, сколько может.
    const energyCap = this.energy / SHIELD_DRAIN_PER_DAMAGE;
    const realBlocked = Math.min(absorbed, energyCap);
    const cost = realBlocked * SHIELD_DRAIN_PER_DAMAGE;

    this.energy = Math.max(0, this.energy - cost);
    if (realBlocked > 0) this.flashT = SHIELD_FLASH_TIME;
    if (this.energy <= 0) {
      this.overloadT = SHIELD_OVERLOAD_TIME;
    }
    return dmg - realBlocked;
  }

  /** Восстановить энергию (пикап щита). */
  recharge(amount: number): void {
    if (this.overloadT > 0) return;
    this.energy = Math.min(SHIELD_ENERGY_MAX, this.energy + amount);
  }

  /* ======================== Tick ======================== */

  update(dt: number): void {
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.overloadT > 0) {
      this.overloadT = Math.max(0, this.overloadT - dt);
      if (this.overloadT === 0) {
        // Перезагрузка закончилась: щит сразу возвращается на максимум.
        this.energy = SHIELD_ENERGY_MAX;
      }
      return;
    }
    this.energy = Math.min(SHIELD_ENERGY_MAX, this.energy + this.getRegenRate() * dt);
  }

  /** Полный сброс — начало забега. */
  reset(): void {
    this.energy = SHIELD_ENERGY_MAX;
    this.overloadT = 0;
    this.flashT = 0;
  }
}
