/**
 * EnemyKind — виды врагов.
 *
 * Вынесено из enemies.ts отдельным модулем: DTO параметров строится по
 * видам врагов, и без этого файла получился бы цикл импортов
 * params ↔ enemies.
 */

export enum EnemyKind {
  Drone = "drone",
  Hunter = "hunter",
  Fighter = "fighter",
  Cruiser = "cruiser",
  Carrier = "carrier",
  Miner = "miner",
  /** Босс: арена-событие каждые 10 волн, не входит в случайные веса. */
  Boss = "boss",
  /** Мина минёра: не входит в состав волны, спавнится только стратегией. */
  Mine = "mine",
  /** Снайпер: заряжает луч. */
  Needle = "needle",
  /** Щитоносец: аура −40%. */
  Shieldbearer = "shieldbearer",
  /** Гарпунёр: tether. */
  Harpooner = "harpooner",
  /** Делитель: делится при смерти. */
  Splitter = "splitter",
  /** Глушилка: зона отключения автонаведения. */
  Jammer = "jammer",
  /** Вихрь: вращающийся лазер. */
  Vortex = "vortex",
  /** Мать-улей: рой + босс-фаза. */
  HiveMother = "hivemother",
  /** Тягач: держит край зоны, притягивает астероид и запускает его в игрока. */
  Tractor = "tractor",
}

export const ENEMY_KIND_COUNT = Object.keys(EnemyKind).length;

/**
 * Все виды врагов в порядке объявления.
 *
 * Единственный список для переключателей и тестовых волн: новый вид
 * попадает сюда автоматически вместе с enum, без правок UI.
 */
export const ALL_ENEMY_KINDS: readonly EnemyKind[] = Object.values(EnemyKind);

/** Проверить, что строка — известный вид врага (для сценариев/URL). */
export function isEnemyKind(value: unknown): value is EnemyKind {
  return typeof value === "string" && (Object.values(EnemyKind) as string[]).includes(value);
}
