/**
 * AudioManager — семантическая обёртка над AudioEngine.
 * Инкапсулирует звукособimestые вызовы (подбор предметов, взрывы и т.д.),
 * чтобы игровая логика не содержала прямых вызовов SFX.
 */

import { AudioEngine, type Volumes } from "../audio";
import { PickupKind, PICKUP_CATALOG } from "../balance";

export class AudioManager {
  readonly engine: AudioEngine;

  constructor() {
    this.engine = new AudioEngine();
  }

  // ==================== Lifecycle ====================

  init(): void {
    this.engine.init();
  }

  isRunning(): boolean {
    return this.engine.isRunning();
  }

  destroy(): void {
    this.engine.destroy();
  }

  setVolumes(v: Volumes): void {
    this.engine.setVolumes(v);
  }

  setSuspended(s: boolean): void {
    this.engine.setSuspended(s);
  }

  // ==================== Semantic SFX ====================

  /** Воспроизвести звук подбора предмета */
  playPickupSound(kind: PickupKind): void {
    switch (PICKUP_CATALOG[kind].display) {
      // Heal pickups → heal sound
      case "heal":
        this.engine.pickupHeal();
        break;

      // Rate pickups → rate sound
      case "rate":
        this.engine.pickupRate();
        break;

      // Gun / missile / laser pickups → gun sound
      case "gun":
      case "missile":
      case "laser":
        this.engine.pickupGun();
        break;

      // Drone pickup → drone sound
      case "drone":
        this.engine.pickupDrone();
        break;

      // Shield pickup → shield sound
      case "shield":
        this.engine.pickupShield();
        break;

      // Mineral → no special sound (silence)
      case "mineral":
      // quantum_swap — без отдельного звука
      case "quantum_swap":
        break;
    }
  }

  playExplosion(size = 1): void {
    this.engine.explode(size);
  }

  playShoot(): void {
    this.engine.shoot();
  }

  playEnemyShoot(): void {
    this.engine.enemyShoot();
  }

  playHeavyShoot(): void {
    this.engine.heavyShoot();
  }

  playPlayerHit(): void {
    this.engine.playerHit();
  }

  playWaveClear(): void {
    this.engine.waveClear();
  }

  playGameOver(): void {
    this.engine.gameOver();
  }

  playUpgrade(): void {
    this.engine.upgrade();
  }

  playComboUp(mult: number): void {
    this.engine.comboUp(mult);
  }

  playRiftOpen(): void {
    this.engine.riftOpen();
  }

  playRiftClose(): void {
    this.engine.riftClose();
  }

  playRiftSpawn(): void {
    this.engine.riftSpawn();
  }

  playDroneShot(): void {
    this.engine.droneShot();
  }

  playDroneHit(): void {
    this.engine.droneHit();
  }

  // ==================== Music ====================

  startMusic(): void {
    this.engine.startMusic();
  }

  stopMusic(): void {
    this.engine.stopMusic();
  }

  setCombatWave(wave: number): void {
    this.engine.setCombatWave(wave);
  }

  setCombat(on: boolean): void {
    this.engine.setCombat(on);
  }

  // ==================== UI / Events ====================

  playUiMove(): void {
    this.engine.uiMove();
  }

  playUiClick(): void {
    this.engine.uiClick();
  }

  playUiBack(): void {
    this.engine.uiBack();
  }

  playTick(): void {
    this.engine.tick();
  }

  playGo(): void {
    this.engine.go();
  }
}
