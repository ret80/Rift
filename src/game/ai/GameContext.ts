/**
 * GameContext — контекст, передаваемый AI стратегиям для чтения.
 * Содержит только те данные, которые реально используются стратегиями.
 */

import type { Rng } from '../core/rng';
import type { EnemyRef } from '../ecs';
import type { DroneSwarm } from './DroneSwarm';

/** Данные для синхронизации контекста (объектный параметр вместо 12 positional args). */
export interface GameContextInput {
  playerX: number;
  playerY: number;
  playerVx: number;
  playerVy: number;
  /** Угловая скорость курса игрока, рад/с (0 — летит по прямой). */
  playerTurnRate?: number;
  zoneX: number;
  zoneY: number;
  zoneRadius: number;
  /** Игрок вне активной зоны: зонные ограничения ИИ можно не применять. */
  playerOutsideZone?: boolean;
  wave: number;
}

export class GameContext {
  public playerX = 0;
  public playerY = 0;
  public playerVx = 0;
  public playerVy = 0;
  /**
   * Угловая скорость курса игрока, рад/с. Ненулевая означает, что игрок
   * летит по дуге (облёт), и точку перехвата нужно считать по дуге.
   */
  public playerTurnRate = 0;

  public zoneX = 0;
  public zoneY = 0;
  public zoneRadius = 0;
  /** Игрок снаружи зоны: враги могут выходить, их возвращает притяжение. */
  public playerOutsideZone = false;

  public wave = 1;

  /** Живой список врагов (присваивается из EnemySystem перед AI pass). */
  public enemies: EnemyRef[] = [];

  /** Координатор групп дронов (присваивается из EnemySystem). */
  public swarm: DroneSwarm | null = null;

  /**
   * Боевой поток случайности (присваивается из EnemySystem перед AI pass).
   * Стратегии не должны брать `Math.random`: только этот поток.
   */
  public rng!: Rng;

  /** Выходной буфер CarrierStrategy — спавн дронов. */
  public carrierSpawns: Array<{ x: number; y: number }> = [];

  /**
   * Синхронизировать контекст с текущим состоянием мира.
   * Вызывается один раз за кадр перед AI pass.
   */
  sync(input: GameContextInput): void {
    this.playerX = input.playerX;
    this.playerY = input.playerY;
    this.playerVx = input.playerVx;
    this.playerVy = input.playerVy;
    this.playerTurnRate = input.playerTurnRate ?? 0;
    this.zoneX = input.zoneX;
    this.zoneY = input.zoneY;
    this.zoneRadius = input.zoneRadius;
    this.playerOutsideZone = input.playerOutsideZone ?? false;
    this.wave = input.wave;
    this.carrierSpawns = [];
  }
}
