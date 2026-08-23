import React from "react";

export default function GameButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "red" | "amber";
  small?: boolean;
  autoFocus?: boolean;
}) {
  const cls =
    "clip-btn " +
    (props.variant === "red" ? "btn-red " : props.variant === "amber" ? "btn-amber " : "") +
    (props.small ? "btn-small px-5 py-2 text-[11px] " : "px-8 py-3 text-sm ");
  return (
    <button type="button" className={cls} onClick={props.onClick} autoFocus={props.autoFocus}>
      {props.children}
    </button>
  );
}
