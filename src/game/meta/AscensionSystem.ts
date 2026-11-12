/**
 * AscensionSystem — выбранный уровень угрозы.
 *
 * Уровень постоянный: он меняет каждый следующий забег, пока игрок его не
 * сменит. Мир читает множители через геттеры живыми, поэтому смена уровня
 * в меню действует со следующего старта.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { loadThreatLevel, saveThreatLevel } from "./MetaStorage";
import { clampThreatLevel, threatLevelDef, type ThreatLevelDef } from "./ascension";

export class AscensionSystem {
  private threatLevel: number;

  constructor(level: number = 0) {
    this.threatLevel = clampThreatLevel(level);
  }

  /** Загрузить уровень из хранилища. */
  static load(storage: PersistencePort): AscensionSystem {
    return new AscensionSystem(loadThreatLevel(storage));
  }

  get level(): number {
    return this.threatLevel;
  }

  get definition(): ThreatLevelDef {
    return threatLevelDef(this.threatLevel);
  }

  get hpMult(): number {
    return this.definition.hpMult;
  }

  get damageMult(): number {
    return this.definition.damageMult;
  }

  get creditsMult(): number {
    return this.definition.creditsMult;
  }

  /** Сменить уровень и сохранить выбор. */
  setLevel(level: number, storage: PersistencePort): void {
    this.threatLevel = clampThreatLevel(level);
    saveThreatLevel(storage, this.threatLevel);
  }
}
