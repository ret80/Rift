/**
 * EnemyRenderer — отрисовка врагов.
 * Извлечён из RendererSystem (drawEnemies).
 */

import {
  C,
  EnemyKind,
  JAMMER_RADIUS,
  SHIELDBEARER_AURA_RADIUS,
  TRACTOR_DETECT_RANGE,
  TRACTOR_TOW_DIST,
  VORTEX_RADIUS,
} from "../../balance";
import type { AffixId } from "../../balance/affixes";
import type { EnemyRef } from "../../ecs";
import { TAU, clamp, rgba } from "../../math";
import type { IRenderer, RGBA } from "../../render/index";
import { ENEMY_HULLS, enemyColor, type HullPoint } from "./EnemyHulls";
import { drawShipPoly } from "./ShipRenderer";

export interface EnemyRenderState {
  kind: EnemyKind;
  /** Элитный аффикс; null — обычный враг. */
  affix: AffixId | null;
  shieldHp: number;
  maxShieldHp: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  /** Угол лазерной руки Вихря / зафиксированный угол атаки. */
  lockAngle: number;
  /** Угол орудийной турели (Cruiser): стволы наведены отдельно от корпуса. */
  turretAngle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  telegraphActive: boolean;
  telegraphTimer: number;
  telegraphAngle: number;
  telegraphType: "line" | "cone" | "flash" | "arc";
  dead: boolean;
  /** Гарпунёр натянул трос. */
  tetherActive: boolean;
  droneState?: 'orbiting' | 'attacking' | 'none' | 'accumulating' | 'waiting';
  orbitRadius?: number;
  /** Враг взят игроком в лок: вокруг рисуется рамка. */
  locked: boolean;
  parent?: EnemyRenderState | null;
}

/**
 * Строит render-state из живых связок компонентов врагов.
 * Читает позицию/радиус/жизнь из базовых компонентов, остальное — из маркера.
 */
export function buildEnemyState(
  enemies: EnemyRef[],
  lockedTargetId: number | string | null = null,
): EnemyRenderState[] {
  return enemies.map((e) => ({
    locked: lockedTargetId !== null && e.marker.ecsId === lockedTargetId,
    kind: e.marker.kind,
    affix: e.marker.affix,
    shieldHp: e.marker.shieldHp,
    maxShieldHp: e.marker.maxShieldHp,
    x: e.position.x,
    y: e.position.y,
    vx: e.velocity.vx,
    vy: e.velocity.vy,
    angle: e.marker.angle,
    lockAngle: e.marker.lockAngle,
    turretAngle: e.marker.turretAngle,
    hp: e.life.remaining,
    maxHp: e.life.max,
    r: e.radius.r,
    speed: e.marker.speed,
    contact: e.marker.contact,
    score: e.marker.score,
    boltDmg: e.marker.boltDmg,
    fireCd: e.marker.fireCd,
    mode: e.marker.mode,
    modeT: e.marker.modeT,
    strafeDir: e.marker.strafeDir,
    seed: e.marker.seed,
    spawnCd: e.marker.spawnCd,
    flash: e.marker.flash,
    hitCd: e.marker.hitCd,
    telegraphActive: e.marker.telegraphActive,
    telegraphTimer: e.marker.telegraphTimer,
    telegraphAngle: e.marker.telegraphAngle,
    telegraphType: e.marker.telegraphType,
    dead: e.marker.dead,
    tetherActive: e.marker.tetherActive,
    droneState: e.marker.droneState,
    orbitRadius: e.marker.orbitRadius,
  }));
}

