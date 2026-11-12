/**
 * PlayerSystem — ECS-система игрока.
 *
 * Отвечает только за корабль: движение, корпус, неуязвимость.
 * Временные бонусы (темп огня, доп. стволы) живут в модуле
 * бонусов под управлением BonusManager, поэтому система ничего о них
 * не знает: рендер и оружие читают бонусы напрямую из менеджера.
 *
 * Форсаж живёт здесь же: энергия копится за убийства, тратится на ускорение
 * и не восстанавливается сама.
 *
 * Множитель скорости приходит из персистентного апгрейда «скорость»,
 * задаётся через setSpeedMult().
 *
 * PlayerSystem — наследник System и исполняется через engine.run(dt).
 * Источник правды — Singleton-сущность игрока: базовые компоненты
 * (Position/Velocity/Life/Radius) и узкий PlayerComponent (angle/invuln/
 * thrusting/mass). Система читает и мутирует их через живую связку PlayerRef.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../SystemSchedule";
import type { EventBus } from '../../core/EventBus';
import type { PlayerControls } from '../../core/PlayerControls';
import type { ShieldSystem } from './ShieldSystem';
import type { PlayerRef } from '..';
import { PlayerComponent } from '../components/PlayerComponent';
import { trackTurnRate } from '../../aiming/AimSolver';
import { lerpAngle as lerpAngleMath } from '../../math';
import {
  BOOST_DRAIN_PER_SECOND,
  BOOST_GAIN_PER_KILL,
  BOOST_SPEED_MULT,
  PLAYER_ACCEL,
  PLAYER_FRICTION_EXP,
  PLAYER_HIT_INVULN,
  PLAYER_MAX_SPEED,
} from '../../balance/player';

/** Флаг: должна ли система сама интегрировать позицию (true в custom-режиме). */
export type PlayerIntegrateSource = () => boolean;

/** Источник живой связки компонентов игрока (EntityRef-идентичность). */
export type PlayerRefSource = () => PlayerRef | null;

export class PlayerSystem extends PhasedSystem {
  private aspect: Aspect | null = null;
  private eventBus: EventBus;
  /** Порт управления: человек или агент — системе всё равно. */
  private controls: PlayerControls;
  /** Постоянный множитель скорости из апгрейдов. */
  private speedMult = 1;
  /** Энергетический щит: блокирует часть урона. */
  private shield: ShieldSystem | null = null;

  /** Источник живой связки компонентов игрока. */
  private readonly playerRefSource: PlayerRefSource;
  /** Скорость игрока на прошлом кадре — для оценки угловой скорости курса. */
  private prevVx = 0;
  private prevVy = 0;
  /** Накопленная энергия форсажа, 0..1 (1 — кнопка активна). */
  private boost = 0;
  /** Форсаж включён и тратит энергию прямо сейчас. */
  private boostOn = false;

  constructor(
    eventBus: EventBus,
    controls: PlayerControls,
    playerRefSource: PlayerRefSource,
    private readonly getIntegrate: PlayerIntegrateSource,
  ) {
    super(Phase.Player);
    this.eventBus = eventBus;
    this.controls = controls;
    this.playerRefSource = playerRefSource;

    // Subscribe to player damage events
    eventBus.subscribe('player_damaged', (event) => {
      const data = event.payload as { dmg: number; angle?: number };
      this.hit(data.dmg, data.angle);
    });

    // Убийства врагов заряжают форсаж.
    eventBus.subscribe('enemy_killed', () => {
      this.addBoostEnergy(BOOST_GAIN_PER_KILL);
    });

    // Subscribe to drone push events (soft avoidance)
    eventBus.subscribe('drone_push_player', (event) => {
      const data = event.payload as { vx: number; vy: number };
      const ref = this.playerRefSource();
      if (ref) {
        ref.velocity.vx += data.vx;
        ref.velocity.vy += data.vy;
      }
    });
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(PlayerComponent);
  }

