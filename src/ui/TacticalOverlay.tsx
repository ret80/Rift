import React, { useState } from "react";
import { useT } from "../i18n";
import type { DroneOrder } from "../game/ecs/components/AllyDroneComponent";
import { useHudData, type HudStore } from "./hud/HudStore";

/**
 * TacticalOverlay — экран тактического режима.
 *
 * Пока оверлей открыт, мир стоит (пауза без экрана паузы), поэтому игрок
 * может спокойно отдать приказ рою: эскорт, штурм или фокус на цели под
 * прицелом. Приказ применяется сразу и сохраняется после выхода.
 */
export function TacticalOverlay(props: {
  store: HudStore;
  onOrder: (order: DroneOrder) => void;
  onClose: () => void;
}) {
  const t = useT();
  const data = useHudData(props.store);
  // Мир на паузе, поэтому HUD не перерисовывается: выбранный приказ
  // подсвечиваем локально, чтобы клик давал мгновенный отклик.
  const [picked, setPicked] = useState<DroneOrder | null>(null);
  const drones = data?.drones ?? 0;
  const current = picked ?? data?.droneOrder ?? "escort";

  const orders: Array<{ id: DroneOrder; label: string; hint: string }> = [
    { id: "escort", label: t("hud.orderEscort"), hint: t("hud.orderEscortHint") },
    { id: "assault", label: t("hud.orderAssault"), hint: t("hud.orderAssaultHint") },
    { id: "focus", label: t("hud.orderFocus"), hint: t("hud.orderFocusHint") },
  ];

  return (
    <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-[#04070d]/70 px-4">
      <div className="w-full max-w-md border border-[#5ef2ff]/30 bg-[#071019]/95 p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="font-mono text-[13px] font-bold tracking-[0.2em] text-[#5ef2ff]">
            {t("hud.tactical")}
          </h2>
          <span className="font-mono text-[10px] tracking-[0.15em] text-[#6f86a8]">
            {t("hud.dronesCount", { n: String(drones) })}
          </span>
        </div>

        <p className="mt-1 font-mono text-[9px] leading-relaxed tracking-[0.08em] text-[#6f86a8]">
          {t("hud.tacticalHint")}
        </p>

        <div className="mt-4 space-y-2">
          {orders.map((order) => {
            const active = current === order.id;
            return (
              <button
                key={order.id}
                type="button"
                onClick={() => {
                  setPicked(order.id);
                  props.onOrder(order.id);
                }}
                className={
                  "block w-full border px-3 py-2 text-left transition-colors " +
                  (active
                    ? "border-[#7dff9e]/70 bg-[#7dff9e]/10"
                    : "border-[#5ef2ff]/20 bg-[#0b1420]/70 hover:border-[#5ef2ff]/60")
                }
              >
                <span
                  className={
                    "font-mono text-[11px] font-bold tracking-[0.15em] " +
                    (active ? "text-[#7dff9e]" : "text-[#d9f4ff]")
                  }
                >
                  {order.label}
                </span>
                <span className="mt-0.5 block font-mono text-[9px] tracking-[0.05em] text-[#6f86a8]">
                  {order.hint}
                </span>
              </button>
            );
          })}
        </div>

        <button
          type="button"
          onClick={props.onClose}
          className={
            "mt-4 w-full border border-[#5ef2ff]/40 bg-[#5ef2ff]/10 py-2 " +
            "font-mono text-[11px] font-bold tracking-[0.2em] text-[#5ef2ff] " +
            "hover:bg-[#5ef2ff]/20"
          }
        >
          {t("hud.continue")}
        </button>
      </div>
    </div>
  );
}
