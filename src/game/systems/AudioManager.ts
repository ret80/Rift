/**
 * AudioManager — семантическая обёртка над AudioEngine.
 * Инкапсулирует звукособimestые вызовы (подбор предметов, взрывы и т.д.),
 * чтобы игровая логика не содержала прямых вызовов SFX.
 */

import { AudioEngine, type Volumes } from "../audio";
import type { MenuTrackId, CombatTrackId } from "../audio/tracks";
import { PickupKind, PICKUP_CATALOG } from "../balance";
import { WEAPON_CATALOG } from "../weapons/WeaponCatalog";

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
    const display = PICKUP_CATALOG[kind].display;
    switch (display) {
      // Heal pickups → heal sound
      case "heal":
        this.engine.pickupHeal();
        break;

      // Rate pickups → rate sound
      case "rate":
        this.engine.pickupRate();
        break;

      // Gun pickup → gun sound
      case "gun":
        this.engine.pickupGun();
        break;

      // Drone pickup → sound from the weapon catalog
      case "drone":
      case "missile":
      case "laser":
        if (WEAPON_CATALOG[display].pickup?.sound === "drone") {
          this.engine.pickupDrone();
        } else {
          this.engine.pickupGun();
        }
        break;

      // Shield pickup → shield sound
      case "shield":
        this.engine.pickupShield();
        break;

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

  setMenuTrack(id: MenuTrackId): void {
    this.engine.setMenuTrack(id);
  }

  setCombatTrack(id: CombatTrackId): void {
    this.engine.setCombatTrack(id);
  }

  getMenuTrack(): MenuTrackId {
    return this.engine.getMenuTrack();
  }

  getCombatTrack(): CombatTrackId {
    return this.engine.getCombatTrack();
  }

  previewTrack(id: MenuTrackId | CombatTrackId): void {
    this.engine.previewTrack(id);
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
