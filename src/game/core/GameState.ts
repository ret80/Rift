/**
 * GameState - иммутабельное состояние игры.
 * Централизованное хранилище состояния для всех систем.
 */

import type { EnemyKind } from '../balance';

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  invuln: number;
  guns: number;
  rateBoost: number;
  rateT: number;
  dashT: number;
  mineDropT: number;
}

export interface WaveState {
  wave: number;
  total: number;
  killed: number;
  allocated: number;
  stepSize: number;
  dropThreshold: number;
  peakAlive: number;
}

export interface ZoneState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  collapseT: number; // -1 = не схлопывается, >=0 = время схлопывания
}

export interface ScoreState {
  score: number;
  best: number;
  kills: number;
  combo: number;
  comboT: number;
  minerals: number;
}

export type GameStateType = 'menu' | 'playing' | 'active' | 'cleared' | 'dying' | 'over';

export interface WorldState {
  enemies: Array<{
    kind: EnemyKind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    angle: number;
    hp: number;
    maxHp: number;
    r: number;
    speed: number;
    contact: number;
    score: number;
    boltDmg: number;
    fireCd: number;
    mode: number;
    modeT: number;
    strafeDir: number;
    seed: number;
    spawnCd: number;
    flash: number;
    hitCd: number;
    dead: boolean;
    parentIndex: number | null; // индекс родителя в массиве enemies или null
  }>;
  bullets: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    dmg: number;
  }>;
  enemyBullets: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    dmg: number;
    heavy: boolean;
  }>;
  pickups: Array<{
    kind: string;
    x: number;
    y: number;
    vx: number;
    vy: number;
    life: number;
    seed: number;
  }>;
  allyDrones: Array<{
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
  }>;
  mines: Array<{
    x: number;
    y: number;
    fuse: number;
    seed: number;
  }>;
}

export class GameState {
  public type: GameStateType = 'menu';
  public paused: boolean = false;
  
  public player: PlayerState = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    invuln: 0,
    guns: 1,
    rateBoost: 0,
    rateT: 0,
    dashT: 0,
    mineDropT: -1,
  };

  public wave: WaveState = {
    wave: 1,
    total: 0,
    killed: 0,
    allocated: 0,
    stepSize: 1,
    dropThreshold: 1,
    peakAlive: 0,
  };

  public zone: ZoneState = {
    active: false,
    x: 0,
    y: 0,
    radius: 0,
    targetRadius: 0,
    alpha: 0,
    collapseT: -1,
  };

  public score: ScoreState = {
    score: 0,
    best: 0,
    kills: 0,
    combo: 0,
    comboT: 0,
    minerals: 0,
  };

  public world: WorldState = {
    enemies: [],
    bullets: [],
    enemyBullets: [],
    pickups: [],
    allyDrones: [],
    mines: [],
  };

  /**
   * Сбросить состояние для нового раунда.
   */
  reset(startWave: number = 1): void {
    this.type = 'playing';
    this.paused = false;
    
    this.player = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      hp: 100,
      maxHp: 100,
      invuln: 0,
      guns: 1,
      rateBoost: 0,
      rateT: 0,
      dashT: 0,
      mineDropT: -1,
    };

    this.wave = {
      wave: startWave,
      total: 0,
      killed: 0,
      allocated: 0,
      stepSize: 1,
      dropThreshold: 1,
      peakAlive: 0,
    };

    this.zone = {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      targetRadius: 0,
      alpha: 0,
      collapseT: -1,
    };

    this.score = {
      score: 0,
      best: this.score.best, // сохраняем рекорд
      kills: 0,
      combo: 0,
      comboT: 0,
      minerals: 0,
    };

    this.world = {
      enemies: [],
      bullets: [],
      enemyBullets: [],
      pickups: [],
      allyDrones: [],
      mines: [],
    };
  }

  /**
   * Перейти в меню.
   */
  toMenu(): void {
    this.type = 'menu';
    this.paused = false;
    this.zone.active = false;
    this.zone.alpha = 0;
    this.zone.collapseT = -1;
    this.world.enemies = [];
    this.world.bullets = [];
    this.world.enemyBullets = [];
    this.world.pickups = [];
    this.world.allyDrones = [];
    this.world.mines = [];
  }
}
