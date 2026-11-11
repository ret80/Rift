/**
 * PlayerSystem — ECS-система игрока.
 *
 * Отвечает только за корабль: движение, корпус, неуязвимость.
 * Временные бонусы (темп огня, доп. стволы, рывок) живут в модуле
 * бонусов под управлением BonusManager, поэтому система ничего о них
 * не знает: рендер и оружие читают бонусы напрямую из менеджера.
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
import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
import type { EventBus } from '../core/EventBus';
import type { PlayerControls } from '../core/PlayerControls';
import type { FxPort } from '../core/WorldPorts';
import type { ShieldSystem } from './ShieldSystem';
import { updateMovement } from './PlayerMovement';
import type { PlayerRef } from '../ecs';
import { PlayerComponent } from '../ecs/components/PlayerComponent';
import { trackTurnRate } from '../aiming/AimSolver';
import {
  PLAYER_DASH_COOLDOWN,
  PLAYER_DASH_IFRAMES,
  PLAYER_DASH_IMPULSE,
  PLAYER_HIT_INVULN,
  PLAYER_MAX_SPEED,
} from '../balance/player';

/** Флаг: должна ли система сама интегрировать позицию (true в custom-режиме). */
export type PlayerIntegrateSource = () => boolean;

/** Источник живой связки компонентов игрока (EntityRef-идентичность). */
export type PlayerRefSource = () => PlayerRef | null;

export class PlayerSystem extends PhasedSystem {
  private aspect: Aspect | null = null;
  private eventBus: EventBus;
  /** Порт управления: человек или агент — системе всё равно. */
  private controls: PlayerControls;
  private fx: FxPort;
  /** Постоянный множитель скорости из апгрейдов. */
  private speedMult = 1;
  /** Энергетический щит: блокирует часть урона. */
  private shield: ShieldSystem | null = null;

  /** Источник живой связки компонентов игрока. */
  private readonly playerRefSource: PlayerRefSource;
  /** Скорость игрока на прошлом кадре — для оценки угловой скорости курса. */
  private prevVx = 0;
  private prevVy = 0;
  /** Остаток перезарядки рывка, секунды. */
  private dashCd = 0;

  constructor(
    eventBus: EventBus,
    controls: PlayerControls,
    fx: FxPort,
    playerRefSource: PlayerRefSource,
    private readonly getIntegrate: PlayerIntegrateSource,
  ) {
    super(Phase.Player);
    this.eventBus = eventBus;
    this.controls = controls;
    this.fx = fx;
    this.playerRefSource = playerRefSource;

    // Subscribe to player damage events
    eventBus.subscribe('player_damaged', (event) => {
      const data = event.payload as { dmg: number };
      this.hit(data.dmg);
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
    const { position, velocity, marker } = ref;

    // Движение из оси порта управления.
    const mv = this.controls.axis;
    const ax = mv.x;
    const ay = mv.y;

    // Movement module
    updateMovement(
      position,
      velocity,
      marker,
      dt,
      ax,
      ay,
      this.fx,
      ax * ax + ay * ay > 0,
      this.speedMult,
      this.getIntegrate(),
    );

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

    // Рывок: короткий импульс по текущему курсу. Импульс важнее доворота —
    // он выносит корабль из линии огня, поэтому применяется после
    // движения и не ограничен пределом скорости на этом кадре.
    this.dashCd = Math.max(0, this.dashCd - dt);
    if (this.dashCd <= 0 && this.controls.consumeDash()) {
      this.applyDash(ref);
      this.dashCd = PLAYER_DASH_COOLDOWN;
    }

    // Invulnerability timer
    marker.invuln = Math.max(0, marker.invuln - dt);
  }

  /**
   * Выполнить рывок: импульс по курсу (или по вводу, если корабль стоит)
   * и короткие кадры неуязвимости.
   */
  private applyDash(ref: PlayerRef): void {
    const { velocity, marker } = ref;
    const speed = Math.hypot(velocity.vx, velocity.vy);
    const axis = this.controls.axis;
    const inputLen = Math.hypot(axis.x, axis.y);

    let dirX: number;
    let dirY: number;
    if (speed > 20) {
      dirX = velocity.vx / speed;
      dirY = velocity.vy / speed;
    } else if (inputLen > 0.01) {
      dirX = axis.x / inputLen;
      dirY = axis.y / inputLen;
    } else {
      dirX = Math.cos(marker.angle);
      dirY = Math.sin(marker.angle);
    }

    const launch = Math.max(speed, PLAYER_MAX_SPEED * this.speedMult) + PLAYER_DASH_IMPULSE;
    velocity.vx = dirX * launch;
    velocity.vy = dirY * launch;
    marker.invuln = Math.max(marker.invuln, PLAYER_DASH_IFRAMES);
  }

  /** Готов ли рывок (для HUD). */
  get dashReady(): boolean {
    return this.dashCd <= 0;
  }

  /** Остаток перезарядки рывка, секунды. */
  get dashCooldownLeft(): number {
    return this.dashCd;
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
    this.dashCd = 0;
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

  hit(dmg: number): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    // Кадры неуязвимости после попадания: без них рой и две турели
    // могут снимать HP каждый кадр.
    if (ref.marker.invuln > 0) return;
    // Щит гасит часть урона и тратит на это энергию.
    const incoming = this.shield ? this.shield.absorb(dmg) : dmg;
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
