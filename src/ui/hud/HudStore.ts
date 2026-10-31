/**
 * HudStore — канал данных HUD между игрой и React.
 *
 * Игра присылает снимок каждый кадр, но подписчикам он публикуется не чаще
 * 15 раз в секунду: HUD не перерисовывает React-дерево на 60 Гц, при этом
 * последнее значение не теряется (публикация идёт по таймеру подписки).
 */

import { useSyncExternalStore } from "react";
import type { HudData } from "../../game/types/ui";

/** Период публикации снимков, мс (≈15 Гц). */
const PUBLISH_INTERVAL_MS = 1000 / 15;

type Listener = () => void;

export class HudStore {
  private latest: HudData | null = null;
  private snapshot: HudData | null = null;
  private readonly listeners = new Set<Listener>();
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Принять снимок из игры. Публикуется ближайшим тиком подписки. */
  push = (data: HudData): void => {
    this.latest = data;
  };

  /** Подписка React-компонента. Запускает публикацию по таймеру. */
  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    if (this.listeners.size === 1) this.start();
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  };

  /** Текущий опубликованный снимок (стабильная ссылка до следующего тика). */
  getSnapshot = (): HudData | null => this.snapshot;

  private publish(): void {
    if (this.latest === null || this.latest === this.snapshot) return;
    this.snapshot = this.latest;
    for (const listener of this.listeners) listener();
  }

  private start(): void {
    this.publish();
    this.timer = setInterval(() => this.publish(), PUBLISH_INTERVAL_MS);
  }

  private stop(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }
}

/** Подписка HUD-компонента на снимки из store. */
export function useHudData(store: HudStore): HudData | null {
  return useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
}
