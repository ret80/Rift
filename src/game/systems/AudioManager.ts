/**
 * AudioManager — семантическая обёртка над AudioEngine.
 * Инкапсулирует звукособimestые вызовы (подбор предметов, взрывы и т.д.),
 * чтобы игровая логика не содержала прямых вызовов SFX.
 */

import { AudioEngine, type Volumes } from "../audio";
import { PickupKind } from "../balance";

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
    switch (kind) {
      // Heal pickups → heal sound
      case "heal25":
      case "heal50":
      case "heal100":
      case "hp":
        this.engine.pickupHeal();
        break;

      // Rate pickups → rate sound
      case "rate20":
      case "rate40":
      case "rate60":
      case "rate":
        this.engine.pickupRate();
        break;

      // Gun / missile pickups → gun sound
      case "gun":
      case "missile":
        this.engine.pickupGun();
        break;

      // Drone pickup → drone sound
      case "drone":
        this.engine.pickupDrone();
        break;

      // Dash pickup → dash sound
      case "dash":
        this.engine.pickupDash();
        break;

      // Mineral → no special sound (silence)
      case "mineral":
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

  playDashRam(): void {
    this.engine.dashRam();
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

  /** Алиас для совместимости с существующим кодом */
  waveClear(): void {
    this.engine.waveClear();
  }

  /** Алиасы для совместимости с системами (PlayerSystem, EnemySystem, AsteroidField, RiftField) */
  shoot(): void {
    this.engine.shoot();
  }
  enemyShoot(): void {
    this.engine.enemyShoot();
  }
  heavyShoot(): void {
    this.engine.heavyShoot();
  }
  explode(size?: number): void {
    this.engine.explode(size);
  }
  riftOpen(): void {
    this.engine.riftOpen();
  }
  riftSpawn(): void {
    this.engine.riftSpawn();
  }
  riftClose(): void {
    this.engine.riftClose();
  }
}
