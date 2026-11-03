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

import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
import type { LoadoutSlotData } from "../loadout/LoadoutTypes";
import type { EnemyRef } from "../ecs";
import type { EnemyDamagePort } from "../ecs/EnemyLifecycle";
import type { AbilityContext, AbilityId } from "./Ability";
import { createAbilityRegistry, type AbilityRegistryData } from "./AbilityRegistry";
import type { PlayerControls } from "../core/PlayerControls";

/** Провайдеры живых данных игрового мира для способностей. */
export interface AbilityWorld extends EnemyDamagePort {
  /** Текущая позиция корабля. */
  getPlayerX(): number;
  getPlayerY(): number;
  /** Переместить корабль в точку (сброс скорости обрабатывает игрок). */
  movePlayerTo(x: number, y: number): void;
  /** Живые враги. */
  getEnemies(): readonly EnemyRef[];
}

export class AbilitySystem extends PhasedSystem {
  private abilities: AbilityRegistryData;
  private world: AbilityWorld;
  /** Порт управления: клавиша Space или намерение агента. */
  private controls: PlayerControls;
  /** Источник эффектов — передаётся способности в контекст активации. */
  private fx: AbilityContext["fx"];
  /** Колбэк успешной активации (метрики/звук). */
  private activationHook: ((id: AbilityId) => void) | null;

  constructor(
    controls: PlayerControls,
    world: AbilityWorld,
    fx: AbilityContext["fx"],
    onActivated?: (id: AbilityId) => void,
  ) {
    super(Phase.Upkeep);
    this.controls = controls;
    this.world = world;
    this.fx = fx;
    this.activationHook = onActivated ?? null;
    this.abilities = createAbilityRegistry();
  }

  /** Тик: кулдауны способностей и активация по клавише. */
  process(dt: number): void {
    for (const ability of Object.values(this.abilities)) {
      ability.update(dt);
    }

    if (!this.controls.consumeAbility()) return;
    for (const ability of Object.values(this.abilities)) {
      if (ability.isAvailable() && ability.activate(this.buildContext())) {
        this.activationHook?.(ability.id);
        break;
      }
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
      damageEnemy: (e, dmg) => this.world.damageEnemy(e, dmg),
      fx: this.fx,
    };
  }
}
