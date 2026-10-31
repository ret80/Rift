/**
 * SystemSchedule — явный порядок ECS-систем по фазам кадра.
 *
 * Каждая система объявляет свою фазу (Phase) вместо произвольного числа
 * приоритета. Фазы задают крупный порядок, а внутри фазы системы идут в
 * порядке регистрации в SystemSchedule. Это убирает зависимость от
 * случайного порядка строк в конструкторе GameContext.
 */

import { System } from "@trixt0r/ecs";

/** Фазы кадра: от служебного обновления до пересборки HUD-слотов. */
export enum Phase {
  /** Скоринг, бонусы, щит, отсчёт, способности. */
  Upkeep = 0,
  /** Движение и состояние игрока. */
  Player = 100,
  /** Движение пикапов, частиц, колец и врагов. */
  Enemies = 200,
  /** Стрельба врагов и сбор пикапов. */
  EnemyActions = 300,
  /** Полёт снарядов и затухание лучей. */
  Projectiles = 400,
  /** Союзные дроны и разломы. */
  Allies = 500,
  /** Тик оружия игрока. */
  Weapons = 600,
  /** Шаг физического движка. */
  Physics = 700,
  /** Игровые последствия контактов. */
  Collisions = 800,
  /** Спавн волны. */
  Spawn = 900,
  /** Волна, зона и финальный кламп. */
  Wave = 1000,
  /** Финальный кламп врагов — после волны и зоны. */
  ZoneClamp = 1050,
  /** Пересборка слотов снаряжения для HUD. */
  Loadout = 1100,
  /** Резерв для презентационных систем вне engine.run. */
  Presentation = 1200,
}

/**
 * Базовая система с фазой.
 *
 * Приоритет выставляется из фазы, поэтому конструкторы систем больше не
 * содержат магических чисел. Точный порядок внутри фазы задаёт schedule.
 */
export abstract class PhasedSystem extends System {
  constructor(readonly phase: Phase) {
    super(phase);
  }
}

/** Куда schedule устанавливает системы (EcsWorld/EcsEngine). */
export interface SystemTarget {
  addSystem(system: System): void;
}

/**
 * Явный список систем кадра.
 *
 * `install` сортирует системы по фазе устойчивой сортировкой: системы с
 * одинаковой фазой сохраняют порядок добавления в schedule.
 */
export class SystemSchedule {
  private readonly systems: PhasedSystem[] = [];

  /** Добавить систему в порядке внутри её фазы. */
  add(system: PhasedSystem): void {
    this.systems.push(system);
  }

  /** Установить все системы в мир в порядке фаз. */
  install(target: SystemTarget): void {
    const ordered = [...this.systems].sort((a, b) => a.phase - b.phase);
    for (const system of ordered) target.addSystem(system);
  }
}
