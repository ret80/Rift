/**
 * DroneSwarm — координатор стайного поведения дронов.
 *
 * Дроны летают группами по кольцу внутри зоны: одна группа по часовой,
 * другая против. Группа сама решает, когда отпустить 1–2 дронов на атаку;
 * после промаха дрон возвращается в ближайшую группу.
 *
 * Координатор хранит только групповое состояние и маркеры намерений в
 * EnemyComponent. Движение выполняет DroneStrategy, поэтому физика, avoidance
 * и интегрирование позиции остаются в общем конвейере EnemySystem.
 */

import { EnemyKind } from "../balance";
import type { EnemyRef } from "../ecs";
import type { GameContext } from "./GameContext";

/** Максимум дронов в одной группе. */
const MAX_GROUP_SIZE = 20;
/** Максимум групп: 100 дронов → 6 групп. */
const MAX_GROUPS = 6;
/** Зазор между корпусами соседей в строю, px. */
const SLOT_GAP = 10;
/** Полуразнос дорожек строя, px. */
const SLOT_LANE_OFFSET = 12;
/** Радиус патруля — доля радиуса зоны. */
const PATROL_RADIUS_R = 0.55;
const PATROL_RADIUS_MIN = 180;
const PATROL_RADIUS_MAX = 420;
/** Угловая скорость патруля, рад/с. */
const PATROL_OMEGA = 0.4;
/** Дальность отделения: не меньше 220 px и не меньше 0.35R. */
const DETACH_MIN_RANGE = 220;
const DETACH_RANGE_R = 0.35;
/** Время атаки отделившегося дрона до возврата, секунды. */
const DETACH_TIME = 1.6;
/** Дальше этого от игрока дрон прекращает погоню, px. */
const DETACH_LEASH = 520;
/** Пауза группы между отделениями, секунды. */
const DETACH_COOLDOWN_MIN = 4;
const DETACH_COOLDOWN_MAX = 6;

interface DroneGroup {
  id: number;
  /** +1 — по часовой, −1 — против. */
  dir: 1 | -1;
  /** Текущий угол якоря группы, радианы. */
  phase: number;
  /** Живые участники (объектная идентичность стабильна). */
  members: Set<EnemyRef>;
  /** Занятые слоты строя. */
  slots: Set<number>;
  /** Секунды до следующего отделения. */
  cooldown: number;
}

export interface SwarmTarget {
  x: number;
  y: number;
  /** Желаемая скорость вдоль кольца. */
  vx: number;
  vy: number;
}

export class DroneSwarm {
  private groups = new Map<number, DroneGroup>();
  private nextId = 0;

  /** Полный сброс (новый забег). */
  clear(): void {
    this.groups.clear();
    this.nextId = 0;
  }

  /** Обновить группы перед AI-проходом. */
  update(enemies: EnemyRef[], context: GameContext, dt: number): void {
    const drones: EnemyRef[] = [];
    for (const e of enemies) {
      if (
        e.marker.dead ||
        e.marker.kind !== EnemyKind.Drone ||
        e.marker.droneState === "orbiting"
      ) {
        continue;
      }
      drones.push(e);
    }

    this.dropMembers();
    if (drones.length === 0) return;

    this.ensureGroups(drones.length);
    this.assignMembers(drones);
    this.updateGroups(dt);
    this.detachAttackers(drones, context);
    this.updateAttackers(drones, context, dt);
  }

  /**
   * Точка строя для дрона. false — дрон не в группе (нужен fallback).
   */
  formationTarget(enemy: EnemyRef, context: GameContext, out: SwarmTarget): boolean {
    const marker = enemy.marker;
    const group = this.groups.get(marker.swarmGroupId);
    if (!group) return false;

    const radius = this.patrolRadius(context);
    const count = Math.max(1, group.members.size);
    const center = (count - 1) / 2;
    // Шаг считаем по дуге: соседние корпуса не должны попадать в зону
    // avoidance даже на минимальном радиусе патруля.
    const slotArc = enemy.radius.r * 2 + SLOT_GAP;
    const slotOffset = (marker.swarmSlot - center) * (slotArc / radius);
    const angle = group.phase + group.dir * slotOffset;
    const lane = marker.swarmSlot % 2 === 0 ? -1 : 1;
    const radial = radius + lane * SLOT_LANE_OFFSET;

    out.x = context.zoneX + Math.cos(angle) * radial;
    out.y = context.zoneY + Math.sin(angle) * radial;
    // Скорость вдоль кольца: дрон не догоняет слот на полном ходу и не
    // проскакивает его, из-за чего рой раньше дёргался на месте.
    const tangentSpeed = PATROL_OMEGA * radial;
    out.vx = -Math.sin(angle) * group.dir * tangentSpeed;
    out.vy = Math.cos(angle) * group.dir * tangentSpeed;
    return true;
  }

