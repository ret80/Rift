/**
 * Ability — единый контракт активных способностей игрока.
 *
 * Способность — это действие, которое игрок запускает нажатием клавиши
 * и которое имеет перезарядку. Она не живёт сама по себе: подбор пикапа
 * выдаёт способность, игрок активирует её, дальше она тикает кулдаун.
 *
 * Построено по образцу модуля оружия (src/game/weapons):
 *   • каждая способность — отдельный класс со своей логикой (SRP);
 *   • добавить способность — новый класс + запись в реестре (OCP);
 *   • способность не знает о других системах и получает всё,
 *     что ей нужно, через AbilityContext на момент активации.
 */

import type { LoadoutSlotMeta } from "../loadout/LoadoutTypes";
import type { EnemyRef } from "../ecs";
import type { EnemyDamagePort } from "../ecs/EnemyLifecycle";
import type { Fx } from "../fx";

/** Идентификаторы активных способностей. */
export type AbilityId = "quantum_swap";

/** Оформление слота способности в строке снаряжения. */
export type AbilityMeta = LoadoutSlotMeta;

/** Всё, что доступно способности в момент активации. */
export interface AbilityContext extends EnemyDamagePort {
  /** Текущая позиция корабля. */
  playerX: number;
  playerY: number;
  /** Живые враги — потенциальные цели способности. */
  enemies: readonly EnemyRef[];
  /** Переместить корабль в точку (со сбросом скорости). */
  movePlayerTo(x: number, y: number): void;
  /** Система эффектов — искры, вспышки. */
  fx: Fx;
}

/** Снимок слота способности для строки снаряжения. */
export interface AbilitySlotState {
  /** Вид способности. */
  id: AbilityId;
  /** Оформление слота. */
  meta: AbilityMeta;
  /** Заполнение кольца, 0..1 (готовность к активации). */
  progress: number;
  /** Остаток перезарядки в секундах (0 — способность готова). */
  remaining: number;
}

/** Единый контракт активных способностей. */
export interface Ability {
  /** Идентификатор вида способности. */
  readonly id: AbilityId;
  /** Оформление слота способности в строке снаряжения. */
  readonly meta: AbilityMeta;

  /** Сбросить состояние способности (начало забега). */
  reset(): void;

  /** Способность выдана игроку (подбор пикапа). */
  grant(): void;

  /** Способность доступна игроку прямо сейчас. */
  isAvailable(): boolean;

  /** Тик: перезарядка. */
  update(dt: number): void;

  /**
   * Попытаться активировать способность.
   * Возвращает true, если способность сработала.
   */
  activate(ctx: AbilityContext): boolean;

  /** Снимок слота для строки снаряжения. */
  getSlot(): AbilitySlotState;
}
