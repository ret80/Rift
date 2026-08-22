/**
 * WaveOrchestrator - оркестратор волн и зон.
 * Управляет жизненным циклом волны, поведением зоны,
 * ограничениями границ и уроном на краю зоны.
 * 
 * FSM States:
 *   inactive → active → cleared → (next wave)
 */

import { t } from "../../i18n";
import {
  ZONE_INITIAL_RADIUS,
  ZONE_EDGE_MARGIN,
  ZONE_EDGE_WARNING_DELAY,
  ZONE_EDGE_DAMAGE_INTERVAL,
  ZONE_EDGE_DAMAGE_AMOUNT,
  ZONE_EDGE_SHAKE_STRENGTH,
  ZONE_EARLY_DAMAGE_THRESHOLD,
  ZONE_CLEAR_BANNER_DELAY,
  ZONE_CLEAR_EXPAND_START,
  ZONE_CLEAR_NEXT_WAVE,
  ZONE_CLEAR_EXPAND_DURATION,
  ZONE_CLEAR_EXPAND_MULTIPLIER,
  ZONE_ASTEROID_PUSH_FORCE,
  ZONE_ENEMY_PUSH_FORCE_COEFF,
  ZONE_ENEMY_PUSH_FORCE_MAX,
  zoneExpandSpeed,
  massForRadius,
} from "../balance";
import { clamp, easeOutCubic } from "../math";
import type { Enemy } from "../types";
import { GameStateMachine } from "../core/StateMachine";

export interface WaveOrchestratorHooks {
  onBanner: (title: string, sub?: string, color?: string) => void;
  onToast: (text: string, color?: string) => void;
  hitPlayer: (amount: number) => void;
  shakeScreen: (strength: number, duration: number) => void;
  onWaveAdvanced: (wave: number) => void;
}

export interface WaveOrchestratorConfig {
  hooks: WaveOrchestratorHooks;
  playerMaxSpeed: number;
}

export interface ZoneState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  collapseT: number;
}

export interface AsteroidLike {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
}

export interface PlayerPosition {
  x: number;
  y: number;
}

// ============================== Wave FSM Types ==============================

export type WaveStateId = "inactive" | "active" | "cleared";

// ============================== Wave FSM Transitions ==============================

const WAVE_TRANSITIONS = [
  {
    trigger: "start",
    target: "active",
    guard: () => true,
    onEnter: () => {},
  },
  {
    trigger: "cleared",
    target: "cleared",
    guard: () => true,
    onEnter: () => {},
  },
  {
    trigger: "restart",
    target: "active",
    guard: () => true,
    onEnter: () => {},
  },
] as const;

export interface WaveFSMContext {
  wave: number;
  waveTotal: number;
  allocated: number;
  killedWave: number;
}

export class WaveOrchestrator {
  private hooks: WaveOrchestratorHooks;
  private playerMaxSpeed: number;
  private zone: ZoneState;
  private speedMult: number = 1.0;

  // Wave tracking
  private wave: number = 1;
  private waveTotal: number = 0;
  private allocated: number = 0;
  private killedWave: number = 0;
  private clearT: number = 0;
  private waveClearSent: boolean = false;

  // Wave FSM
  private waveFSM: GameStateMachine<WaveFSMContext>;

  // Edge danger tracking
  private edgeOutT: number = 0;
  private edgeTickT: number = 0;
  private edgeWarned: boolean = false;

  constructor(config: WaveOrchestratorConfig) {
    this.hooks = config.hooks;
    this.playerMaxSpeed = config.playerMaxSpeed;
    this.zone = {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      targetRadius: 0,
      alpha: 0,
      collapseT: -1,
    };

    // Initialize Wave FSM
    const waveContext: WaveFSMContext = {
      wave: 1,
      waveTotal: 0,
      allocated: 0,
      killedWave: 0,
    };
    
    this.waveFSM = new GameStateMachine<WaveFSMContext>("active", WAVE_TRANSITIONS as any, waveContext);
  }

  // ============================== Public API ==============================

  get zoneState(): ZoneState {
    return this.zone;
  }

  get waveState(): WaveStateId {
    return this.waveFSM.state as WaveStateId;
  }

