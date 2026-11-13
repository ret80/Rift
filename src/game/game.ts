/**
 * Game — тонкий оркестратор игровых систем.
 *
 * Вся композиция систем, кадровый цикл, старт забега и работа с
 * апгрейдами вынесены в core/GameContext и его слои (GameFrame,
 * GameRender, GameStart, GameWorld, GameUpgrades). Здесь остаётся
 * публичный фасад для React-UI и делегирование вызовов.
 */

import { EnemyKind, type PickupKind } from "./balance";
import type { PlayerUpgrades, UpgradeKey, WeaponStatKey } from "./upgrades";
import type { WeaponId } from "./weapons/Weapon";
import type { DroneId, DroneStatKey } from "./drones/Drone";
import type { PersistencePort } from "./core/PersistencePort";
import { GameContext } from "./core/GameContext";
import type { Hooks } from "./core/GameHooks";
import type { PhysicsEngineId } from "./physics";
import type { WaveCompositionOverride } from "./balance/waves";
import type { ParamProfileId } from "./balance/params/profiles";
import type { DroneOrder } from "./ecs/components/AllyDroneComponent";
import type { DoctrineOffer } from "./meta/doctrines";

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

  /**
   * Отладочный сдвиг скорости игрока в процентах (−50…+50).
   * Действует только на тестовых уровнях из меню отладки.
   */
  setTestSpeed(percent: number): void {
    this.ctx.setTestSpeed(percent);
  }

  /**
   * Отладочный сдвиг размера арены в процентах (−50…+50).
   * Действует только на тестовых уровнях из меню отладки.
   */
  setTestZone(percent: number): void {
    this.ctx.setTestZone(percent);
  }

  /** Выбрать профиль параметров мира (по умолчанию — `default`). */
  setParamProfile(profileId: ParamProfileId): void {
    this.ctx.setParamProfile(profileId);
  }

  /** Включить тестовую волну заданного состава (`?test=...`). */
  setWaveOverride(override: WaveCompositionOverride): void {
    this.ctx.setWaveOverride(override);
  }

  setEnabledEnemies(enemies: EnemyKind[] | null): void {
    this.ctx.spawnSystem.setEnabledEnemies(enemies);
  }

  /** Тестовый режим: без рекордов и начисления деталей. */
  setTestMode(on: boolean): void {
    this.ctx.testMode = on;
  }

  /** Одиночный тест уровня из меню отладки. */
  startTestLevel(wave: number, enemies: EnemyKind[]): void {
    this.ctx.startTestLevel(wave, enemies);
  }

  setEnabledPickups(pickups: PickupKind[] | null): void {
    this.ctx.dropSystem.setEnabledPickups(pickups);
  }

  /** Сменить физический движок (меню настроек). */
  setPhysicsEngine(id: PhysicsEngineId): void {
    this.ctx.setPhysicsEngine(id);
  }

  fps(): number {
    return this.ctx.fps();
  }

  /** Текущий рекорд (из персистентного скоринга). */
  getBest(): number {
    return this.ctx.scoringSystem.best;
  }

  /** Get persistent player upgrades */
  getPlayerUpgrades(): PlayerUpgrades {
    return this.ctx.upgrades.get();
  }

  /** Re-apply upgrades from localStorage (called after purchasing or reset) */
  refreshUpgrades(): void {
    this.ctx.upgrades.refresh();
  }

  /** Купить апгрейд за детали (через кошелёк). */
  purchaseUpgrade(key: UpgradeKey): boolean {
    return this.ctx.upgrades.purchaseUpgrade(key);
  }

  /** Запас деталей забега. */
  getParts(): number {
    return this.ctx.getParts();
  }

  /** Включены ли бесконечные детали. */
  isPartsInfinite(): boolean {
    return this.ctx.isPartsInfinite();
  }

  /** Отладочный режим бесконечных деталей. */
  setInfiniteParts(on: boolean): void {
    this.ctx.setPartsInfinite(on);
  }

  /** Отладочный режим бесконечных кредитов. */
  setInfiniteCredits(on: boolean): void {
    this.ctx.setCreditsInfinite(on);
  }

  /** Открыть ангар тестового профиля из меню отладки на выбранной волне. */
  openTestHangar(wave: number): void {
    this.ctx.openTestHangar(wave);
  }

  /** Закрыть ангар тестового профиля: покупки запоминаются. */
  closeTestHangar(): void {
    this.ctx.closeTestHangar();
  }

  /** Сбросить тестовый профиль к базовому кораблю. */
  resetTestProfile(): void {
    this.ctx.resetTestProfile();
  }

  /** Открыть всё снаряжение без достижений (отладка). */
  setDebugUnlocks(on: boolean): void {
    this.ctx.setDebugUnlocks(on);
  }

  /** Открыто ли оружие достижением. */
  isWeaponUnlocked(id: WeaponId): boolean {
    return this.ctx.world.isWeaponUnlocked(id);
  }

  /** Открыт ли дрон достижением. */
  isDroneUnlocked(id: DroneId): boolean {
    return this.ctx.world.isDroneUnlocked(id);
  }

  /** Купить оружие в арсенале. */
  purchaseWeapon(id: WeaponId): boolean {
    return this.ctx.upgrades.purchaseWeapon(id);
  }

  /** Купить уровень линии оружия в арсенале. */
  upgradeWeaponStat(id: WeaponId, stat: WeaponStatKey): boolean {
    return this.ctx.upgrades.upgradeWeaponStat(id, stat);
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

  /** Купить уровень линии дрона в ангаре. */
  upgradeDroneStat(id: DroneId, stat: DroneStatKey): boolean {
    return this.ctx.upgrades.upgradeDroneStat(id, stat);
  }

  public togglePause(): void {
    this.ctx.togglePause();
  }

  /** Награда за босс-волну: предложенные доктрины (null — выбора нет). */
  getDoctrineOffer(): DoctrineOffer | null {
    return this.ctx.doctrineOffer;
  }

  /** Выбрать доктрину из предложенных и продолжить забег. */
  chooseDoctrine(id: string): void {
    this.ctx.chooseDoctrine(id);
  }

  /** Открыть ангар между волнами (мир замирает). */
  openHangar(): void {
    this.ctx.openHangar();
  }

  /** Закрыть ангар и продолжить забег со следующей волны. */
  closeHangar(): void {
    this.ctx.closeHangar();
  }

  toMenu(): void {
    this.ctx.toMenu();
  }

  /** Подключён ли геймпад. */
  get isGamepadConnected(): boolean {
    return this.ctx.gamepad.isConnected;
  }

  setTouch(active: boolean, x: number, y: number): void {
    this.ctx.input.setTouch(active, x, y);
  }

  /** Кнопка форсажа на тач-экране. */
  requestBoost(): void {
    this.ctx.input.pressVirtual("ShiftLeft");
  }

  startRun(): void {
    this.ctx.startRun();
  }

  /** Кнопка `?record`: начать/остановить запись забега. */
  toggleRecording(): void {
    this.ctx.toggleRecordButton();
  }

  /** Отладка: записать следующий тестовый уровень. */
  armTestRecording(): void {
    this.ctx.armTestRecording();
  }

  /** Отладка: есть ли готовая запись теста и взведена ли новая. */
  getTestRecordingState(): { armed: boolean; ready: boolean } {
    return this.ctx.getTestRecordingState();
  }

  /** Отладка: скачать готовую запись тестового уровня. */
  downloadTestRecording(): boolean {
    return this.ctx.downloadTestRecording();
  }

  /** Войти в тактический режим или выйти из него. */
  toggleTactical(): void {
    this.ctx.toggleTactical();
  }

  /** Приказ рою дронов (эскорт / штурм / фокус). */
  setDroneOrder(order: DroneOrder): void {
    this.ctx.setDroneOrder(order);
  }
}