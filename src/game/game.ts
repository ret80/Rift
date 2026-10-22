/**
 * Game — тонкий оркестратор игровых систем.
 *
 * Вся композиция систем, кадровый цикл, старт забега и работа с
 * апгрейдами вынесены в core/GameContext и его слои (GameFrame,
 * GameRender, GameStart, GameListeners, GameUpgrades). Здесь остаётся
 * публичный фасад для React-UI и делегирование вызовов.
 */

import { EnemyKind, type PickupKind } from "./balance";
import type { PlayerUpgrades } from "./upgrades";
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