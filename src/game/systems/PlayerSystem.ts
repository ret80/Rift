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
 * PlayerSystem — наследник System и исполняется через engine.run(dt):
 * состояние игрока (PlayerComponent.state) — единственный источник
 * правды, система мутирует его напрямую. Управление игроком больше
 * не императивный класс вне ECS.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { PLAYER_HIT_INVULN } from '../balance/player';
import type { EventBus } from '../core/EventBus';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import type { ShieldSystem } from './ShieldSystem';
import { updateMovement } from './PlayerMovement';
import {
  resetPlayerState,
  type PlayerState,
} from './PlayerState';
import { PlayerComponent } from '../ecs/components/PlayerComponent';

/** Флаг: должна ли система сама интегрировать позицию (true в custom-режиме). */
export type PlayerIntegrateSource = () => boolean;

export class PlayerSystem extends System {
  private aspect: Aspect | null = null;
  private eventBus: EventBus;
  private input: InputManager;
  private fx: Fx;
  /** Постоянный множитель скорости из апгрейдов. */
  private speedMult = 1;
  /** Энергетический щит: блокирует часть урона. */
  private shield: ShieldSystem | null = null;

  /** Единственный источник правды — состояние из PlayerComponent. */
  private pState: PlayerState;

  constructor(
    eventBus: EventBus,
    input: InputManager,
    fx: Fx,
    state: PlayerState,
    private readonly getIntegrate: PlayerIntegrateSource,
  ) {
    super(-1); // движение игрока — до врагов/пикапов (их системы читают позицию)
    this.eventBus = eventBus;
    this.input = input;
    this.fx = fx;
    this.pState = state;

    // Subscribe to player damage events
    eventBus.subscribe('player_damaged', (event) => {
      const data = event.payload as { dmg: number };
      this.hit(data.dmg);
    });

    // Subscribe to drone push events (soft avoidance)
    eventBus.subscribe('drone_push_player', (event) => {
      const data = event.payload as { vx: number; vy: number };
      this.pState.vx += data.vx;
      this.pState.vy += data.vy;
    });
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(PlayerComponent);
  }

  /** Обновление игрока внутри engine.run(dt). */
  process(dt: number): void {
    const state = this.pState;

    // Движение из оси ввода.
    const mv = this.input.axis;
    const ax = mv.x;
    const ay = mv.y;

    // Movement module
    updateMovement(
      state,
      dt,
      ax,
      ay,
      this.fx,
      ax * ax + ay * ay > 0,
      this.speedMult,
      this.getIntegrate(),
    );

    // Invulnerability timer
    state.invuln = Math.max(0, state.invuln - dt);
  }

  reset(): void {
    resetPlayerState(this.pState);
  }

  // ---- HP ----

  setMaxHp(max: number): void {
    this.pState.maxHp = max;
    this.pState.hp = Math.min(this.pState.hp, max);
  }

  resetHp(): void {
    this.pState.hp = this.pState.maxHp;
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

  /** Живая ссылка на состояние игрока. */
  getPlayerRef(): PlayerState {
    return this.pState;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.pState.x, y: this.pState.y };
  }

  getHp(): number {
    return this.pState.hp;
  }

  getMaxHp(): number {
    return this.pState.maxHp;
  }

  /**
   * Мгновенно перенести корабль в точку, сбросив скорость.
   * Используется активной способностью «телепорт-подмена».
   */
  teleportTo(x: number, y: number): void {
    this.pState.x = x;
    this.pState.y = y;
    this.pState.vx = 0;
    this.pState.vy = 0;
  }

  // ---- Core methods ----

  hit(dmg: number): void {
    if (this.pState.invuln > 0) return;
    // Щит гасит часть урона и тратит на это энергию.
    const incoming = this.shield ? this.shield.absorb(dmg) : dmg;
    this.pState.hp -= incoming;
    // Кадры неуязвимости после попадания: спасают от залпа в упор.
    this.pState.invuln = PLAYER_HIT_INVULN;
    if (this.pState.hp <= 0) {
      this.pState.hp = 0;
      this.eventBus.publish('game_over', {});
    }
  }

  heal(amount: number): void {
    this.pState.hp = Math.min(this.pState.maxHp, this.pState.hp + amount);
  }

  // ---- Input delegation ----

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }
}