  initWave(
    playerX: number,
    playerY: number,
    wave: number,
    waveTotal: number
  ): void {
    this.wave = wave;
    this.waveTotal = waveTotal;
    this.allocated = 0;
    this.killedWave = 0;
    this.clearT = 0;
    this.waveClearSent = false;
    this.edgeOutT = 0;
    this.edgeTickT = 0;
    this.edgeWarned = false;

    // Initialize FSM - wave starts as "active" (zone expansion begins after countdown)
    this.waveFSM = new GameStateMachine<WaveFSMContext>("active", WAVE_TRANSITIONS as any, { wave, waveTotal, allocated: 0, killedWave: 0 });

    // Zone not active yet — will be initialized after countdown
    this.zone.active = false;
    this.zone.x = playerX;
    this.zone.y = playerY;
    this.zone.radius = 0;
    this.zone.targetRadius = 0;
    this.zone.alpha = 0;
    this.zone.collapseT = -1;
  }

  activateZone(playerX: number, playerY: number): void {
    this.zone.x = playerX;
    this.zone.y = playerY;
    this.zone.targetRadius = Math.max(400, 200 + this.wave * 50);
    this.zone.radius = ZONE_INITIAL_RADIUS;
    this.zone.alpha = 0;
    this.zone.collapseT = -1;
    this.zone.active = true;
  }

  setSpeedMult(mult: number): void {
    this.speedMult = mult;
  }

  advanceWave(): void {
    this.wave++;
    this.killedWave = 0;
    this.allocated = 0;
    this.clearT = 0;
    // Transition from cleared back to active via FSM
    this.waveFSM.fire("restart");
    // Zone will be reactivated after next countdown
    this.zone.active = false;
    // Notify Game to start countdown
    this.hooks.onWaveAdvanced(this.wave);
  }

  markAllSpawnedAndKilled(): void {
    this.allocated = this.waveTotal;
    this.killedWave = this.waveTotal;
  }

  tryCheckWaveClear(allSpawned: boolean, allKilled: boolean): void {
    if (this.waveFSM.state !== "active") return;

    if (allSpawned && allKilled) {
      this.waveFSM.fire("cleared");
      this.clearT = 0;
      this.waveClearSent = false;
    }
  }

  /**
   * Update zone expansion, wave transitions, and edge danger.
   * Called every frame during active/cleared states.
   * @param countdownActive — true во время обратного отсчёта; зона НЕ активируется.
   */
  update(
    dt: number,
    playerPos: PlayerPosition,
    enemyList: Enemy[],
    asteroids: AsteroidLike[],
    countdownActive: boolean
  ): void {
    const currentState = this.waveFSM.state;
    console.log('[DEBUG WaveOrchestrator] update called: waveFSM.state =', currentState, 'zone.active =', this.zone.active, 'countdownActive =', countdownActive);
    if (currentState !== "active" && currentState !== "cleared") {
      console.log('[DEBUG WaveOrchestrator] returning early: state =', currentState);
      return;
    }

    // Initialize zone when countdown ends
    if (!this.zone.active && currentState === "active" && !countdownActive) {
      console.log('[DEBUG WaveOrchestrator] ACTIVATING ZONE!');
      this.activateZone(playerPos.x, playerPos.y);
    }

    // Expand zone or handle clear transition
    if (currentState === "active") {
      this.updateZoneExpansion(dt);
      this.updateEdgeDanger(dt, playerPos);
      this.applyZoneConstraints(dt, enemyList, asteroids);
    } else if (currentState === "cleared") {
      this.updateClearTransition(dt);
      this.applyZoneConstraints(dt, enemyList, asteroids);
    }
  }

  reset(): void {
    this.zone = {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      targetRadius: 0,
      alpha: 0,
      collapseT: -1,
    };
    this.wave = 1;
    this.waveTotal = 0;
    this.allocated = 0;
    this.killedWave = 0;
    this.clearT = 0;
    this.waveClearSent = false;
    this.edgeOutT = 0;
    this.edgeTickT = 0;
    this.edgeWarned = false;
    
    // Reset wave FSM
    this.waveFSM = new GameStateMachine<WaveFSMContext>("active", WAVE_TRANSITIONS as any, { wave: 1, waveTotal: 0, allocated: 0, killedWave: 0 });
  }

  // ============================== Private methods ==============================

  private updateZoneExpansion(dt: number): void {
    if (this.zone.radius < this.zone.targetRadius) {
      const expandSpeed = zoneExpandSpeed(this.speedMult, this.playerMaxSpeed);
      this.zone.radius = Math.min(
        this.zone.targetRadius,
        this.zone.radius + expandSpeed * dt
      );
      this.zone.alpha = Math.min(0.5, this.zone.alpha + dt * 1.2);
    }
  }

