/**
 * RecordButton — запись забега для симулятора (`?record`).
 *
 * Кружок — запись не идёт, клик начинает её с нового забега. Квадратик —
 * запись идёт, клик останавливает её и скачивает сценарий JSON.
 * Кнопка живёт в правом верхнем углу под верхней панелью HUD.
 */

import { useT } from "../../i18n";

export interface RecordButtonProps {
  recording: boolean;
  onToggle: () => void;
}

export function RecordButton(props: RecordButtonProps) {
  const t = useT();
  const label = props.recording ? t("hud.recordStop") : t("hud.recordStart");
  const color = props.recording ? "#ff3b52" : "#5ef2ff";

  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-label={label}
      aria-pressed={props.recording}
      title={label}
      className={
        "pointer-events-auto flex h-9 w-9 items-center justify-center rounded-full " +
        "border bg-[#060c18]/85 transition-colors duration-150 " +
        "hover:bg-[#0b1626] focus:outline-none focus-visible:ring-1 focus-visible:ring-[#5ef2ff]"
      }
      style={{
        borderColor: `${color}88`,
        boxShadow: `0 0 10px ${color}33`,
      }}
    >
      {props.recording ? (
        <span
          className="h-3 w-3 rounded-[1px] bg-[#ff3b52]"
          style={{ boxShadow: "0 0 8px #ff3b52" }}
        />
      ) : (
        <span
          className="h-3 w-3 rounded-full bg-[#ff3b52]"
          style={{ boxShadow: "0 0 8px #ff3b52" }}
        />
      )}
    </button>
  );
}
