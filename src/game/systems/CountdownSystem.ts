/**
 * CountdownSystem — управление обратным отсчётом перед волной, баннерами и тостами.
 * Отвечает за показ счётчиков (5, 4, 3, 2, 1) при начале волны.
 */

import { t } from "../../i18n";
import type { EventBus } from "../core/EventBus";

export interface BannerData {
  title: string;
  sub?: string;
  color?: string;
}

export interface ToastData {
  text: string;
  color?: string;
}

export interface CountData {
  id: number;
  label: string;
  value: string;
}

export interface CountdownHooks {
  onBanner: (b: BannerData | null) => void;
  onToast: (toast: ToastData | null) => void;
  onCountdown: (c: CountData | null) => void;
  countdownDone?: () => void;
}

export class CountdownSystem {
  private hooks: CountdownHooks;
  private eventBus: EventBus;
  private cdT = 0;
  private cdLast = -1;
  private countId = 0;
  private currentWave = 1;
  private started = false;

  constructor(config: { hooks: CountdownHooks; eventBus: EventBus }) {
    this.hooks = config.hooks;
    this.eventBus = config.eventBus;
  }

  /**
    * Начать обратный отсчёт перед волной.
    */
  beginCountdown(wave: number): void {
    this.currentWave = wave;
    this.cdT = 5;
    this.cdLast = -1;
    this.started = false;
  }

  /**
    * Алиас для beginCountdown (для совместимости).
    */
  startWave(wave: number): void {
    this.beginCountdown(wave);
  }

  /**
    * Обновить отсчёт.
    */
  update(dt: number): void {
    this.cdT -= dt;
    const c = Math.ceil(this.cdT);

    // Публикуем wave_started ОДИН РАЗ когда отсчёт начинается
    if (!this.started && c === 5) {
      this.started = true;
      this.eventBus.publish("wave_started", { wave: this.currentWave });
    }

    // Показываем цифры 5, 4, 3, 2, 1
    if (c !== this.cdLast && c > 0) {
      this.cdLast = c;
      this.hooks.onCountdown({
        id: this.countId++,
        label: t("game.waveN", { n: String(this.currentWave).padStart(2, "0") }),
        value: String(c),
      });
    }

    // Когда countdown заканчивается — скрываем и вызываем callback
    if (this.cdT <= 0) {
      this.hooks.onCountdown(null);
      if (this.hooks.countdownDone) {
        this.hooks.countdownDone();
      }
      // Больше не обновляем
      return;
    }
  }

  /**
   * Показать баннер.
   */
  showBanner(banner: BannerData | null): void {
    this.hooks.onBanner(banner);
  }

  /**
   * Показать тост.
   */
  showToast(toast: ToastData | null): void {
    this.hooks.onToast(toast);
  }

  /**
     * Сбросить состояние.
     */
  reset(): void {
    this.cdT = 0;
    this.cdLast = -1;
    this.started = false;
    this.hooks.onCountdown(null);
    this.hooks.onBanner(null);
    this.hooks.onToast(null);
  }

  /**
   * Проверить, идёт ли сейчас обратный отсчёт.
   */
  isCountdownActive(): boolean {
    return this.cdT > 0;
  }
}
