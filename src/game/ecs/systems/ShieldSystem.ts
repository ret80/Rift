/**
 * ShieldSystem — энергетический щит игрока.
 *
 * Щит блокирует часть входящего урона в процентах: при блокировке 20%
 * удар в 10 единиц снимает 8 корпуса. Каждая единица поглощённого урона
 * тратит энергию щита. Энергия постепенно восстанавливается; если она
 * упала до нуля, щит уходит в перезагрузку на SHIELD_OVERLOAD_TIME,
 * после чего сразу возвращается на максимум и снова работает.
 *
 * Удержание клавиши превращает щит в активный: перед кораблём встаёт
 * сектор 120°, который полностью гасит урон, пришедший из него. За это
 * энергия тратится постоянно, а не по факту попадания, поэтому активный
 * щит — это выбор между защитой и запасом на будущее.
 *
 * Процент блокировки и скорость восстановления приходят из прокачки.
 * Сам щит тоже покупается: пока он не куплен, урон идёт в корпус целиком,
 * а полоски щита не рисуются.
 */

import { PhasedSystem, Phase } from "../SystemSchedule";
import {
  SHIELD_ACTIVE_DRAIN,
  SHIELD_ACTIVE_SECTOR,
  SHIELD_DRAIN_PER_DAMAGE,
  SHIELD_ENERGY_MAX,
  SHIELD_FLASH_TIME,
  SHIELD_OVERLOAD_TIME,
  shieldBlockPercent,
  shieldRegenPerSecond,
} from "../../balance/player";
import type { LoadoutSlotData, LoadoutSlotMeta } from "../../loadout/LoadoutTypes";

/** Оформление слота щита в строке снаряжения. */
const SHIELD_SLOT_META: LoadoutSlotMeta = {
  icon: "pickup-shield",
  color: "#66e0ff",
  labelKey: "hud.loadout.shield",
  order: 5,
};

/** Снимок состояния щита для рендера и HUD. */
export interface ShieldSnapshot {
  /** Щит куплен и работает. */
  owned: boolean;
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
  /** Игрок удерживает активный щит. */
  active: boolean;
  /** Направление сектора активного щита, радианы. */
  angle: number;
  /** Ширина сектора активного щита, радианы. */
  sector: number;
}

export class ShieldSystem extends PhasedSystem {
  /** Щит куплен в меню прокачки. Пока не куплен — система полностью бездействует. */
  private owned = false;
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
  /** Игрок удерживает активный щит. */
  private activeOn = false;
  /** Направление сектора активного щита, радианы. */
  private activeAngle = 0;

  constructor() {
    super(Phase.Upkeep);
  }

  /* ======================== Upgrade hooks ======================== */

  /** Куплен ли щит. Пока false — урон не блокируется и полосок нет. */
  setOwned(owned: boolean): void {
    this.owned = owned;
    if (!owned) {
      this.energy = SHIELD_ENERGY_MAX;
      this.overloadT = 0;
      this.flashT = 0;
      this.activeOn = false;
    }
  }

  /** Щит куплен. */
  isOwned(): boolean {
    return this.owned;
  }

  /** Задать процент блокировки урона по уровню прокачки. */
  setBlockLevel(level: number): void {
    this.blockLevel = Math.max(0, level);
  }

  /** Задать уровень линии скорости восстановления. */
  setRegenLevel(level: number): void {
    this.regenBonus = Math.max(0, level);
  }

  /** Процент блокируемого урона (0..1). Без купленного щита — 0. */
  getBlockPercent(): number {
    return this.owned ? shieldBlockPercent(this.blockLevel) : 0;
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

  /** Активный сектор сейчас развёрнут. */
  isActive(): boolean {
    return this.activeOn;
  }

  /**
   * Задать удержание активного щита на текущий тик.
   * Направление сектора — курс корабля.
   */
  setActive(held: boolean, angle: number): void {
    this.activeAngle = angle;
    this.activeOn = this.owned && held && this.overloadT <= 0 && this.energy > 0;
  }

  /** Снимок для рендера и HUD. */
  getSnapshot(): ShieldSnapshot {
    return {
      owned: this.owned,
      energy: this.getEnergyRatio(),
      block: this.getBlockPercent(),
      overloaded: this.isOverloaded(),
      overloadLeft: this.overloadT,
      flash: this.flashT > 0 ? this.flashT / SHIELD_FLASH_TIME : 0,
      active: this.activeOn,
      angle: this.activeAngle,
      sector: SHIELD_ACTIVE_SECTOR,
    };
  }

  /**
   * Слот щита для строки снаряжения.
   * Кольцо заполняется остатком энергии; пока щит не куплен, слота нет.
   */
  getSlots(): LoadoutSlotData[] {
    if (!this.owned) return [];
    return [{
      kind: "shield_energy",
      meta: SHIELD_SLOT_META,
      progress: this.getEnergyRatio(),
      remaining: this.overloadT,
    }];
  }

  /* ======================== Combat ======================== */

  /**
   * Провести урон через щит.
   * `impactAngle` — откуда прилетело (направление на источник). Без него
   * активный сектор не срабатывает: урон среды приходит со всех сторон.
   * Возвращает урон, который должен дойти до корпуса.
   */
  absorb(dmg: number, impactAngle?: number): number {
    if (dmg <= 0 || !this.owned || this.overloadT > 0 || this.energy <= 0) return dmg;

    if (this.activeOn && impactAngle !== undefined && this.blocksAngle(impactAngle)) {
      this.flashT = SHIELD_FLASH_TIME;
      return 0;
    }

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

  /** Попадает ли направление в сектор активного щита. */
  private blocksAngle(impactAngle: number): boolean {
    const delta = Math.atan2(
      Math.sin(impactAngle - this.activeAngle),
      Math.cos(impactAngle - this.activeAngle),
    );
    return Math.abs(delta) <= SHIELD_ACTIVE_SECTOR / 2;
  }

  /** Восстановить энергию (пикап щита). */
  recharge(amount: number): void {
    if (!this.owned || this.overloadT > 0) return;
    this.energy = Math.min(SHIELD_ENERGY_MAX, this.energy + amount);
  }

  /* ======================== Tick ======================== */

  process(dt: number): void {
    if (!this.owned) return;
    if (this.flashT > 0) this.flashT = Math.max(0, this.flashT - dt);
    if (this.overloadT > 0) {
      this.activeOn = false;
      this.overloadT = Math.max(0, this.overloadT - dt);
      if (this.overloadT === 0) {
        // Перезагрузка закончилась: щит сразу возвращается на максимум.
        this.energy = SHIELD_ENERGY_MAX;
      }
      return;
    }
    if (this.activeOn) {
      this.energy = Math.max(0, this.energy - SHIELD_ACTIVE_DRAIN * dt);
      if (this.energy <= 0) {
        this.activeOn = false;
        this.overloadT = SHIELD_OVERLOAD_TIME;
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
    this.activeOn = false;
  }}
