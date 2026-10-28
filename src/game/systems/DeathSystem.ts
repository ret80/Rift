/**
 * DeathSystem — смерть игрока и анимация.
 * Отвечает за: таймер смерти, взрыв частиц, переход dying → over.
 */

import type { AudioManager } from "./AudioManager";
import type { ScoringSystem } from "./ScoringSystem";
import type { EntityPoolSystem } from "./EntityPoolSystem";
import type { Fx } from "../fx";
import {
  DEATH_ANIMATION_DURATION,
  DEATH_EXPLOSION_PARTICLES,
  DEATH_EXPLOSION_MIN_SPEED,
  DEATH_EXPLOSION_MAX_SPEED,
  DEATH_EXPLOSION_MIN_LIFE,
  DEATH_EXPLOSION_MAX_LIFE,
} from "../balance";
import type { RGBA } from "../render/index";

export interface DeathSystemHooks {
  onGameOver: () => void;
  onStats: (score: number, best: number, isBest: boolean, wave: number, kills: number, time: number) => void;
}

export class DeathSystem {
  private deathTimer = 0;

  constructor(
    private readonly getPlayerPosition: () => { x: number; y: number },
    private readonly fx: Fx,
    private readonly audio: AudioManager,
    private readonly entityPool: EntityPoolSystem,
    private readonly scoringSystem: ScoringSystem,
    private readonly hooks: DeathSystemHooks,
  ) {}

  /** Установить состояние смерти (запуск анимации) */
  startDeath(): void {
    this.deathTimer = DEATH_ANIMATION_DURATION;
    // Clear all enemy bullets to prevent "orphan bullets" on restart
    this.entityPool.clearEnemyBullets();
    this.entityPool.clearBullets();
    // Spawn death explosion particles
    const pos = this.getPlayerPosition();
    for (let i = 0; i < DEATH_EXPLOSION_PARTICLES; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = DEATH_EXPLOSION_MIN_SPEED + Math.random() * (DEATH_EXPLOSION_MAX_SPEED - DEATH_EXPLOSION_MIN_SPEED);
      this.fx.emit({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: DEATH_EXPLOSION_MIN_LIFE + Math.random() * (DEATH_EXPLOSION_MAX_LIFE - DEATH_EXPLOSION_MIN_LIFE),
        maxLife: DEATH_EXPLOSION_MAX_LIFE,
        c: (Math.random() > 0.5 ? [1, 0.3, 0.1, 1] : [1, 0.8, 0.2, 1]) as RGBA,
        size: 1 + Math.random() * 3,
      });
    }
    this.audio.playExplosion();
  }

  /** Обновить таймер смерти, вернуть true когда анимация завершена */
  update(dt: number): boolean {
    if (this.deathTimer <= 0) return false;
    this.deathTimer -= dt;
    if (this.deathTimer <= 0) {
      this.deathTimer = 0;
      return true;
    }
    return false;
  }

  /** Вызвать при завершении анимации смерти */
  onFinishDeath(): void {
    const best = this.scoringSystem.checkNewBest();
    const s = this.scoringSystem.getState();
    this.hooks.onStats(s.score, s.best, best, 0, s.killed, s.runTime);
    this.hooks.onGameOver();
  }
}
