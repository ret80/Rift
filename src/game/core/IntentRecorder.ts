/**
 * IntentRecorder — запись человеческого забега для симулятора.
 *
 * Пишет `PlayerIntent` по тикам мира (60 Гц): `ReplayAgent` в headless-прогоне
 * отдаёт их обратно как есть, поэтому запись — готовый сценарий.
 *
 * Запись снимается в конце тика (`GameWorld.tick`): ось, прицел и огонь за тик
 * не меняются, а способность успевает сработать — она пишется по факту
 * срабатывания, иначе реплей активировал бы её повторно после перезарядки.
 *
 * Метаданные (seed, физика, стартовая волна, вьюпорт, апгрейды и арсенал)
 * снимаются на старте: без них сценарий воспроизводит другой забег. Ангар
 * дронов и положение камеры сценарий не описывает — реплей с дронами и
 * астероидами может расходиться (ограничение схемы симулятора).
 */

import type { PhysicsEngineId } from "../physics";
import type { WeaponId } from "../weapons/Weapon";
import type { PlayerControls, PlayerIntent } from "./PlayerControls";

/** Уровни линий оружия в арсенале на момент старта записи. */
export interface RecordingWeaponLevels {
  owned: boolean;
  reload: number;
  damage: number;
  accuracy: number;
}

/** Входные данные забега, без которых запись не воспроизводится. */
export interface RecordingMeta {
  /** Мастер-seed забега. */
  seed: number;
  /** Физический движок, на котором играли. */
  physics: PhysicsEngineId;
  /** Волна, с которой фактически начался забег. */
  startWave: number;
  /** Размер вьюпорта в CSS-пикселях. */
  viewport: { width: number; height: number };
  /** Персистентные апгрейды игрока. */
  upgrades: Record<string, number>;
  /** Купленные виды оружия и уровни их линий. */
  weapons: Partial<Record<WeaponId, RecordingWeaponLevels>>;
}

/** Снятая запись: метаданные старта и намерения по тикам. */
export interface RunRecording {
  meta: RecordingMeta;
  intents: PlayerIntent[];
}

export class IntentRecorder {
  private meta: RecordingMeta | null = null;
  private intents: PlayerIntent[] = [];
  private abilityUsed = false;

  /** Идёт ли запись. */
  get recording(): boolean {
    return this.meta !== null;
  }

  /** Начать запись с метаданными забега. */
  start(meta: RecordingMeta): void {
    this.meta = { ...meta };
    this.intents = [];
    this.abilityUsed = false;
  }

  /** Способность сработала в текущем тике (подписка на `ability_used`). */
  markAbilityUsed(): void {
    if (this.meta) this.abilityUsed = true;
  }

  /** Записать намерение текущего тика с живых контролов. */
  sample(controls: PlayerControls): void {
    if (!this.meta) return;
    this.intents.push({
      moveX: controls.axis.x,
      moveY: controls.axis.y,
      aimAngle: controls.aimAngle,
      firing: controls.firing,
      ability: this.abilityUsed,
    });
    this.abilityUsed = false;
  }

  /** Остановить запись и забрать её; null — записи не было. */
  stop(): RunRecording | null {
    if (!this.meta) return null;
    const recording: RunRecording = { meta: this.meta, intents: this.intents };
    this.cancel();
    return recording;
  }

  /** Прервать запись без сохранения (новый забег, выход в меню). */
  cancel(): void {
    this.meta = null;
    this.intents = [];
    this.abilityUsed = false;
  }
}
