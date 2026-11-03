/**
 * DeathSystem — смерть игрока и анимация.
 * Отвечает за: таймер смерти, взрыв частиц, переход dying → over.
 */

import type { AudioPort } from "../core/WorldPorts";
import type { ScoringSystem } from "./ScoringSystem";
import type { EcsWorld } from "../ecs";
import type { FxPort } from "../core/WorldPorts";
import {
  DEATH_ANIMATION_DURATION,
  DEATH_EXPLOSION_PARTICLES,
  DEATH_EXPLOSION_MIN_SPEED,
  DEATH_EXPLOSION_MAX_SPEED,
  DEATH_EXPLOSION_MIN_LIFE,
  DEATH_EXPLOSION_MAX_LIFE,
} from "../balance";
import type { Rng } from "../core/rng";
import type { RGBA } from "../render/index";

export interface DeathSystemHooks {
  onGameOver: () => void;
  onStats: (score: number, best: number, isBest: boolean, wave: number, kills: number, time: number) => void;
}

export class DeathSystem {
  private deathTimer = 0;

  constructor(
    private readonly getPlayerPosition: () => { x: number; y: number },
    private readonly fx: FxPort,
    private readonly audio: AudioPort,
    private readonly ecs: EcsWorld,
    private readonly scoringSystem: ScoringSystem,
    private readonly hooks: DeathSystemHooks,
    /** Визуальный поток: разлёт и цвета взрыва (не влияет на геймплей). */
    private readonly rng: Rng,
    private readonly isTestMode: () => boolean = () => false,
  ) {}

  /** Установить состояние смерти (запуск анимации) */
  startDeath(): void {
    this.deathTimer = DEATH_ANIMATION_DURATION;
    // Clear all enemy bullets to prevent "orphan bullets" on restart
    this.ecs.clearEnemyBullets();
    this.ecs.clearBullets();
    // Spawn death explosion particles
    const pos = this.getPlayerPosition();
    for (let i = 0; i < DEATH_EXPLOSION_PARTICLES; i++) {
      const angle = this.rng.range(0, Math.PI * 2);
      const speed = this.rng.range(DEATH_EXPLOSION_MIN_SPEED, DEATH_EXPLOSION_MAX_SPEED);
      this.fx.emit({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: this.rng.range(DEATH_EXPLOSION_MIN_LIFE, DEATH_EXPLOSION_MAX_LIFE),
        maxLife: DEATH_EXPLOSION_MAX_LIFE,
        c: (this.rng.next() > 0.5 ? [1, 0.3, 0.1, 1] : [1, 0.8, 0.2, 1]) as RGBA,
        size: 1 + this.rng.next() * 3,
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
    const best = this.isTestMode() ? false : this.scoringSystem.checkNewBest();
    const s = this.scoringSystem.getState();
    this.hooks.onStats(s.score, s.best, best, 0, s.killed, s.runTime);
    this.hooks.onGameOver();
  }
}
