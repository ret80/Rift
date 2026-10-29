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

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { PLAYER_HIT_INVULN } from '../balance/player';
import type { EventBus } from '../core/EventBus';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import type { ShieldSystem } from './ShieldSystem';
import { updateMovement } from './PlayerMovement';
import type { PlayerRef } from '../ecs';
import { PlayerComponent } from '../ecs/components/PlayerComponent';

/** Флаг: должна ли система сама интегрировать позицию (true в custom-режиме). */
export type PlayerIntegrateSource = () => boolean;

/** Источник живой связки компонентов игрока (EntityRef-идентичность). */
export type PlayerRefSource = () => PlayerRef | null;

export class PlayerSystem extends System {
  private aspect: Aspect | null = null;
  private eventBus: EventBus;
  private input: InputManager;
  private fx: Fx;
  /** Постоянный множитель скорости из апгрейдов. */
  private speedMult = 1;
  /** Энергетический щит: блокирует часть урона. */
  private shield: ShieldSystem | null = null;

  /** Источник живой связки компонентов игрока. */
  private readonly playerRefSource: PlayerRefSource;

  constructor(
    eventBus: EventBus,
    input: InputManager,
    fx: Fx,
    playerRefSource: PlayerRefSource,
    private readonly getIntegrate: PlayerIntegrateSource,
  ) {
    super(-1); // движение игрока — до врагов/пикапов (их системы читают позицию)
    this.eventBus = eventBus;
    this.input = input;
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

    // Движение из оси ввода.
    const mv = this.input.axis;
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

    // Invulnerability timer
    marker.invuln = Math.max(0, marker.invuln - dt);
  }

  reset(): void {
    const ref = this.playerRefSource();
    if (!ref) return;
    ref.position.x = 0; ref.position.y = 0;
    ref.velocity.vx = 0; ref.velocity.vy = 0;
    ref.marker.angle = -Math.PI / 2;
    ref.marker.invuln = 0;
    ref.marker.thrusting = false;
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
    if (ref.marker.invuln > 0) return;
    // Щит гасит часть урона и тратит на это энергию.
    const incoming = this.shield ? this.shield.absorb(dmg) : dmg;
    ref.life.remaining -= incoming;
    // Кадры неуязвимости после попадания: спасают от залпа в упор.
    ref.marker.invuln = PLAYER_HIT_INVULN;
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

  // ---- Input delegation ----

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }
}