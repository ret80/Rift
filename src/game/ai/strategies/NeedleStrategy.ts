/**
 * NeedleStrategy — снайпер «Игла».
 *
 * Держит дистанцию 340 px и стреляет по предсказуемому облёту игрока.
 * Перед выстрелом замирает и заряжает луч 1.1 с: это окно, в которое надо
 * сменить радиус или направление. Сам выстрел выполняет
 * EnemyShootingSystem по заявке fireGate; он же рисует линию телеграфа.
 */

import { NEEDLE_CHARGE_TIME, NEEDLE_RANGE, NEEDLE_STANDOFF } from "../../balance";
import type { EnemyRef } from "../../ecs";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { leadAngle, standoffAngle, steer } from "./ArchetypeMovement";

const APPROACH = 0;
const CHARGE = 1;
const RECOVER = 2;

export class NeedleStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const dx = context.playerX - enemy.position.x;
    const dy = context.playerY - enemy.position.y;
    const dist = Math.hypot(dx, dy) || 1;

    if (marker.mode < APPROACH || marker.mode > RECOVER) {
      marker.mode = APPROACH;
      marker.modeT = 0;
    }

    // Заявка живёт один кадр; выстрел снимает её в фазе EnemyActions.
    marker.fireGate = false;

    switch (marker.mode) {
      case CHARGE: {
        marker.modeT -= dt;
        // Телеграф заряда: тонкая линия уже показывает будущий выстрел.
        marker.telegraphActive = true;
        marker.telegraphType = "line";
        marker.telegraphTimer = Math.max(0, marker.modeT);
        marker.telegraphAngle = marker.lockAngle;

        // На зарядке Игла почти стоит — её легко наказать рывком.
        steer(enemy, marker.lockAngle, marker.speed * 0.22, 2.4, dt);

        if (marker.modeT <= 0) {
          marker.fireGate = true;
          marker.mode = RECOVER;
          marker.modeT = 0.9;
        }
        break;
      }

      case RECOVER: {
        marker.modeT -= dt;
        // Не сбрасываем telegraphActive: его ведёт pendingShot стрельбы.
        steer(
          enemy,
          standoffAngle(enemy, context, NEEDLE_STANDOFF, marker.strafeDir),
          marker.speed * 0.7,
          4,
          dt,
        );
        if (marker.modeT <= 0) marker.mode = APPROACH;
        break;
      }

      default: {
        const canCharge =
          marker.attackAllowed &&
          marker.fireCd <= 0 &&
          dist <= NEEDLE_RANGE;

        if (canCharge) {
          marker.mode = CHARGE;
          marker.modeT = NEEDLE_CHARGE_TIME;
          marker.lockAngle = leadAngle(enemy, context, 0.45);
        } else {
          steer(
            enemy,
            standoffAngle(enemy, context, NEEDLE_STANDOFF, marker.strafeDir),
            marker.speed,
            4,
            dt,
          );
        }
        break;
      }
    }
  }
}
