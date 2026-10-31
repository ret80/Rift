import React from "react";
import type { LoadoutSlotData } from "../../game/loadout/LoadoutTypes";
import { useT } from "../../i18n";
import { Icon } from "./Icon";

/* ============================================================
   LoadoutBar — строка оружия и бонусов под верхней панелью HUD.

   Каждый слот — иконка в кольце:
     • оружие  → кольцо заполняется по мере перезарядки;
     • бонус   → кольцо убывает вместе с остатком времени;
     • мгновенный бонус → без таймера, короткая вспышка.

   Внешний вид слота (иконка, цвет, подпись) приходит из игрового модуля —
   строка только рисует то, что ей передали.
   ============================================================ */

/** Радиус кольца — должен совпадать с `.loadout-ring` в index.css. */
const RING_R = 12;
/** Длина окружности кольца для stroke-dasharray. */
const RING_C = 2 * Math.PI * RING_R;

export function LoadoutBar(props: { slots: LoadoutSlotData[] }) {
  const t = useT();

  return (
    <div className="loadout-bar">
      {props.slots.map((slot) => (
        <div
          key={slot.kind}
          className="loadout-slot"
          style={{ color: slot.meta.color }}
          title={t(slot.meta.labelKey)}
        >
          <svg className="loadout-ring" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
            <circle className="loadout-track" cx="15" cy="15" r={RING_R} />
            <circle
              className="loadout-arc"
              cx="15"
              cy="15"
              r={RING_R}
              transform="rotate(-90 15 15)"
              strokeDasharray={RING_C}
              strokeDashoffset={RING_C * (1 - slot.progress)}
            />
          </svg>
          <Icon
            kind={slot.meta.icon}
            size={17}
            color={slot.meta.color}
            className="loadout-icon"
          />
        </div>
      ))}
    </div>
  );
}