  private updateClearTransition(dt: number): void {
    this.clearT += dt;

    if (this.clearT >= ZONE_CLEAR_BANNER_DELAY && !this.waveClearSent) {
      this.waveClearSent = true;
      this.hooks.onBanner(
        t("game.waveClear"),
        t("game.nextWave", { wave: this.wave + 1 }),
        "#6f6"
      );
      setTimeout(() => this.hooks.onToast("", ""), 2000);
    }

    // Плавно увеличиваем зону и уменьшаем альфа перед исчезновением
    if (this.clearT >= ZONE_CLEAR_EXPAND_START) {
      const expandProgress = clamp(
        (this.clearT - ZONE_CLEAR_EXPAND_START) / ZONE_CLEAR_EXPAND_DURATION,
        0,
        1
      );
      const eased = easeOutCubic(expandProgress);
      // Зона расширяется в 1.5 раза
      this.zone.radius =
        this.zone.targetRadius * (1 + ZONE_CLEAR_EXPAND_MULTIPLIER * eased);
      // Альфа уменьшается от 0.5 до 0
      this.zone.alpha = 0.5 * (1 - eased);
    }

    // Переход к следующей волне только после полного исчезновения зоны
    if (this.clearT >= ZONE_CLEAR_NEXT_WAVE) {
      this.advanceWave();
    }
  }

  private updateEdgeDanger(dt: number, playerPos: PlayerPosition): void {
    if (!this.zone.active) return;

    const dx = playerPos.x - this.zone.x;
    const dy = playerPos.y - this.zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Не наносим урон пока зона не раскрылась хотя бы наполовину
    if (
      this.zone.radius < this.zone.targetRadius * ZONE_EARLY_DAMAGE_THRESHOLD
    )
      return;

    if (dist > this.zone.radius - ZONE_EDGE_MARGIN) {
      this.edgeOutT += dt;
      if (!this.edgeWarned && this.edgeOutT > ZONE_EDGE_WARNING_DELAY) {
        this.edgeWarned = true;
        this.hooks.onToast(t("game.zoneWarning"), "#fa5");
        setTimeout(() => this.hooks.onToast("", ""), 1500);
      }
      if (this.edgeTickT > ZONE_EDGE_DAMAGE_INTERVAL) {
        this.edgeTickT = 0;
        this.hooks.hitPlayer(ZONE_EDGE_DAMAGE_AMOUNT);
        this.hooks.shakeScreen(ZONE_EDGE_SHAKE_STRENGTH, 0.2);
      }
    } else {
      this.edgeOutT = 0;
      this.edgeTickT = 0;
      this.edgeWarned = false;
    }
  }

  private applyZoneConstraints(
    dt: number,
    enemies: Enemy[],
    asteroids: AsteroidLike[]
  ): void {
    if (!this.zone.active || this.zone.radius <= 0) return;

    const zoneRadius = this.zone.radius;
    const zoneCenterX = this.zone.x;
    const zoneCenterY = this.zone.y;

    // Constrain asteroids - keep them outside the zone
    for (const asteroid of asteroids) {
      const adx = asteroid.x - zoneCenterX;
      const ady = asteroid.y - zoneCenterY;
      const dist = Math.hypot(adx, ady);

      // If asteroid is inside zone boundary, push it out strongly
      if (dist < zoneRadius - asteroid.r * 0.5) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const pushForce =
          (zoneRadius - asteroid.r * 0.5 - dist) * ZONE_ASTEROID_PUSH_FORCE;
        asteroid.vx += (adx * pushDir) * pushForce;
        asteroid.vy += (ady * pushDir) * pushForce;
      }
    }

    // Constrain enemies - keep them inside the zone
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const edx = enemy.x - zoneCenterX;
      const edy = enemy.y - zoneCenterY;
      const dist = Math.hypot(edx, edy);
      const enemyR = enemy.r || 15;

      // If enemy is outside zone boundary, push it back inside
      if (dist > zoneRadius - enemyR) {
        const pushDir = dist > 0.01 ? 1 / dist : 0;
        const penetration = dist - (zoneRadius - enemyR);
        const pushForce = Math.min(
          penetration * ZONE_ENEMY_PUSH_FORCE_COEFF,
          ZONE_ENEMY_PUSH_FORCE_MAX
        );
        enemy.vx -= (edx * pushDir) * pushForce * dt;
        enemy.vy -= (edy * pushDir) * pushForce * dt;
      }
    }
  }
}
