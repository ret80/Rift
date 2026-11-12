import type { CSSProperties } from "react";

/** Кнопка вкладки: активная отличается рамкой, заливкой и линией снизу. */
export function TabButton(props: {
  label: string;
  active: boolean;
  activeClass: string;
  lineClass: string;
  onClick: () => void;
  /** Выделен ли элемент фокусом геймпада. */
  gamepadFocused?: boolean;
}) {
  const { label, active, activeClass, lineClass, onClick, gamepadFocused } = props;

  // Подсветка фокуса: --btn-c перекрашивает ::before-рамку clip-btn,
  // drop-shadow даёт свечение (box-shadow обрезается clip-path).
  const focusStyle: CSSProperties | undefined = gamepadFocused
    ? ({
        "--btn-c": "#ffb84d",
        background: "rgba(255, 184, 77, 0.14)",
        filter: "drop-shadow(0 0 6px rgba(255, 184, 77, 0.6))",
      } as CSSProperties)
    : undefined;

  return (
    <div className="relative shrink-0">
      <button
        onClick={onClick}
        style={focusStyle}
        className={`clip-btn px-5 py-2 text-xs font-mono tracking-[0.2em] transition-all ${
          active
            ? `border ${activeClass} text-[#eaffff]`
            : "border border-[#3d4f6d]/30 bg-[#0a1020]/50 text-[#6f86a8] hover:text-[#eaffff]"
        }`}
      >
        {label}
      </button>
      {active && (
        <span
          className={`absolute inset-x-2 -bottom-1 h-[2px] ${lineClass}`}
          aria-hidden="true"
        />
      )}
    </div>
  );
}
