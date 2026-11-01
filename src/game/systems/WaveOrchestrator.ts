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
  ZONE_CLEAR_NEXT_WAVE,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import { ZoneEdgeDamage, type PlayerPosition } from "../waves/ZoneEdgeDamage";
import { ZoneModel } from "../waves/ZoneModel";
import { WaveStateMachine, type WaveStateId } from "../waves/WaveStateMachine";

export interface WaveOrchestratorHooks {
  onBanner: (title: string, sub?: string, color?: string) => void;
  onToast: (text: string, color?: string) => void;
  /** Урон за краем зоны — в обход щита. */
  hitPlayerRaw: (amount: number) => void;
  shakeScreen: (strength: number, duration: number) => void;
  onWaveAdvanced: (wave: number) => void;
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
  private speedMult = 1.0;

  /** Баннер «волна зачищена» уже показан. */
  private waveClearSent = false;
  /** Таймер очистки тоста; тикает только в cleared-состоянии. */
  private toastClearTimer = 0;

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

  /** Текущий номер волны (источник правды). */
  get wave(): number {
    return this.waves.wave;
  }

  /** Общее число врагов на текущей волне (источник правды). */
  get waveTotal(): number {
    return this.waves.total;
  }

  initWave(
    playerX: number,
    playerY: number,
    wave: number,
    waveTotal: number,
  ): void {
    this.waves.init(wave, waveTotal);
    this.zone.prepare(playerX, playerY);
    this.edge.reset();
    this.waveClearSent = false;
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
      this.zone.expand(dt, this.speedMult, this.playerMaxSpeed);
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
    this.waveClearSent = false;
    this.toastClearTimer = 0;
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

  private updateClearTransition(dt: number): void {
    const clearT = this.waves.addClearTime(dt);

    if (clearT >= ZONE_CLEAR_BANNER_DELAY && !this.waveClearSent) {
      this.waveClearSent = true;
      this.hooks.onBanner(
        t("game.waveCleared"),
        t("game.nextWave", { wave: this.waves.wave + 1 }),
        "#6f6",
      );
      // Баннер зачистки держится дольше обычного тоста.
      this.toastClearTimer = TOAST_CLEAR_LONG;
    }

    this.zone.applyClearExpansion(dt, clearT, this.speedMult, this.playerMaxSpeed);

    // Переходим к следующей волне только после полного исчезновения зоны.
    if (clearT >= ZONE_CLEAR_NEXT_WAVE) {
      this.advanceWave();
    }
  }
}