  /** Направление группы (для отладки/визуала). */
  directionOf(groupId: number): 1 | -1 | 0 {
    return this.groups.get(groupId)?.dir ?? 0;
  }

  /** Число живых групп. */
  get groupCount(): number {
    return this.groups.size;
  }

  /** Направления групп для debug-оверлея: `0:CW 1:CCW`. */
  get directions(): string {
    return Array.from(this.groups.values())
      .map((group) => `${group.id}:${group.dir > 0 ? "CW" : "CCW"}`)
      .join(" ");
  }

  /** Сколько дронов сейчас в атаке. */
  detachedCount(enemies: EnemyRef[]): number {
    let n = 0;
    for (const e of enemies) {
      if (e.marker.kind === EnemyKind.Drone && e.marker.swarmState === "detached") n++;
    }
    return n;
  }

  // ============================== internal ==============================

  private patrolRadius(context: GameContext): number {
    return Math.max(
      PATROL_RADIUS_MIN,
      Math.min(PATROL_RADIUS_MAX, context.zoneRadius * PATROL_RADIUS_R),
    );
  }

  private ensureGroups(count: number): void {
    const desired = Math.max(2, Math.min(MAX_GROUPS, 2 * Math.ceil(count / 16)));
    while (this.groups.size < desired) {
      this.createGroup();
    }
    // Лишние пустые группы убираем, но минимум две оставляем.
    if (this.groups.size > desired) {
      for (const [id, group] of this.groups) {
        if (this.groups.size <= desired) break;
        if (group.members.size === 0) this.groups.delete(id);
      }
    }
  }

  private createGroup(): DroneGroup {
    const index = this.groups.size;
    const group: DroneGroup = {
      id: this.nextId++,
      dir: index % 2 === 0 ? 1 : -1,
      phase: (index * Math.PI) / 2,
      members: new Set(),
      slots: new Set(),
      cooldown: 0,
    };
    this.groups.set(group.id, group);
    return group;
  }

  private dropMembers(): void {
    for (const [id, group] of this.groups) {
      let removed = false;
      for (const member of Array.from(group.members)) {
        if (member.marker.dead || member.marker.swarmGroupId !== id) {
          group.members.delete(member);
          removed = true;
        }
      }
      if (removed) this.compactSlots(group);
      if (group.members.size === 0 && this.groups.size > 2) {
        this.groups.delete(id);
      }
    }
  }

  /** После потерь слоты сжимаются: строй не растягивается дырами. */
  private compactSlots(group: DroneGroup): void {
    group.slots.clear();
    let slot = 0;
    for (const member of group.members) {
      member.marker.swarmSlot = slot;
      group.slots.add(slot);
      slot++;
    }
  }

  private assignMembers(drones: EnemyRef[]): void {
    for (const drone of drones) {
      const current = this.groups.get(drone.marker.swarmGroupId);
      if (current && current.members.has(drone)) continue;

      let target: DroneGroup | null = null;
      for (const group of this.groups.values()) {
        if (group.members.size >= MAX_GROUP_SIZE) continue;
        if (!target || group.members.size < target.members.size) target = group;
      }
      if (!target) target = this.createGroup();

      target.members.add(drone);
      const slot = this.firstFreeSlot(target);
      target.slots.add(slot);
      drone.marker.swarmGroupId = target.id;
      drone.marker.swarmSlot = slot;
      if (drone.marker.swarmState !== "returning") {
        drone.marker.swarmState = "formation";
      }
    }
  }

