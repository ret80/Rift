/**
 * AbilitySystem — владелец активных способностей игрока.
 *
 * Построен по образцу WeaponManager (src/game/weapons/WeaponManager.ts):
 *   • хранит экземпляры всех способностей и тикает их кулдауны;
 *   • выдаёт способность по подбору пикапа (grant);
 *   • активирует способность по нажатию клавиши (Space);
 *   • отдаёт слоты способностей для строки снаряжения HUD.
 *
 * Система ничего не знает о пулах игры: живые данные приходят
 * через AbilityWorld — набор провайдеров и колбэков.
 */

import type { LoadoutSlotData } from "../loadout/LoadoutTypes";
import type { Enemy } from "../types";
import type { AbilityContext, AbilityId } from "./Ability";
import { createAbilityRegistry, type AbilityRegistryData } from "./AbilityRegistry";
import type { InputManager } from "../input";

/** Клавиша активации способности. */
const ABILITY_KEY = "Space";

/** Провайдеры живых данных игрового мира для способностей. */
export interface AbilityWorld {
  /** Текущая позиция корабля. */
  getPlayerX(): number;
  getPlayerY(): number;
  /** Переместить корабль в точку (сброс скорости обрабатывает игрок). */
  movePlayerTo(x: number, y: number): void;
  /** Живые враги. */
  getEnemies(): readonly Enemy[];
  /** Убить врага — начислить очки и выбросить дроп. */
  killEnemy(enemy: Enemy): void;
}

export class AbilitySystem {
  private abilities: AbilityRegistryData;
  private world: AbilityWorld;
  private input: InputManager;
  /** Источник эффектов — передаётся способности в контекст активации. */
  private fx: AbilityContext["fx"];

  constructor(
    input: InputManager,
    world: AbilityWorld,
    fx: AbilityContext["fx"]
  ) {
    this.input = input;
    this.world = world;
    this.fx = fx;
    this.abilities = createAbilityRegistry();
  }

  /** Тик: кулдауны способностей и активация по клавише. */
  update(dt: number): void {
    for (const ability of Object.values(this.abilities)) {
      ability.update(dt);
    }

    if (!this.input.consumePress(ABILITY_KEY)) return;
    for (const ability of Object.values(this.abilities)) {
      if (ability.isAvailable() && ability.activate(this.buildContext())) break;
    }
  }

  /** Выдать способность — подбор пикапа. */
  grant(id: AbilityId): void {
    this.abilities[id]?.grant();
  }

  /** Сброс всех способностей — начало забега. */
  reset(): void {
    for (const ability of Object.values(this.abilities)) {
      ability.reset();
    }
  }

  /** Слоты выданных способностей для строки снаряжения. */
  getSlots(): LoadoutSlotData[] {
    const slots: LoadoutSlotData[] = [];
    for (const ability of Object.values(this.abilities)) {
      if (!ability.isAvailable()) continue;
      const slot = ability.getSlot();
      slots.push({
        kind: slot.id,
        meta: slot.meta,
        progress: slot.progress,
        remaining: slot.remaining,
      });
    }
    return slots;
  }

  /** Собрать контекст активации из живых данных мира. */
  private buildContext(): AbilityContext {
    return {
      playerX: this.world.getPlayerX(),
      playerY: this.world.getPlayerY(),
      enemies: this.world.getEnemies(),
      movePlayerTo: (x, y) => this.world.movePlayerTo(x, y),
      killEnemy: (e) => this.world.killEnemy(e),
      fx: this.fx,
    };
  }
}
