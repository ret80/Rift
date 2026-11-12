/**
 * DoctrineSystem — выбранная доктрина забега.
 *
 * Хранит только id выбора; бонусы выводятся из `DOCTRINES`. Выбор
 * сохраняется сразу, чтобы следующий забег начался с той же доктриной.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { loadSelectedDoctrine, saveSelectedDoctrine } from "./MetaStorage";
import { DOCTRINES, doctrineById, type Doctrine } from "./doctrines";
import { mergeMetaBonuses, noMetaBonuses, type MetaBonuses } from "./types";

export class DoctrineSystem {
  private selectedId: string | null;

  constructor(selectedId: string | null = null) {
    this.selectedId = doctrineById(selectedId) ? selectedId : null;
  }

  /** Загрузить выбор из хранилища. */
  static load(storage: PersistencePort): DoctrineSystem {
    return new DoctrineSystem(loadSelectedDoctrine(storage));
  }

  get selected(): Doctrine | null {
    return doctrineById(this.selectedId);
  }

  get id(): string | null {
    return this.selectedId;
  }

  /** Сохранить выбор: null — играть без доктрины. */
  select(id: string | null, storage: PersistencePort): void {
    this.selectedId = doctrineById(id) ? id : null;
    saveSelectedDoctrine(storage, this.selectedId);
  }

  /** Бонусы выбранной доктрины поверх нейтральных. */
  bonuses(): MetaBonuses {
    return mergeMetaBonuses(noMetaBonuses(), this.selected?.effect ?? {});
  }
}

export { DOCTRINES };
