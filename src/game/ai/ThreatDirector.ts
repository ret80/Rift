/**
 * ThreatDirector — координатор одновременно атакующих врагов.
 *
 * До него угрозой было «сколько врагов на экране»: два десятка дронов, три
 * истребителя и крейсер могли атаковать в один момент, и урон превращался
 * в кашу, из которой игрок не мог вычитать приоритеты. Бой должен быть
 * читаемым: несколько дуэлей, а не толпа.
 *
 * Механика — «жетоны атаки»: раз в THREAT_DIRECTOR_INTERVAL секунд директор
 * выбирает ближайших к игроку врагов и выдаёт им право на активную атаку.
 * Лимиты по классам не дают одному виду занять весь бюджет, общий потолок
 * ограничивает число одновременных угроз.
 *
 * Враг без жетона не атакует: истребитель держит дистанцию и не открывает
 * огонь, хантер не идёт на таран, крейсер не разгоняется, рой не отделяет
 * дронов. Это и есть «очередь» — она читается по поведению.
 */

import { THREAT_CLASS_LIMITS, THREAT_DIRECTOR_INTERVAL, THREAT_MAX_ACTIVE } from "../balance";
import { EnemyKind } from "../balance";
import type { EnemyRef } from "../ecs";

/** Лимит жетонов для вида; виды без лимита не участвуют в очереди. */
function classLimit(kind: EnemyKind): number {
  switch (kind) {
    case EnemyKind.Hunter:
      return THREAT_CLASS_LIMITS.hunter;
    case EnemyKind.Fighter:
      return THREAT_CLASS_LIMITS.fighter;
    case EnemyKind.Cruiser:
      return THREAT_CLASS_LIMITS.cruiser;
    case EnemyKind.Drone:
      return THREAT_CLASS_LIMITS.drone;
    default:
      // Минёр, носитель, босс и мины не входят в очередь атакующих: у них
      // своя роль (пространство, рой, фазы, препятствие).
      return -1;
  }
}

export class ThreatDirector {
  /** Остаток до следующей пересборки жетонов, секунды. */
  private timer = 0;

  /** Сброс перед новой волной: жетоны выдаются заново. */
  reset(): void {
    this.timer = 0;
  }

  /**
   * Пересобрать жетоны, если подошло время.
   *
   * Вызывается один раз за кадр перед AI pass: стратегии читают результат
   * через `marker.attackAllowed`.
   */
  update(enemies: EnemyRef[], playerX: number, playerY: number, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = THREAT_DIRECTOR_INTERVAL;

    // Кандидаты — живые враги классов с лимитом, отсортированные по
    // дистанции до игрока. Сортировка стабильна по исходному порядку, поэтому
    // при равной дистанции выбор детерминирован.
    const candidates: Array<{ ref: EnemyRef; dist: number; order: number }> = [];
    for (let i = 0; i < enemies.length; i++) {
      const ref = enemies[i];
      if (ref.marker.dead) continue;
      if (classLimit(ref.marker.kind) < 0) continue;
      const dist = Math.hypot(ref.position.x - playerX, ref.position.y - playerY);
      candidates.push({ ref, dist, order: i });
    }
    candidates.sort((a, b) => a.dist - b.dist || a.order - b.order);

    const used: Partial<Record<EnemyKind, number>> = {};
    let active = 0;

    for (const candidate of candidates) {
      const kind = candidate.ref.marker.kind;
      const limit = classLimit(kind);
      const given = used[kind] ?? 0;
      const allowed = active < THREAT_MAX_ACTIVE && given < limit;
      candidate.ref.marker.attackAllowed = allowed;
      if (allowed) {
        used[kind] = given + 1;
        active++;
      }
    }
  }
}
