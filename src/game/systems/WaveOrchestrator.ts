/**
 * WaveOrchestrator - wave and zone orchestrator.
 * Manages wave lifecycle, zone behavior,
 * and zone edge damage.
 *
 * FSM States:
 *   inactive → active → cleared → (next wave)
 */

import { t } from "../../i18n";
import {
    ZONE_CLEAR_BANNER_DELAY,
    ZONE_CLEAR_EXPAND_DURATION,
    ZONE_CLEAR_EXPAND_MULTIPLIER,
    ZONE_CLEAR_EXPAND_START,
    ZONE_CLEAR_NEXT_WAVE,
    ZONE_EARLY_DAMAGE_THRESHOLD,
    ZONE_EDGE_DAMAGE_AMOUNT,
    ZONE_EDGE_DAMAGE_INTERVAL,
    ZONE_EDGE_MARGIN,
    ZONE_EDGE_SHAKE_STRENGTH,
    ZONE_EDGE_WARNING_DELAY,
    ZONE_INITIAL_RADIUS,
    zoneExpandSpeed,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import { ZONE_NOT_COLLAPSING } from "../core/ZoneTypes";
import { clamp, easeOutCubic } from "../math";

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

// Re-export for backward compatibility
export type ZoneState = ZoneData;

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

// ============================== Wave State Types ==============================

export type WaveStateId = "inactive" | "active" | "cleared";

// ============================== Internal Timing Constants ==============================

/** Duration for clearing short toast notifications (ms) */
const TOAST_CLEAR_SHORT = 1500;
/** Duration for clearing banner toast notifications (ms) */
const TOAST_CLEAR_LONG = 2000;

export class WaveOrchestrator {
  private hooks: WaveOrchestratorHooks;
  private playerMaxSpeed: number;
  private zone: ZoneData;
  private speedMult: number = 1.0;

  // Wave tracking
  private _wave: number = 1;
  private _waveTotal: number = 0;
  private allocated: number = 0;
  private killedWave: number = 0;
  private clearT: number = 0;
  private waveClearSent: boolean = false;

  // Wave state (replaced FSM with simple state for clarity)
  private _waveState: WaveStateId = "active";

  // Edge danger tracking
  private edgeOutT: number = 0;
  private edgeTickT: number = 0;
  private edgeWarned: boolean = false;

  // Timeout tracking — cleared on reset to prevent leaks
  private timeoutIds: ReturnType<typeof setTimeout>[] = [];

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

    this._waveState = "active";
  }

  // ============================== Public API ==============================

  get zoneState(): ZoneState {
    return this.zone;
  }

  get waveState(): WaveStateId {
    return this._waveState;
  }

  /** Текущий номер волны (источник правды). */
  get wave(): number {
    return this._wave;
  }

  /** Общее число врагов на текущей волне (источник правды). */
  get waveTotal(): number {
    return this._waveTotal;
  }

  initWave(
    playerX: number,
    playerY: number,
    wave: number,
    waveTotal: number
  ): void {
    this._wave = wave;
    this._waveTotal = waveTotal;
    this.allocated = 0;
    this.killedWave = 0;
    this.clearT = 0;
    this.waveClearSent = false;
    this.edgeOutT = 0;
    this.edgeTickT = 0;
    this.edgeWarned = false;

    // Reset wave state
    this._waveState = "active";

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
    this.zone.targetRadius = Math.max(400, 200 + this._wave * 50);
    this.zone.radius = ZONE_INITIAL_RADIUS;
    this.zone.alpha = 0;
    this.zone.collapseT = -1;
    this.zone.active = true;
  }

  setSpeedMult(mult: number): void {
    this.speedMult = mult;
  }

  advanceWave(): void {
    this._wave++;
    this.killedWave = 0;
    this.allocated = 0;
    this.clearT = 0;
    // Transition from cleared back to active
    this._waveState = "active";
    // Zone will be reactivated after next countdown
    this.zone.active = false;
    // Notify Game to start countdown
    this.hooks.onWaveAdvanced(this._wave);
  }

  markAllSpawnedAndKilled(): void {
    this.allocated = this._waveTotal;
    this.killedWave = this._waveTotal;
  }

  tryCheckWaveClear(allSpawned: boolean, allKilled: boolean): void {
    if (this._waveState !== "active") return;

    if (allSpawned && allKilled) {
      this._waveState = "cleared";
      this.clearT = 0;
      this.waveClearSent = false;
    }
  }

  /**
   * Update zone expansion and wave transitions.
   * Called every frame during active/cleared states.
   * Zone constraints are handled by ZoneSystem.
   * @param countdownActive — true during countdown; zone is NOT activated.
   */
  update(
    dt: number,
    playerPos: PlayerPosition,
    countdownActive: boolean
  ): void {
    const currentState = this._waveState;
    if (currentState !== "active" && currentState !== "cleared") {
      return;
    }

    // Initialize zone when countdown ends
    if (!this.zone.active && currentState === "active" && !countdownActive) {
      this.activateZone(playerPos.x, playerPos.y);
    }

    // Expand zone or handle clear transition
    if (currentState === "active") {
      this.updateZoneExpansion(dt);
      this.updateEdgeDanger(dt, playerPos);
    } else if (currentState === "cleared") {
      this.updateClearTransition(dt);
    }
  }

  /** Сбросить состояние волн. targetWave — волна, с которой начинается игра */
  reset(targetWave: number = 1): void {
    this.zone = {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      targetRadius: 0,
      alpha: 0,
      collapseT: ZONE_NOT_COLLAPSING,
    };
    this._wave = targetWave;
    this._waveTotal = 0;
    this.allocated = 0;
    this.killedWave = 0;
    this.clearT = 0;
    this.waveClearSent = false;
    this.edgeOutT = 0;
    this.edgeTickT = 0;
    this.edgeWarned = false;

    // Reset wave state
    this._waveState = "active";

    // Clear all pending timeouts to prevent leaks
    for (const id of this.timeoutIds) {
      clearTimeout(id);
    }
    this.timeoutIds = [];
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
        t("game.waveCleared"),
        t("game.nextWave", { wave: this._wave + 1 }),
        "#6f6"
      );
      // Schedule toast clear after TOAST_CLEAR_LONG ms
      const toastClearId = setTimeout(() => this.hooks.onToast("", ""), TOAST_CLEAR_LONG);
      this.timeoutIds.push(toastClearId);
    }

    // Smoothly expand zone and reduce alpha before disappearing
    if (this.clearT >= ZONE_CLEAR_EXPAND_START) {
      const expandProgress = clamp(
        (this.clearT - ZONE_CLEAR_EXPAND_START) / ZONE_CLEAR_EXPAND_DURATION,
        0,
        1
      );
      const eased = easeOutCubic(expandProgress);
      // Zone expands to 1.5x target
      this.zone.radius =
        this.zone.targetRadius * (1 + ZONE_CLEAR_EXPAND_MULTIPLIER * eased);
      // Alpha decreases from 0.5 to 0
      this.zone.alpha = 0.5 * (1 - eased);
    }

    // Advance to next wave only after zone fully disappears
    if (this.clearT >= ZONE_CLEAR_NEXT_WAVE) {
      this.advanceWave();
    }
  }

  private updateEdgeDanger(dt: number, playerPos: PlayerPosition): void {
    if (!this.zone.active) return;

    const dx = playerPos.x - this.zone.x;
    const dy = playerPos.y - this.zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Don't deal damage while zone hasn't expanded at least halfway
    if (
      this.zone.radius < this.zone.targetRadius * ZONE_EARLY_DAMAGE_THRESHOLD
    )
      return;

    if (dist > this.zone.radius - ZONE_EDGE_MARGIN) {
      this.edgeOutT += dt;
      if (!this.edgeWarned && this.edgeOutT > ZONE_EDGE_WARNING_DELAY) {
        this.edgeWarned = true;
        this.hooks.onToast(t("game.zoneWarning"), "#fa5");
        // Schedule toast clear after TOAST_CLEAR_SHORT ms
        const toastClearId = setTimeout(() => this.hooks.onToast("", ""), TOAST_CLEAR_SHORT);
        this.timeoutIds.push(toastClearId);
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

}
