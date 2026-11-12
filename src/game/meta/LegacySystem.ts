/**
 * LegacySystem — выбранный артефакт наследия.
 *
 * Хранит только id выбора. Артефакт обязан быть открыт лучшей волной:
 * если прогресс сбросили, выбор перестаёт действовать без отдельной чистки.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { loadBestWave } from "../upgrades";
import { loadSelectedArtifact, saveSelectedArtifact } from "./MetaStorage";
import {
  LEGACY_ARTIFACTS,
  artifactById,
  isArtifactUnlocked,
  type LegacyArtifact,
} from "./legacy";
import { mergeMetaBonuses, noMetaBonuses, type MetaBonuses } from "./types";

export class LegacySystem {
  private selectedId: string | null;

  constructor(selectedId: string | null = null, bestWave = 1) {
    const artifact = artifactById(selectedId);
    this.selectedId =
      artifact && isArtifactUnlocked(artifact, bestWave) ? artifact.id : null;
  }

  /** Загрузить выбор; закрытый артефакт игнорируется. */
  static load(storage: PersistencePort): LegacySystem {
    return new LegacySystem(loadSelectedArtifact(storage), loadBestWave(storage));
  }

  get selected(): LegacyArtifact | null {
    return artifactById(this.selectedId);
  }

  get id(): string | null {
    return this.selectedId;
  }

  /** Выбрать артефакт: null — без наследия, закрытый id игнорируется. */
  select(id: string | null, storage: PersistencePort): void {
    const artifact = artifactById(id);
    const unlocked = artifact !== null
      && isArtifactUnlocked(artifact, loadBestWave(storage));
    this.selectedId = unlocked ? artifact.id : null;
    saveSelectedArtifact(storage, this.selectedId);
  }

  /** Бонусы выбранного артефакта поверх нейтральных. */
  bonuses(): MetaBonuses {
    return mergeMetaBonuses(noMetaBonuses(), this.selected?.effect ?? {});
  }
}

export { LEGACY_ARTIFACTS };
