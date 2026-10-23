/**
 * Game — тонкий оркестратор игровых систем.
 *
 * Вся композиция систем, кадровый цикл, старт забега и работа с
 * апгрейдами вынесены в core/GameContext и его слои (GameFrame,
 * GameRender, GameStart, GameListeners, GameUpgrades). Здесь остаётся
 * публичный фасад для React-UI и делегирование вызовов.
 */

import { EnemyKind, type PickupKind } from "./balance";
import type { PlayerUpgrades, WeaponStatKey } from "./upgrades";
import type { WeaponId } from "./weapons/Weapon";
import type { DroneId, DroneStatKey } from "./drones/Drone";
import type { PersistencePort } from "./core/PersistencePort";
import { GameContext } from "./core/GameContext";
import type { Hooks } from "./core/GameHooks";

/* UI types — единый источник правды */
export type { BannerData, CountData, HudData, StatsData, ToastData } from "./types/ui";

export class Game {
  private readonly ctx: GameContext;

  constructor(canvas: HTMLCanvasElement, hooks: Hooks, storage: PersistencePort) {
    this.ctx = new GameContext(canvas, hooks, storage);
  }

  /** Audio-менеджер для прямой инициализации звука из App.tsx. */
  get audio() {
    return this.ctx.audio;
  }

  destroy(): void {
    this.ctx.destroy();
  }

  /* ===== Public methods for App.tsx ===== */

  setVolumes(vols: { master: number; sfx: number; music: number }): void {
    this.ctx.audio.setVolumes(vols);
  }

  setDebugGod(on: boolean): void {
    this.ctx.debugSystem.setGodMode(on);
  }

  setStartWave(wave: number): void {
    this.ctx.startWave = wave;
  }

  setEnabledEnemies(enemies: EnemyKind[] | null): void {
    this.ctx.spawnSystem.setEnabledEnemies(enemies);
  }

  setEnabledPickups(pickups: PickupKind[] | null): void {
    this.ctx.dropSystem.setEnabledPickups(pickups);
  }

  fps(): number {
    return this.ctx.fps();
  }

  /** Get persistent player upgrades */
  getPlayerUpgrades(): PlayerUpgrades {
    return this.ctx.upgrades.get();
  }

  /** Re-apply upgrades from localStorage (called after purchasing or reset) */
  refreshUpgrades(): void {
    this.ctx.upgrades.refresh();
  }

  /** Purchase upgrade bypassing cost check (debug/dev) */
  purchaseUpgradeNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    return this.ctx.upgrades.purchaseNoCost(key);
  }

  /** Купить апгрейд с проверкой стоимости (через порт хранилища). */
  purchaseUpgradeCosted(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    return this.ctx.upgrades.purchaseCosted(key);
  }

  /** Купить оружие в арсенале. */
  purchaseWeapon(id: WeaponId): boolean {
    return this.ctx.upgrades.purchaseWeapon(id);
  }

  /** Debug-only: получить оружие бесплатно. */
  purchaseWeaponNoCost(id: WeaponId): boolean {
    return this.ctx.upgrades.purchaseWeaponNoCost(id);
  }

  /** Купить уровень линии оружия в арсенале. */
  upgradeWeaponStat(id: WeaponId, stat: WeaponStatKey): boolean {
    return this.ctx.upgrades.upgradeWeaponStat(id, stat);
  }

  /** Debug-only: прокачать линию оружия бесплатно. */
  upgradeWeaponStatNoCost(id: WeaponId, stat: WeaponStatKey): boolean {
    return this.ctx.upgrades.upgradeWeaponStatNoCost(id, stat);
  }

  /** Персистентный арсенал игрока. */
  getWeaponLoadout() {
    return this.ctx.upgrades.getLoadout();
  }

  /** Число слотов оружия у текущего корабля. */
  getWeaponSlots(): number {
    return this.ctx.upgrades.getWeaponSlots();
  }

  /** Число занятых слотов (купленные виды оружия). */
  getUsedWeaponSlots(): number {
    return this.ctx.upgrades.getUsedWeaponSlots();
  }

  /** Персистентный ангар дронов игрока. */
  getDroneLoadout() {
    return this.ctx.upgrades.getDroneLoadout();
  }

  /** Число слотов под дроны у текущего корабля. */
  getDroneSlots(): number {
    return this.ctx.upgrades.getDroneSlots();
  }

  /** Число занятых слотов (купленные единицы дронов). */
  getUsedDroneSlots(): number {
    return this.ctx.upgrades.getUsedDroneSlots();
  }

  /** Купить единицу дрона в ангаре. */
  purchaseDrone(id: DroneId): boolean {
    return this.ctx.upgrades.purchaseDrone(id);
  }

  /** Debug-only: получить единицу дрона бесплатно. */
  purchaseDroneNoCost(id: DroneId): boolean {
    return this.ctx.upgrades.purchaseDroneNoCost(id);
  }

  /** Купить уровень линии дрона в ангаре. */
  upgradeDroneStat(id: DroneId, stat: DroneStatKey): boolean {
    return this.ctx.upgrades.upgradeDroneStat(id, stat);
  }

  /** Debug-only: прокачать линию дрона бесплатно. */
  upgradeDroneStatNoCost(id: DroneId, stat: DroneStatKey): boolean {
    return this.ctx.upgrades.upgradeDroneStatNoCost(id, stat);
  }

  public togglePause(): void {
    this.ctx.togglePause();
  }

  toMenu(): void {
    this.ctx.toMenu();
  }

  setTouch(active: boolean, x: number, y: number): void {
    this.ctx.input.setTouch(active, x, y);
  }

  startRun(): void {
    this.ctx.startRun();
  }
}