export function renderEnemies(
  R: IRenderer,
  enemies: EnemyRenderState[],
  _time: number
) {
  for (const e of enemies) {
    if (e.dead) continue;
    const base = enemyColor(e.kind);
    const flash = e.flash > 0 ? 1 : 0;
    const [r, g, b] = rgba(base, 1);
    const col: RGBA = [
      Math.min(1, r + flash * 0.6),
      Math.min(1, g + flash * 0.6),
      Math.min(1, b + flash * 0.6),
      1,
    ];
    switch (e.kind) {
      case EnemyKind.Drone: {
        // Атакующий дрон — яркий, орбитальный — тусклый
        let droneCol = col;
        if (e.droneState === 'attacking') {
          droneCol = [
            Math.min(1, col[0] + 0.4),
            Math.min(1, col[1] + 0.2),
            Math.min(1, col[2] + 0.2),
            col[3],
          ];
        }
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), droneCol);
        break;
      }
      case EnemyKind.Hunter: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(
          e.x + Math.cos(e.angle) * 5,
          e.y + Math.sin(e.angle) * 5,
          2,
          rgba(C.hunter, 0.95),
          8
        );
        R.pushLine(
          e.x + Math.cos(e.angle) * 16,
          e.y + Math.sin(e.angle) * 16,
          e.x + Math.cos(e.angle) * 24,
          e.y + Math.sin(e.angle) * 24,
          rgba(C.hunter, 0.45)
        );
        break;
      }
      case EnemyKind.Fighter: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        break;
      }
      case EnemyKind.Cruiser: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 8, rgba(base, 0.5), 16);
        // Орудийная турель: корпус смотрит по курсу, стволы наведены на цель.
        const fx = Math.cos(e.turretAngle);
        const fy = Math.sin(e.turretAngle);
        const gx = -fy * 8;
        const gy = fx * 8;
        for (const side of [1, -1]) {
          R.pushLine(
            e.x + fx * 4 + gx * side,
            e.y + fy * 4 + gy * side,
            e.x + fx * 22 + gx * side,
            e.y + fy * 22 + gy * side,
            rgba(base, 0.95)
          );
        }
        break;
      }
      case EnemyKind.Carrier: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 12, rgba(base, 0.4), 20);
        R.dashedCircle(e.x, e.y, 20, rgba(base, 0.3), 8, _time * 0.8);
        // Визуализация орбиты для дронов (всегда рисуется вокруг Carrier)
        R.dashedCircle(e.x, e.y, e.orbitRadius || 121, rgba(base, 0.15), 12, _time * 0.3);
        break;
      }
      case EnemyKind.Miner: {
        // Корпус-дрель: нос с буром, сзади контейнер с минами.
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.pushLine(
          e.x + Math.cos(e.angle) * 16,
          e.y + Math.sin(e.angle) * 16,
          e.x + Math.cos(e.angle) * 23,
          e.y + Math.sin(e.angle) * 23,
          rgba(C.mine, 0.9),
        );
        R.circle(e.x, e.y, 4, rgba(C.mine, 0.85), 10);
        break;
      }
      case EnemyKind.Boss: {
        // Босс: тяжёлый корпус, вращающиеся кольца и дуга прочности.
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 17, rgba(base, 0.55), 24);
        R.dashedCircle(e.x, e.y, 30 + e.mode * 4, rgba(base, 0.4), 10, _time * (0.7 + e.mode * 0.25));
        R.circle(e.x, e.y, 5 + e.mode * 1.5, rgba(C.white, 0.8), 12);
        // Дуга остатка прочности: читается без отдельного HUD-бара.
        const arc = clamp(e.hp / Math.max(1, e.maxHp), 0, 1) * TAU;
        const segments = Math.max(2, Math.round(36 * (arc / TAU)));
        const hr = e.r + 12;
        for (let i = 0; i < segments; i++) {
          const a0 = -Math.PI / 2 + (i / segments) * arc;
          const a1 = -Math.PI / 2 + ((i + 1) / segments) * arc;
          R.pushLine(
            e.x + Math.cos(a0) * hr,
            e.y + Math.sin(a0) * hr,
            e.x + Math.cos(a1) * hr,
            e.y + Math.sin(a1) * hr,
            rgba(base, 0.95),
          );
        }
        break;
      }
      case EnemyKind.Needle: {
        // Тонкий клин с иглой на носу.
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.pushLine(
          e.x + Math.cos(e.angle) * 15,
          e.y + Math.sin(e.angle) * 15,
          e.x + Math.cos(e.angle) * 26,
          e.y + Math.sin(e.angle) * 26,
          rgba(base, 0.85),
        );
        break;
      }
      case EnemyKind.Shieldbearer: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 6, rgba(base, 0.55), 14);
        R.dashedCircle(e.x, e.y, SHIELDBEARER_AURA_RADIUS, rgba(base, 0.16), 18, _time * 0.4);
        break;
      }
      case EnemyKind.Harpooner: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        if (e.tetherActive) {
          R.pushLine(
            e.x + Math.cos(e.angle) * 12,
            e.y + Math.sin(e.angle) * 12,
            e.x + Math.cos(e.angle) * 38,
            e.y + Math.sin(e.angle) * 38,
            rgba(base, 0.85),
          );
        }
        break;
      }
      case EnemyKind.Splitter: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 4, rgba(base, 0.8), 10);
        break;
      }
      case EnemyKind.Jammer: {
        R.circle(e.x, e.y, e.r, rgba(base, 0.35), 16);
        R.dashedCircle(e.x, e.y, JAMMER_RADIUS, rgba(base, 0.22), 20, -_time * 0.6);
        for (let i = 0; i < 4; i++) {
          const a = e.angle + (i * Math.PI) / 2;
          R.pushLine(
            e.x + Math.cos(a) * 8,
            e.y + Math.sin(a) * 8,
            e.x + Math.cos(a) * 20,
            e.y + Math.sin(a) * 20,
            rgba(base, 0.85),
          );
        }
        break;
      }
      case EnemyKind.Vortex: {
        R.circle(e.x, e.y, e.r, rgba(base, 0.35), 16);
        R.dashedCircle(e.x, e.y, VORTEX_RADIUS, rgba(base, 0.2), 24, _time * 0.5);
        R.pushLine(
          e.x,
          e.y,
          e.x + Math.cos(e.lockAngle) * VORTEX_RADIUS,
          e.y + Math.sin(e.lockAngle) * VORTEX_RADIUS,
          rgba(base, 0.75),
        );
        R.circle(e.x, e.y, 5, rgba(C.white, 0.8), 12);
        break;
      }
      case EnemyKind.Tractor: {
        // Корпус-кран: два луча захвата удерживаемого камня.
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 5, rgba(base, 0.7), 12);

        const cos = Math.cos(e.lockAngle);
        const sin = Math.sin(e.lockAngle);
        if (e.mode === 1) {
          // Перехват: пунктир до выбранного камня.
          R.pushLine(
            e.x,
            e.y,
            e.x + cos * TRACTOR_DETECT_RANGE,
            e.y + sin * TRACTOR_DETECT_RANGE,
            rgba(base, 0.35),
          );
        } else if (e.mode >= 2) {
          // Захват: два луча, сходящихся на камне перед корпусом.
          const gx = -sin * 8;
          const gy = cos * 8;
          for (const side of [1, -1]) {
            R.pushLine(
              e.x + gx * side,
              e.y + gy * side,
              e.x + cos * (TRACTOR_TOW_DIST + 22) + gx * side * 0.4,
              e.y + sin * (TRACTOR_TOW_DIST + 22) + gy * side * 0.4,
              rgba(base, 0.9),
            );
          }
        }
        break;
      }
      case EnemyKind.HiveMother: {
        drawShipPoly(R, e.x, e.y, e.angle, hullOf(e.kind), col);
        R.circle(e.x, e.y, 10, rgba(base, 0.5), 20);
        R.dashedCircle(e.x, e.y, 40 + e.mode * 6, rgba(base, 0.35), 14, _time * (0.6 + e.mode * 0.2));
        R.dashedCircle(e.x, e.y, 68, rgba(base, 0.14), 18, -_time * 0.35);
        break;
      }
      default: {
        // Новые архетипы без отдельной формы: простой круг.
        R.circle(e.x, e.y, e.r, rgba(base, 0.6), 12);
        break;
      }
      case EnemyKind.Mine: {
        // Мина: корпус, четыре шипа и пульсирующий взрыватель.
        R.circle(e.x, e.y, e.r, rgba(base, 0.35), 12);
        for (let i = 0; i < 4; i++) {
          const a = e.angle + (i * Math.PI) / 2;
          R.pushLine(
            e.x + Math.cos(a) * 4,
            e.y + Math.sin(a) * 4,
            e.x + Math.cos(a) * (e.r + 5),
            e.y + Math.sin(a) * (e.r + 5),
            rgba(base, 0.9),
          );
        }
        R.circle(e.x, e.y, 2.2, rgba(C.mine, 0.6 + 0.4 * Math.sin(_time * 5)), 8);
        break;
      }
    }
    // Лок игрока: четыре уголка вокруг цели, заметные с любого расстояния.
    if (e.locked) {
      const rr = e.r + 10;
      const tick = 6;
      const col = rgba("#5ef2ff", 0.95);
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        const cx = e.x + sx * rr;
        const cy = e.y + sy * rr;
        R.pushLine(cx, cy, cx - sx * tick, cy, col);
        R.pushLine(cx, cy, cx, cy - sy * tick, col);
      }
    }

    // Элитная метка и щит: читаются поверх любой формы врага.
    if (e.shieldHp > 0) {
      R.circle(e.x, e.y, e.r + 4, rgba("#4cc9f0", 0.3), 18);
    }
    if (e.affix) {
      R.dashedCircle(
        e.x,
        e.y,
        e.r + 7,
        rgba(affixColor(e.affix), 0.65),
        12,
        _time * 0.8,
      );
    }

    // Телеграф атаки (Stage 2)
    if (e.telegraphActive) {
      const alpha = clamp(e.telegraphTimer / 0.35, 0, 1);
      const len = 180;
      const cos = Math.cos(e.telegraphAngle);
      const sin = Math.sin(e.telegraphAngle);
      if (e.telegraphType === "line") {
        R.pushLine(
          e.x,
          e.y,
          e.x + cos * len,
          e.y + sin * len,
          rgba("#ff3b52", 0.35 + 0.45 * (1 - alpha)),
        );
      } else if (e.telegraphType === "cone") {
        const spread = 0.35;
        R.pushLine(
          e.x, e.y,
          e.x + Math.cos(e.telegraphAngle - spread) * len,
          e.y + Math.sin(e.telegraphAngle - spread) * len,
          rgba("#ff8a3d", 0.3),
        );
        R.pushLine(
          e.x, e.y,
          e.x + Math.cos(e.telegraphAngle + spread) * len,
          e.y + Math.sin(e.telegraphAngle + spread) * len,
          rgba("#ff8a3d", 0.3),
        );
        R.pushLine(e.x, e.y, e.x + cos * len, e.y + sin * len, rgba("#ff8a3d", 0.5));
      } else if (e.telegraphType === "flash") {
        R.circle(e.x + cos * 12, e.y + sin * 12, 6, rgba("#ffffff", 0.5 + 0.4 * (1 - alpha)), 12);
      } else if (e.telegraphType === "arc") {
        R.dashedCircle(e.x, e.y, 40, rgba("#a855f7", 0.4), 8, 0);
      }
    }

    if (e.kind !== EnemyKind.Boss && e.maxHp > 40 && e.hp < e.maxHp) {
      const f = clamp(e.hp / e.maxHp, 0, 1);
      R.dashedCircle(e.x, e.y, e.r + 6, rgba(base, 0.4), Math.max(3, Math.round(10 * f)), _time, 0.4);
    }
  }
}

/** Полигон корпуса: у врагов без корпуса-полигона — пустой список. */
function hullOf(kind: EnemyKind): ReadonlyArray<HullPoint> {
  return ENEMY_HULLS[kind] ?? [];
}

function affixColor(affix: AffixId): string {
  switch (affix) {
    case "armored": return "#b8c0cc";
    case "volatile": return "#ff8a3d";
    case "shielded": return "#4cc9f0";
    case "vampiric": return "#ff4d6d";
    case "hasted": return "#ffd166";
    case "splitting": return "#c77dff";
    case "precise": return "#90be6d";
    case "regenerating": return "#52b788";
    case "bulwark": return "#8d99ae";
    case "frenzied": return "#ff6b35";
    case "marksman": return "#f2e9e4";
    case "leech": return "#9d0208";
  }
}