  /** Обновление игрока внутри engine.run(dt). */
  process(dt: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    const { velocity, marker } = ref;

    // Движение из оси порта управления.
    const mv = this.controls.axis;
    const ax = mv.x;
    const ay = mv.y;

    // Форсаж: тратит накопленную энергию и ускоряет корабль. Порог ввода
    // опрашивается каждый тик, чтобы нажатие без заряда не копилось.
    this.updateBoost(dt);

    // Движение: ускорение, трение, ограничение скорости и доворот курса.
    this.updateMovement(
      ref,
      dt,
      ax,
      ay,
      this.speedMult * (this.boostOn ? BOOST_SPEED_MULT : 1),
      this.getIntegrate(),
    );

    // Активный щит разворачивает сектор по курсу. Удержание опрашивается
    // каждый тик: щит сам погасит его, если энергии нет или идёт перезагрузка.
    this.shield?.setActive(this.controls.shieldHeld, marker.angle);

    // Угловая скорость курса: по ней вражеский прицел строит прогноз по дуге,
    // а истребитель распознаёт облёт и срезает орбиту.
    marker.turnRate = trackTurnRate(
      marker.turnRate,
      this.prevVx,
      this.prevVy,
      velocity.vx,
      velocity.vy,
      dt,
    );
    this.prevVx = velocity.vx;
    this.prevVy = velocity.vy;

    // Invulnerability timer
    marker.invuln = Math.max(0, marker.invuln - dt);
  }

  /**
   * Физика движения корабля: ускорение по оси ввода, экспоненциальное
   * трение, ограничение максимальной скорости, интеграция позиции (если
   * физический движок этого не делает) и доворот курса за скоростью.
   */
  private updateMovement(
    ref: PlayerRef,
    dt: number,
    ax: number,
    ay: number,
    speedMult: number,
    integratePosition: boolean,
  ): void {
    const { position, velocity, marker } = ref;
    const thrusting = ax * ax + ay * ay > 0;
    marker.thrusting = thrusting;

    if (thrusting) {
      const length = Math.hypot(ax, ay);
      if (length > 0) {
        const norm = length > 1 ? length : 1;
        ax /= norm;
        ay /= norm;
        const accel = PLAYER_ACCEL * speedMult;
        velocity.vx += ax * accel * dt;
        velocity.vy += ay * accel * dt;
      }
    }

    // Трение
    const friction = Math.exp(-PLAYER_FRICTION_EXP * dt);
    velocity.vx *= friction;
    velocity.vy *= friction;

    // Ограничение скорости
    const speed = Math.hypot(velocity.vx, velocity.vy);
    const cap = PLAYER_MAX_SPEED * speedMult;
    if (speed > cap) {
      velocity.vx *= cap / speed;
      velocity.vy *= cap / speed;
    }

    // В режиме Planck позицию двигает физический движок.
    if (integratePosition) {
      position.x += velocity.vx * dt;
      position.y += velocity.vy * dt;
    }

    // Курс следует за скоростью.
    if (speed > 20) {
      marker.angle = lerpAngleMath(
        marker.angle,
        Math.atan2(velocity.vy, velocity.vx),
        1 - Math.exp(-10 * dt),
      );
    }
  }

  /**
   * Форсаж: включение при полном заряде и расход энергии, пока он активен.
   * Когда заряд кончился — кнопка возвращается в режим накопления.
   */
  private updateBoost(dt: number): void {
    const requested = this.controls.consumeBoost();
    if (this.boostOn) {
      this.boost = Math.max(0, this.boost - BOOST_DRAIN_PER_SECOND * dt);
      if (this.boost <= 0) this.boostOn = false;
      return;
    }
    if (requested && this.boost >= 1) {
      this.boostOn = true;
    }
  }

  /** Добавить энергию форсажа: убийства не копят её во время разгона. */
  private addBoostEnergy(amount: number): void {
    if (this.boostOn) return;
    this.boost = Math.min(1, this.boost + amount);
  }