  private firstFreeSlot(group: DroneGroup): number {
    let slot = 0;
    while (group.slots.has(slot)) slot++;
    return slot;
  }

  private updateGroups(dt: number): void {
    for (const group of this.groups.values()) {
      group.phase += group.dir * PATROL_OMEGA * dt;
      group.cooldown = Math.max(0, group.cooldown - dt);
    }
  }

  private detachAttackers(drones: EnemyRef[], context: GameContext): void {
    const radius = this.patrolRadius(context);
    const range = Math.max(DETACH_MIN_RANGE, context.zoneRadius * DETACH_RANGE_R);

    for (const group of this.groups.values()) {
      if (group.cooldown > 0) continue;
      const anchorX = context.zoneX + Math.cos(group.phase) * radius;
      const anchorY = context.zoneY + Math.sin(group.phase) * radius;
      if (Math.hypot(anchorX - context.playerX, anchorY - context.playerY) > range) continue;

      const ready = Array.from(group.members).filter(
        (m) => !m.marker.dead && m.marker.swarmState === "formation",
      );
      if (ready.length < 4) continue;

      ready.sort(
        (a, b) =>
          Math.hypot(a.position.x - context.playerX, a.position.y - context.playerY) -
          Math.hypot(b.position.x - context.playerX, b.position.y - context.playerY),
      );
      const count = Math.random() < 0.3 ? 2 : 1;
      for (let i = 0; i < count && i < ready.length; i++) {
        const drone = ready[i];
        drone.marker.swarmState = "detached";
        drone.marker.detachT = DETACH_TIME;
      }
      group.cooldown = DETACH_COOLDOWN_MIN + Math.random() * (DETACH_COOLDOWN_MAX - DETACH_COOLDOWN_MIN);
    }
  }

  private updateAttackers(drones: EnemyRef[], context: GameContext, dt: number): void {
    for (const drone of drones) {
      const marker = drone.marker;
      if (marker.swarmState === "formation") continue;

      if (marker.swarmState === "detached") {
        marker.detachT -= dt;
        const dx = context.playerX - drone.position.x;
        const dy = context.playerY - drone.position.y;
        const dist = Math.hypot(dx, dy) || 1;
        const closing = dx * drone.velocity.vx + dy * drone.velocity.vy;
        const missed = closing < 0 && dist > 80;
        if (marker.detachT <= 0 || dist > DETACH_LEASH || missed) {
          this.returnToGroup(drone, context);
        }
        continue;
      }

      if (marker.swarmState === "returning") {
        const target = { x: 0, y: 0, vx: 0, vy: 0 };
        if (this.formationTarget(drone, context, target)) {
          const dist = Math.hypot(target.x - drone.position.x, target.y - drone.position.y);
          if (dist < 40) marker.swarmState = "formation";
        }
      }
    }
  }

  private returnToGroup(drone: EnemyRef, context: GameContext): void {
    const radius = this.patrolRadius(context);
    let best: DroneGroup | null = null;
    let bestDist = Infinity;
    for (const group of this.groups.values()) {
      if (group.members.size >= MAX_GROUP_SIZE) continue;
      // Близость считаем по якорю группы, а не по случайному первому
      // участнику: иначе дрон может уйти в дальнюю группу.
      const anchorX = context.zoneX + Math.cos(group.phase) * radius;
      const anchorY = context.zoneY + Math.sin(group.phase) * radius;
      const d = Math.hypot(drone.position.x - anchorX, drone.position.y - anchorY);
      if (d < bestDist) {
        bestDist = d;
        best = group;
      }
    }
    if (!best) best = this.groups.values().next().value ?? this.createGroup();

    if (!best.members.has(drone)) {
      // Убираем из прежней группы, если уходим в другую.
      const previous = this.groups.get(drone.marker.swarmGroupId);
      if (previous && previous !== best) {
        previous.members.delete(drone);
        this.compactSlots(previous);
      }
      best.members.add(drone);
      const slot = this.firstFreeSlot(best);
      best.slots.add(slot);
      drone.marker.swarmGroupId = best.id;
      drone.marker.swarmSlot = slot;
    }
    drone.marker.swarmState = "returning";
  }
}
