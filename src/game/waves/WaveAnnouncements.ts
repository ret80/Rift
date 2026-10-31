/**
 * WaveAnnouncements — тосты о новых типах врагов.
 *
 * Хранит уже показанные виды и отдаёт их через узкий ToastSink, чтобы
 * SpawnSystem не смешивал спавн с i18n/UI.
 */

import { C, EnemyKind } from "../balance";
import { t, type TKey } from "../../i18n";

/** Тосты о новых типах врагов — статический маппинг вместо шаблонных ключей. */
const TOAST_KEY: Record<EnemyKind, TKey> = {
  [EnemyKind.Drone]: "toast.drone",
  [EnemyKind.Hunter]: "toast.hunter",
  [EnemyKind.Fighter]: "toast.fighter",
  [EnemyKind.Cruiser]: "toast.cruiser",
  [EnemyKind.Carrier]: "toast.carrier",
};

/** Получатель тостов (GameHooks.onToast). */
export interface ToastSink {
  onToast?(data: { text: string; color?: string }): void;
}

export class WaveAnnouncements {
  private readonly announcedKinds = new Set<EnemyKind>();

  /** Показать тост для каждого ещё не объявленного вида. */
  announce(queue: EnemyKind[], sink: ToastSink): void {
    for (const kind of queue) {
      if (this.announcedKinds.has(kind)) continue;
      this.announcedKinds.add(kind);
      sink.onToast?.({ text: t(TOAST_KEY[kind]), color: C.rift });
    }
  }

  /** Сбросить историю объявлений (новый забег). */
  clear(): void {
    this.announcedKinds.clear();
  }
}