  /** Накопленная энергия форсажа, 0..1. */
  get boostEnergy(): number {
    return this.boost;
  }

  /** Активен ли форсаж сейчас. */
  get boostActive(): boolean {
    return this.boostOn;
  }

  reset(): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    ref.position.x = 0; ref.position.y = 0;
    ref.velocity.vx = 0; ref.velocity.vy = 0;
    ref.marker.angle = -Math.PI / 2;
    ref.marker.invuln = 0;
    ref.marker.thrusting = false;
    ref.marker.turnRate = 0;
    this.prevVx = 0;
    this.prevVy = 0;
    this.boost = 0;
    this.boostOn = false;
  }

  // ---- HP (базовый LifeComponent) ----

  setMaxHp(max: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    ref.life.max = max;
    ref.life.remaining = Math.min(ref.life.remaining, max);
  }

  resetHp(): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    ref.life.remaining = ref.life.max;
  }

  // ---- Persistent upgrades ----

  /** Постоянный множитель скорости из апгрейда «скорость». */
  setSpeedMult(mult: number): void {
    this.speedMult = mult;
  }

  /** Подключить энергетический щит (блокирует часть урона). */
  setShield(shield: ShieldSystem): void {
    this.shield = shield;
  }

  // ---- Getters ----

  /** Живая связка компонентов игрока (PlayerRef). */
  getPlayerRef(): PlayerRef | null {
    return this.playerRefSource();
  }

  getPosition(): { x: number; y: number } {
    const ref = this.playerRefSource();
    return ref ? { x: ref.position.x, y: ref.position.y } : { x: 0, y: 0 };
  }

  getHp(): number {
    const ref = this.playerRefSource();
    return ref ? ref.life.remaining : 0;
  }

  getMaxHp(): number {
    const ref = this.playerRefSource();
    return ref ? ref.life.max : 0;
  }

  /**
   * Мгновенно перенести корабль в точку, сбросив скорость.
   * Используется активной способностью «телепорт-подмена».
   */
  teleportTo(x: number, y: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    ref.position.x = x;
    ref.position.y = y;
    ref.velocity.vx = 0;
    ref.velocity.vy = 0;
  }

  // ---- Core methods ----

  /**
   * Урон по кораблю. `impactAngle` — направление на источник удара:
   * по нему активный щит решает, попал ли удар в его сектор.
   */
  hit(dmg: number, impactAngle?: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    // Кадры неуязвимости после попадания: без них рой и две турели
    // могут снимать HP каждый кадр.
    if (ref.marker.invuln > 0) return;
    // Щит гасит часть урона и тратит на это энергию.
    const incoming = this.shield ? this.shield.absorb(dmg, impactAngle) : dmg;
    this.applyDamage(ref, incoming);
    ref.marker.invuln = PLAYER_HIT_INVULN;
  }

  /**
   * Урон в обход щита. Используется зоной волны: за её краем игрок теряет
   * ровно заданную долю максимального HP, щит не должен это уменьшать.
   */
  hitRaw(dmg: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    this.applyDamage(ref, dmg);
  }

  private applyDamage(ref: PlayerRef, dmg: number): void {
    ref.life.remaining -= dmg;
    if (ref.life.remaining <= 0) {
      ref.life.remaining = 0;
      this.eventBus.publish('game_over', {});
    }
  }

  heal(amount: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    ref.life.remaining = Math.min(ref.life.max, ref.life.remaining + amount);
  }

  /**
   * Плавно восстановить корпус к максимуму за оставшееся время отсчёта.
   * Вызывается каждый тик CountdownSystem, пока идёт отсчёт перед волной.
   */
  restoreHpDuringCountdown(dt: number, remaining: number): void {
    const ref = this.playerRefSource();
    if (!ref || remaining <= 0) return;
    const missing = ref.life.max - ref.life.remaining;
    if (missing <= 0) return;
    const amount = (missing / remaining) * dt;
    ref.life.remaining = Math.min(ref.life.max, ref.life.remaining + amount);
  }

}
