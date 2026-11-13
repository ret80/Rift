/**
 * WorldPorts — узкие контракты между DOM-free игровым миром и хостом.
 *
 * `GameWorld` не знает ни о `AudioManager`, ни о `Fx`, ни о React-хуках:
 * он видит только эти порты. `AudioManager` и `Fx` реализуют их
 * структурно, поэтому adapter-классы не нужны; для headless-прогонов
 * есть `NullAudio`/`NullFx`.
 */

import type { PickupKind } from "../balance";
import type { DoctrineOffer } from "../meta/doctrines";
import type { Particle } from "../types/world";
import type { BannerData, StatsData, ToastData } from "../types/ui";
import type { PersistencePort } from "./PersistencePort";

/** Сечение камеры/вьюпорта, из которого мир строит окружение пояса. */
export interface WorldView {
  width: number;
  height: number;
  cameraX: number;
  cameraY: number;
  zoom: number;
}

/** Порт звука: только методы, которые реально вызывают геймплейные системы. */
export interface AudioPort {
  playShoot(): void;
  playEnemyShoot(): void;
  playHeavyShoot(): void;
  playPickupSound(kind: PickupKind): void;
  playExplosion(size?: number): void;
  playPlayerHit(): void;
  playZoneWarning(): void;
  playDroneShot(): void;
  playDroneHit(): void;
  playRiftOpen(): void;
  playRiftClose(): void;
  playRiftSpawn(): void;
  playComboUp(mult: number): void;
  setCombat(active: boolean): void;
  setCombatWave(wave: number): void;
  setSuspended(suspended: boolean): void;
}

/** Порт эффектов: частицы, кольца, тряска камеры. */
export interface FxPort {
  burst(x: number, y: number, n: number, hex: string, speed: number, life: number): void;
  ring(x: number, y: number, r0: number, vr: number, life: number, hex: string): void;
  addShake(v: number): void;
  emit(p: Particle): void;
  reset(): void;
}

/**
 * Счётчик обратного отсчёта без текста.
 *
 * Мир не знает языка: он отдаёт номер волны и цифру, а хост подставляет
 * локализованную подпись (`game.waveN`).
 */
export interface CountdownState {
  id: number;
  wave: number;
  value: string;
}

/** Игровые события, которые хост превращает в UI/аудио-реакции. */
export interface GameplayHooks {
  onBanner(banner: BannerData | null): void;
  onToast(toast: ToastData | null): void;
  onCountdown(count: CountdownState | null): void;
  onGameOver(): void;
  onStats(stats: StatsData): void;
  /** Тестовая волна завершена (зачистка или смерть). */
  onTestRunEnd?(reason: "cleared" | "died"): void;
  /** Волна зачищена — хост открывает ангар между волнами. */
  onWaveCleared?(wave: number): void;
  /**
   * Награда за босс-волну: показать выбор доктрины (null — выбор закрыт).
   *
   * Пока предложение живо, мир стоит: отсчёт следующей волны ждёт выбора.
   */
  onDoctrineOffer?(offer: DoctrineOffer | null): void;
}

/** Полный набор портов мира. */
export interface WorldPorts {
  audio: AudioPort;
  /** Порт эффектов; по умолчанию мир создаёт свой `Fx` с seeded-потоком. */
  fx?: FxPort;
  hooks: GameplayHooks;
  storage: PersistencePort;
}

/** Пустой звук для headless-прогонов. */
export class NullAudio implements AudioPort {
  playShoot(): void {}
  playEnemyShoot(): void {}
  playHeavyShoot(): void {}
  playPickupSound(_kind: PickupKind): void {}
  playExplosion(_size?: number): void {}
  playPlayerHit(): void {}
  playZoneWarning(): void {}
  playDroneShot(): void {}
  playDroneHit(): void {}
  playRiftOpen(): void {}
  playRiftClose(): void {}
  playRiftSpawn(): void {}
  playComboUp(_mult: number): void {}
  setCombat(_active: boolean): void {}
  setCombatWave(_wave: number): void {}
  setSuspended(_suspended: boolean): void {}
}

/** Пустые эффекты для headless-прогонов. */
export class NullFx implements FxPort {
  burst(): void {}
  ring(): void {}
  addShake(): void {}
  emit(): void {}
  reset(): void {}
}

/** Порты по умолчанию: без звука, без эффектов, без хуков. */
export function nullPorts(storage: PersistencePort): WorldPorts {
  return {
    audio: new NullAudio(),
    fx: new NullFx(),
    hooks: {
      onBanner: () => {},
      onToast: () => {},
      onCountdown: () => {},
      onGameOver: () => {},
      onStats: () => {},
    },
    storage,
  };
}

/** Начальное сечение мира (используется до первого `setView`). */
export const DEFAULT_WORLD_VIEW: WorldView = {
  width: 1920,
  height: 1080,
  cameraX: 0,
  cameraY: 0,
  zoom: 1,
};
