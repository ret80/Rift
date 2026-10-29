/**
 * PlayerState — доменное состояние игрока (ориентация, корпус-неуязвимость,
 * движок, масса). Позиция/скорость/радиус и запас прочности живут в базовых
 * ECS-компонентах (Position/Velocity/Radius/Life) на Singleton-сущности игрока.
 *
 * Временные бонусы (темп огня, доп. стволы, рывок) живут в модуле бонусов
 * (src/game/loadout/bonuses) под управлением BonusManager.
 */

import { massForRadius, PLAYER_RADIUS } from '../balance';

/* ============================== constants ============================== */

export const PLAYER_ACCELERATION = 1500;
export const FRICTION_EXP = 2.4;

/* ============================== interface ============================== */

/** Доменное состояние игрока (без базовых x/y/vx/vy/r/hp). */
export interface PlayerState {
  /** Ориентация корабля, радианы. */
  angle: number;
  /** Кадры неуязвимости после попадания. */
  invuln: number;
  /** Игрок в настоящий момент жмёт газ. */
  thrusting: boolean;
  /** Масса корабля. */
  mass: number;
}

/* ============================== factory ============================== */

export function createPlayerState(): PlayerState {
  return {
    angle: -Math.PI / 2,
    invuln: 0,
    thrusting: false,
    mass: massForRadius(PLAYER_RADIUS),
  };
}

/* ============================== state helpers ============================== */

/** Сброс доменного состояния игрока (позиция/корпус сбрасываются отдельно). */
export function resetPlayerState(state: PlayerState): void {
  Object.assign(state, createPlayerState());
}