import React from "react";
import type { DroneOrder } from "../../game/ecs/components/AllyDroneComponent";
import { useT, type TKey } from "../../i18n";

/** Вариант приказа в переключателе. */
interface OrderOption {
  id: DroneOrder;
  label: TKey;
  hint: TKey;
}

/** Все приказы рою в порядке переключателя. */
const ORDERS: OrderOption[] = [
  { id: "escort", label: "hud.orderEscort", hint: "hud.orderEscortHint" },
  { id: "assault", label: "hud.orderAssault", hint: "hud.orderAssaultHint" },
  { id: "focus", label: "hud.orderFocus", hint: "hud.orderFocusHint" },
];

/**
 * DroneOrderSwitch — переключатель приказов рою на ходу.
 *
 * Три крупные зоны нажатия и ползунок под выбранным приказом заменяют
 * маленькую кнопку тактического режима: приказ меняется одним касанием
 * во время боя, без остановки мира и открытия оверлея.
 */
export function DroneOrderSwitch(props: {
  order: DroneOrder;
  drones: number;
  onOrder: (order: DroneOrder) => void;
}) {
  const t = useT();
  if (props.drones <= 0) return null;

  const activeIndex = Math.max(0, ORDERS.findIndex((order) => order.id === props.order));

  return (
    <div
      className="pointer-events-auto absolute left-1/2 -translate-x-1/2"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 14px)" }}
    >
      <div
        className={
          "relative grid w-[216px] max-w-[calc(100vw-140px)] grid-cols-3 " +
          "border border-[#7dff9e]/30 bg-[#07130c]/85 p-1"
        }
        role="group"
        aria-label={t("hud.droneOrders")}
        style={{ touchAction: "manipulation" }}
      >
        {/* Ползунок: одна треть ширины, сдвигается к выбранному приказу. */}
        <span
          className={
            "pointer-events-none absolute bottom-1 left-1 top-1 w-[calc((100%-8px)/3)] " +
            "border border-[#7dff9e]/60 bg-[#7dff9e]/15 transition-transform duration-150"
          }
          style={{ transform: `translateX(${activeIndex * 100}%)` }}
          aria-hidden="true"
        />

        {ORDERS.map((order) => {
          const active = order.id === props.order;
          return (
            <button
              key={order.id}
              type="button"
              onClick={() => props.onOrder(order.id)}
              onPointerDown={(e) => e.stopPropagation()}
              aria-pressed={active}
              aria-label={t(order.hint)}
              title={t(order.hint)}
              className={
                "relative z-10 h-11 border-0 bg-transparent font-mono text-[9px] font-bold " +
                "tracking-[0.08em] transition-colors " +
                (active ? "text-[#eaffff]" : "text-[#6f86a8] hover:text-[#b9f7cf]")
              }
            >
              {t(order.label)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
