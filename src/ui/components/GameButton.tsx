import React from "react";

export default function GameButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "red" | "amber" | "cyan";
  small?: boolean;
  autoFocus?: boolean;
  className?: string;
}) {
  const baseCls =
    "clip-btn " +
    (props.variant === "red"
      ? "btn-red "
      : props.variant === "amber"
        ? "btn-amber "
        : props.variant === "cyan"
          ? "btn-cyan "
          : "") +
    (props.small ? "btn-small px-5 py-2 text-[11px] " : "px-8 py-3 text-sm ");
  const cls = props.className ? baseCls + props.className : baseCls;
  return (
    <button type="button" className={cls} onClick={props.onClick} autoFocus={props.autoFocus}>
      {props.children}
    </button>
  );
}
