import React from "react";
import { useT } from "../../i18n";

/**
 * RecordButton — кнопка записи забега в HUD (`?record`).
 *
 * Кружок означает «запись не идёт», квадратик — «запись идёт».
 * Клик по кружку начинает новый забег с записью, клик по квадратику
 * останавливает её и сохраняет файл.
 */
export function RecordButton(props: { recording: boolean; onToggle: () => void }) {
  const t = useT();
  const label = props.recording ? t("hud.recordStop") : t("hud.recordStart");

  return (
    <button
      type="button"
      onClick={props.onToggle}
      aria-label={label}
      title={label}
      className={
        "pointer-events-auto flex h-9 w-9 items-center justify-center border " +
        "transition-colors duration-150 " +
        (props.recording
          ? "border-[#ff3b52] bg-[#ff3b52]/20 text-[#ff8a96] hover:bg-[#ff3b52]/30"
          : "border-[#5ef2ff]/40 bg-[#0b1420]/70 text-[#5ef2ff] hover:border-[#5ef2ff]")
      }
    >
      {props.recording ? (
        <span className="block h-3 w-3 bg-current" aria-hidden="true" />
      ) : (
        <span className="block h-3 w-3 rounded-full bg-current" aria-hidden="true" />
      )}
    </button>
  );
}
