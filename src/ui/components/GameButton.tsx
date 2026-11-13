import React from "react";

export default function GameButton(props: {
  children: React.ReactNode;
  onClick: () => void;
  variant?: "default" | "red" | "amber" | "cyan";
  small?: boolean;
  autoFocus?: boolean;
  className?: string;
  /** Индекс элемента для gamepad-навигации. */
  index?: number;
  /** Выделен ли элемент фокусом геймпада. */
  gamepadFocused?: boolean;
  /** Обработчик подтверждения (нажатие A на геймпаде). */
  onConfirm?: () => void;
  /** Кнопка недоступна: играет роль подсказки, а не действия. */
  disabled?: boolean;
  /** Причина недоступности во всплывающей подсказке. */
  title?: string;
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

  // Подсветка фокуса геймпада: меняем цвет рамки-обводки (--btn-c рисует
  // ::before-рамку clip-btn) + drop-shadow (box-shadow обрезается clip-path).
  const focusStyle: React.CSSProperties | undefined = props.gamepadFocused
    ? ({
        "--btn-c": "#ffb84d",
        background: "rgba(255, 184, 77, 0.14)",
        filter: "drop-shadow(0 0 8px rgba(255, 184, 77, 0.6))",
      } as React.CSSProperties)
    : undefined;

  const stateCls = props.disabled
    ? " cursor-not-allowed opacity-40 saturate-0 "
    : " ";
  const cls = (props.className ? baseCls + props.className : baseCls) + stateCls;

  const handleClick = () => {
    props.onClick();
    props.onConfirm?.();
  };

  return (
    <button
      type="button"
      className={cls}
      style={focusStyle}
      onClick={handleClick}
      autoFocus={props.autoFocus}
      disabled={props.disabled}
      title={props.title}
    >
      {props.children}
    </button>
  );
}
