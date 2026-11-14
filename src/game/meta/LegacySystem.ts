/**
 * LegacySystem — артефакт Наследия, выданный в текущем забеге.
 *
 * Хранит только id. Забег создаёт систему пустой и выдаёт артефакт сам
 * после первой зачищенной волны, поэтому в мету ничего не пишется:
 * новый забег всегда начинается без наследия.
 */

import { artifactById, type LegacyArtifact } from "./legacy";
import { mergeMetaBonuses, noMetaBonuses, type MetaBonuses } from "./types";

export class LegacySystem {
  private selectedId: string | null;

  constructor(selectedId: string | null = null) {
    this.selectedId = artifactById(selectedId)?.id ?? null;
  }

  get selected(): LegacyArtifact | null {
    return artifactById(this.selectedId);
  }

  get id(): string | null {
    return this.selectedId;
  }

  /** Выдать артефакт за зачистку волны; неизвестный id игнорируется. */
  award(id: string | null): void {
    this.selectedId = artifactById(id)?.id ?? null;
  }

  /** Забыть артефакт: новый забег начинается без наследия. */
  clear(): void {
    this.selectedId = null;
  }

  /** Бонусы выданного артефакта поверх нейтральных. */
  bonuses(): MetaBonuses {
    return mergeMetaBonuses(noMetaBonuses(), this.selected?.effect ?? {});
  }
}

export { LEGACY_ARTIFACTS } from "./legacy";
