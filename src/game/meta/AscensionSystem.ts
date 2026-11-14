/**
 * AscensionSystem — выбранный набор модификаторов Асценсии.
 *
 * Выбор постоянный: он меняет каждый следующий забег, пока игрок его не
 * сменит. Мир читает эффекты при старте забега, поэтому смена набора в меню
 * действует со следующего старта.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { loadAscensionSelection, saveAscensionSelection } from "./MetaStorage";
import {
  ascensionEffects,
  canAddModifier,
  hasModifier,
  normalizeSelection,
  threatLevelOf,
  type AscensionModifierId,
  type AscensionSelection,
} from "./ascension";
import type { AscensionParams } from "../balance/params/GameParams";

export class AscensionSystem {
  private selection: AscensionModifierId[];

  constructor(ids: readonly unknown[] = []) {
    this.selection = normalizeSelection(ids);
  }

  /** Загрузить набор из хранилища. */
  static load(storage: PersistencePort): AscensionSystem {
    return new AscensionSystem(loadAscensionSelection(storage));
  }

  /** Выбранные модификаторы. */
  get selected(): AscensionSelection {
    return this.selection;
  }

  /** Уровень угрозы: сумма стоимостей выбранных модификаторов. */
  get level(): number {
    return threatLevelOf(this.selection);
  }

  /** Эффекты для мира и наград. */
  get effects(): AscensionParams {
    return ascensionEffects(this.selection);
  }

  get hpMult(): number {
    return this.effects.enemyHpMult;
  }

  get damageMult(): number {
    return this.effects.enemyDamageMult;
  }

  get creditsMult(): number {
    return this.effects.creditsMult;
  }

  get partsMult(): number {
    return this.effects.partsMult;
  }

  /** Включён ли модификатор. */
  has(id: AscensionModifierId): boolean {
    return hasModifier(this.selection, id);
  }

  /** Можно ли включить модификатор, не выходя за потолок. */
  canAdd(id: AscensionModifierId): boolean {
    return canAddModifier(this.selection, id);
  }

  /** Включить/выключить модификатор и сохранить набор. */
  toggle(id: AscensionModifierId, storage: PersistencePort): void {
    if (this.has(id)) {
      this.selection = this.selection.filter((entry) => entry !== id);
    } else if (this.canAdd(id)) {
      this.selection = [...this.selection, id];
    } else {
      return;
    }
    saveAscensionSelection(storage, this.selection);
  }

  /** Сбросить выбор — обычная сложность. */
  clear(storage: PersistencePort): void {
    this.selection = [];
    saveAscensionSelection(storage, this.selection);
  }
}
