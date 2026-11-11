import React from "react";
import { PLAYER_DASH_COOLDOWN } from "../../game/balance/player";
import { useT } from "../../i18n";
import { Icon } from "./Icon";

/** Диаметр кнопки, px. */
const SIZE = 58;
/** Толщина кольца перезарядки, px. */
const STROKE = 2.5;
/** Радиус кольца. */
const RADIUS = (SIZE - STROKE) / 2;
/** Длина окружности кольца. */
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

/**
 * DashButton — единая кнопка рывка.
 *
 * Кольцо вокруг иконки показывает остаток перезарядки, а подпись внутри —
 * «ГОТОВ» или секунды. В готовом состоянии добавляется галочка и свечение,
 * чтобы рывок читался боковым зрением, не отвлекая от боя.
 */
export function DashButton(props: {
  ready: boolean;
  cooldown: number;
  onPress: () => void;
  className?: string;
}) {
  const t = useT();
  const remaining = Math.max(0, props.cooldown);
  const progress = props.ready ? 1 : 1 - Math.min(1, remaining / PLAYER_DASH_COOLDOWN);
  const status = props.ready
    ? t("hud.dashReady")
    : t("hud.dashCooldown", { s: remaining.toFixed(1) });
  const label = `${t("hud.dash")} — ${status}`;

  return (
    <button
      type="button"
      onClick={props.onPress}
      disabled={!props.ready}
      aria-label={label}
      title={label}
      className={
        "pointer-events-auto relative flex h-[58px] w-[58px] flex-col items-center justify-center " +
        "border transition-colors disabled:cursor-default " +
        (props.ready
          ? "border-[#5ef2ff]/70 bg-[#5ef2ff]/10 text-[#eaffff] shadow-[0_0_18px_#5ef2ff55]"
          : "border-[#6f86a8]/30 bg-[#0b1420]/75 text-[#6f86a8]") +
        (props.className ? ` ${props.className}` : "")
      }
    >
      <svg
        className="pointer-events-none absolute inset-0 -rotate-90"
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke="#5ef2ff22"
          strokeWidth={STROKE}
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          stroke={props.ready ? "#7dff9e" : "#5ef2ff"}
          strokeWidth={STROKE}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          style={{ transition: "stroke-dashoffset 120ms linear" }}
        />
      </svg>

      <Icon
        kind="dash"
        size={22}
        color={props.ready ? "#9df1ff" : "#6f86a8"}
        className="mt-1"
      />
      <span
        className={
          "font-mono text-[7px] font-bold leading-none tracking-[0.06em] " +
          (props.ready ? "text-[#7dff9e]" : "text-[#8ca3c2]")
        }
      >
        {status}
      </span>

      {props.ready && (
        <span
          className={
            "absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full " +
            "bg-[#7dff9e] font-mono text-[9px] font-bold text-[#04100a]"
          }
          aria-hidden="true"
        >
          ✓
        </span>
      )}
    </button>
  );
}
