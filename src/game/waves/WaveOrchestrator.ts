/**
 * WaveOrchestrator — координатор волны и зоны.
 *
 * Собирает три независимых модели:
 *   • WaveStateMachine — номер волны, счётчики и переход cleared;
 *   • ZoneModel — геометрия и расширение зоны;
 *   • ZoneEdgeDamage — урон и предупреждение за краем.
 *
 * Здесь остаются только жизненный цикл волны и связка моделей с хуками.
 */

import { t } from "../../i18n";
import {
  ZONE_CLEAR_BANNER_DELAY,
  ZONE_CLEAR_BANNER_HOLD,
  ZONE_CLEAR_NEXT_WAVE,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import type { BannerData } from "../types/ui";
import { ZoneEdgeDamage, type PlayerPosition } from "./ZoneEdgeDamage";
import { ZoneModel } from "./ZoneModel";
import { ZoneStorm, type ZoneStormState } from "./ZoneStorm";
import {
  WaveStateMachine,
  waveTypeFor,
  type WaveStateId,
  type WaveType,
} from "./WaveStateMachine";

export interface WaveOrchestratorHooks {
  /** Показать баннер или погасить его (`null`). */
  onBanner: (banner: BannerData | null) => void;
  onToast: (text: string, color?: string) => void;
  /** Урон за краем зоны — в обход щита. */
  hitPlayerRaw: (amount: number) => void;
  /** Урон бури на кромке — через щит. */
  hitPlayerShielded: (amount: number) => void;
  shakeScreen: (strength: number, duration: number) => void;
  /** Звук урона за краем арены. */
  onWarning?: () => void;
  onWaveAdvanced: (wave: number) => void;
  /** Волна зачищена (один раз за волну). */
  onWaveCleared?: (wave: number) => void;
}

export interface WaveOrchestratorConfig {
  hooks: WaveOrchestratorHooks;
  playerMaxSpeed: number;
  /** Текущее максимальное здоровье игрока (для урона у края зоны). */
  getPlayerMaxHp: () => number;
}

/** Снимок зоны для рендера/систем. */
export type ZoneState = ZoneData;
export type { WaveStateId };

/** Длительность очистки длинного тоста (секунды). */
const TOAST_CLEAR_LONG = 2.0;

export class WaveOrchestrator {
  private readonly hooks: WaveOrchestratorHooks;
  private readonly playerMaxSpeed: number;
  private readonly getPlayerMaxHp: () => number;
  private readonly waves = new WaveStateMachine();
  private readonly zone = new ZoneModel();
  private readonly edge = new ZoneEdgeDamage();
  private readonly storm = new ZoneStorm();
  private speedMult = 1.0;

  /** Баннер «волна зачищена» уже показан. */
  private waveClearSent = false;
  /** Остаток жизни баннера зачистки; > 0 — баннер ещё на экране. */
  private bannerTimer = 0;
  /** Таймер очистки тоста; тикает только в cleared-состоянии. */
  private toastClearTimer = 0;
  /** Предупреждение о сжатии зоны уже показано на этой волне. */
  private collapseAnnounced = false;

  constructor(config: WaveOrchestratorConfig) {
    this.hooks = config.hooks;
    this.playerMaxSpeed = config.playerMaxSpeed;
    this.getPlayerMaxHp = config.getPlayerMaxHp;
  }

  // ============================== Public API ==============================

  get zoneState(): ZoneState {
    return this.zone.state;
  }

  get waveState(): WaveStateId {
    return this.waves.state;
  }

  /**
   * Игрок за краем арены. Вне активной волны урона нет, поэтому и
   * предупреждение в HUD не показывается.
   */
  get outsideZone(): boolean {
    return this.waves.state === "active" && this.edge.isOutside;
  }

  /** Снимок бури на кромке для рендера. */
  get stormState(): ZoneStormState {
    return this.storm.state;
  }

  /** Текущий номер волны (источник правды). */
  get wave(): number {
    return this.waves.wave;
  }

  /** Общее число врагов на текущей волне (источник правды). */
  get waveTotal(): number {
    return this.waves.total;
  }

  /** Явный тип волны: combat или objective. */
  get waveType(): WaveType {
    return this.waves.waveType;
  }

  initWave(
    playerX: number,
    playerY: number,
    wave: number,
    waveTotal: number,
    waveType: WaveType = waveTypeFor(wave),
  ): void {
    this.waves.init(wave, waveTotal, waveType);
    this.zone.prepare(playerX, playerY);
    this.edge.reset();
    this.storm.reset();
    this.waveClearSent = false;
    this.bannerTimer = 0;
    this.collapseAnnounced = false;
  }

  activateZone(playerX: number, playerY: number): void {
    this.zone.activate(playerX, playerY, this.waves.wave);
  }

  setSpeedMult(mult: number): void {
    this.speedMult = mult;
  }

  advanceWave(): void {
    const wave = this.waves.advance();
    // Зона будет активирована после следующего отсчёта.
    this.zone.hide();
    this.hooks.onWaveAdvanced(wave);
  }

  tryCheckWaveClear(allSpawned: boolean, allKilled: boolean): void {
    if (this.waves.tryClear(allSpawned, allKilled)) {
      this.waveClearSent = false;
      // Волна зачищена: зона начинает гаснуть сразу, от текущей альфы.
      this.zone.beginClear();
      this.hooks.onWaveCleared?.(this.waves.wave);
    }
  }

  /**
   * Обновить зону и переходы волны.
   * @param countdownActive — во время отсчёта зона не активируется.
   */
  update(
    dt: number,
    playerPos: PlayerPosition,
    countdownActive: boolean,
  ): void {
    const state = this.waves.state;
    if (state !== "active" && state !== "cleared") return;

    // Тост живёт своё время в любом состоянии волны: предупреждение о выходе
    // из зоны не должно висеть до конца волны.
    this.tickToast(dt);

    // Активируем зону, когда отсчёт закончился.
    if (!this.zone.state.active && state === "active" && !countdownActive) {
      this.activateZone(playerPos.x, playerPos.y);
    }

    if (state === "active") {
      this.zone.update(dt, this.speedMult, this.playerMaxSpeed);
      this.storm.update(
        dt,
        this.zone.state,
        playerPos,
        this.getPlayerMaxHp(),
        this.waves.wave,
        { hitPlayerShielded: this.hooks.hitPlayerShielded },
      );
      this.announceCollapse();

      this.edge.update(
        dt,
        this.zone.state,
        playerPos,
        this.getPlayerMaxHp(),
        this.hooks,
        (seconds) => {
          this.toastClearTimer = seconds;
        },
      );
    } else {
      this.updateClearTransition(dt);
    }
  }

  /** Сбросить состояние волн. targetWave — волна, с которой начинается игра. */
  reset(targetWave: number = 1): void {
    this.zone.reset();
    this.waves.reset(targetWave);
    this.edge.reset();
    this.storm.reset();
    this.waveClearSent = false;
    this.bannerTimer = 0;
    this.toastClearTimer = 0;
    this.collapseAnnounced = false;
  }

  /**
   * Один раз за волну предупредить о сжатии зоны.
   *
   * Телеграф виден и на арене (пульсирующее кольцо), но тост объясняет
   * новичку, что происходит и что делать: двигаться внутрь.
   */
  private announceCollapse(): void {
    if (this.collapseAnnounced) return;
    if (this.zone.state.collapseT < 0) return;
    this.collapseAnnounced = true;
    this.hooks.onToast(t("game.zoneCollapsing"), "#ff8a8a");
  }

  // ============================== Private methods ==============================

  /** Отсчитать время жизни тоста и погасить его. */
  private tickToast(dt: number): void {
    if (this.toastClearTimer <= 0) return;
    this.toastClearTimer -= dt;
    if (this.toastClearTimer <= 0) {
      this.hooks.onToast("", "");
      this.toastClearTimer = 0;
    }
  }

  /** Отсчитать время жизни баннера зачистки и погасить его. */
  private tickBanner(dt: number): void {
    if (this.bannerTimer <= 0) return;
    this.bannerTimer -= dt;
    if (this.bannerTimer > 0) return;
    this.bannerTimer = 0;
    this.hooks.onBanner(null);
  }

  private updateClearTransition(dt: number): void {
    const clearT = this.waves.addClearTime(dt);

    this.tickBanner(dt);

    if (clearT >= ZONE_CLEAR_BANNER_DELAY && !this.waveClearSent) {
      this.waveClearSent = true;
      this.hooks.onBanner({
        title: t("game.waveCleared"),
        sub: t("game.nextWave", { wave: this.waves.wave + 1 }),
        color: "#6f6",
      });
      // Баннер зачистки держится дольше обычного тоста.
      this.bannerTimer = ZONE_CLEAR_BANNER_HOLD;
      this.toastClearTimer = TOAST_CLEAR_LONG;
    }

    this.zone.applyClearExpansion(dt, clearT, this.speedMult, this.playerMaxSpeed);

    // Следующая волна — только после исчезновения баннера зачистки,
    // иначе отсчёт новой волны рисуется поверх старого баннера.
    if (clearT >= ZONE_CLEAR_NEXT_WAVE && this.bannerTimer <= 0) {
      this.advanceWave();
    }
  }
}
