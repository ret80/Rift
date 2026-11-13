/**
 * MetaTree — Эхо Разлома: модель мета-талантов.
 *
 * Держит только уровни талантов; кредиты — отдельный счётчик (см.
 * `MetaStorage`). Модель не знает про UI: экран читает уровни и вызывает
 * `purchase`, получая новый баланс кредитов.
 */

import type { MetaBonuses, MetaTalent, MetaTreeState } from "./types";
import { noMetaBonuses } from "./types";
import { META_TALENTS } from "./metaTalents";
import type { PersistencePort } from "../core/PersistencePort";
import { loadMetaTree, saveMetaTree } from "./MetaStorage";

export class MetaTree {
  private state: MetaTreeState;

  constructor(state: MetaTreeState = { talents: {} }) {
    this.state = { talents: { ...state.talents } };
  }

  /** Загрузить дерево из хранилища. */
  static load(storage: PersistencePort): MetaTree {
    return new MetaTree(loadMetaTree(storage));
  }

  /** Сохранить дерево в хранилище. */
  save(storage: PersistencePort): void {
    saveMetaTree(storage, this.state);
  }

  getState(): MetaTreeState {
    return this.state;
  }

  /** Уровень таланта (0 — не куплен). */
  getLevel(talentId: string): number {
    return this.state.talents[talentId] ?? 0;
  }

  /** Стоимость следующего уровня или null, если талант прокачан. */
  nextCost(talent: MetaTalent): number | null {
    const level = this.getLevel(talent.id);
    if (level >= talent.maxLevel) return null;
    return talent.costs[level] ?? null;
  }

  /** Предок куплен хотя бы на один уровень. */
  prerequisiteMet(talent: MetaTalent): boolean {
    if (!talent.prerequisite) return true;
    return this.getLevel(talent.prerequisite) > 0;
  }

  /**
   * Купить следующий уровень таланта.
   * Возвращает остаток кредитов или null, если покупка невозможна.
   */
  purchase(talent: MetaTalent, credits: number): number | null {
    if (!this.prerequisiteMet(talent)) return null;
    const cost = this.nextCost(talent);
    if (cost === null || credits < cost) return null;
    const level = this.getLevel(talent.id);
    this.state.talents[talent.id] = level + 1;
    return credits - cost;
  }

  /** Суммарные бонусы всех купленных талантов. */
  bonuses(): MetaBonuses {
    const result = noMetaBonuses();
    for (const talent of META_TALENTS) {
      const level = this.getLevel(talent.id);
      if (level <= 0) continue;
      const effect = talent.effect(level);
      result.hpMult *= effect.hpMult ?? 1;
      result.speedMult *= effect.speedMult ?? 1;
      result.fireRateMult *= effect.fireRateMult ?? 1;
      result.partsMult *= effect.partsMult ?? 1;
      result.creditsMult *= effect.creditsMult ?? 1;
      result.weaponSlots += effect.weaponSlots ?? 0;
      result.droneSlots += effect.droneSlots ?? 0;
      result.shieldBlockLevel += effect.shieldBlockLevel ?? 0;
      result.shieldRegenLevel += effect.shieldRegenLevel ?? 0;
    }
    return result;
  }
}
