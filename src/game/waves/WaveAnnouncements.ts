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
  [EnemyKind.Miner]: "toast.miner",
  [EnemyKind.Boss]: "toast.boss",
  [EnemyKind.Mine]: "toast.mine",
  [EnemyKind.Needle]: "toast.needle",
  [EnemyKind.Shieldbearer]: "toast.shieldbearer",
  [EnemyKind.Harpooner]: "toast.harpooner",
  [EnemyKind.Splitter]: "toast.splitter",
  [EnemyKind.Jammer]: "toast.jammer",
  [EnemyKind.Vortex]: "toast.vortex",
  [EnemyKind.HiveMother]: "toast.hivemother",
  [EnemyKind.Tractor]: "toast.tractor",
};

/** Получатель тостов (GameHooks.onToast). */
export interface ToastSink {
  onToast?(data: { text: string; color?: string }): void;
}

export class WaveAnnouncements {
  private readonly announcedKinds = new Set<EnemyKind>();
  private readonly announcedBossWaves = new Set<number>();

  /** Показать тост для каждого ещё не объявленного вида. */
  announce(queue: EnemyKind[], sink: ToastSink, wave: number): void {
    for (const kind of queue) {
      // Босс — событие каждой 10-й волны, поэтому объявляем его заново,
      // но только один раз на волну (announce вызывается каждый кадр).
      if (kind === EnemyKind.Boss) {
        if (this.announcedBossWaves.has(wave)) continue;
        this.announcedBossWaves.add(wave);
      } else if (this.announcedKinds.has(kind)) {
        continue;
      }
      this.announcedKinds.add(kind);
      sink.onToast?.({ text: t(TOAST_KEY[kind]), color: C.rift });
    }
  }

  /** Сбросить историю объявлений (новый забег). */
  clear(): void {
    this.announcedKinds.clear();
    this.announcedBossWaves.clear();
  }
}
