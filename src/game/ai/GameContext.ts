/**
 * GameContext — контекст, передаваемый AI стратегиям для чтения.
 * Содержит только те данные, которые реально используются стратегиями.
 */

import type { Enemy } from '../types';

/** Данные для синхронизации контекста (объектный параметр вместо 12 positional args). */
export interface GameContextInput {
  playerX: number;
  playerY: number;
  playerVx: number;
  playerVy: number;
  zoneX: number;
  zoneY: number;
  zoneRadius: number;
  wave: number;
}

export class GameContext {
  public playerX = 0;
  public playerY = 0;
  public playerVx = 0;
  public playerVy = 0;

  public zoneX = 0;
  public zoneY = 0;
  public zoneRadius = 0;

  public wave = 1;

  /** Живой список врагов (присваивается из EnemySystem перед AI pass). */
  public enemies: Enemy[] = [];

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
    this.zoneX = input.zoneX;
    this.zoneY = input.zoneY;
    this.zoneRadius = input.zoneRadius;
    this.wave = input.wave;
    this.carrierSpawns = [];
  }
}
