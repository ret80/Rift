import type { ReactNode } from "react";

/**
 * ScreenHeader — единый заголовок экранов меню.
 *
 * Заголовок всегда светлый и крупный, вынесен из прокручиваемой области,
 * поэтому остаётся на экране при скролле содержимого. Справа можно вывести
 * дополнительный блок (кредиты, детали и т.п.).
 */
export default function ScreenHeader(props: {
  title: string;
  /** Блок справа от заголовка: счётчик, подсказка и т.п. */
  aside?: ReactNode;
  /** Зелёная рамка для отладочного экрана. */
  tone?: "default" | "debug";
  /** Дополнительные классы контейнера (отступы, отрицательные поля). */
  className?: string;
}) {
  const borderClass = props.tone === "debug" ? "border-[#7dff9e]/30" : "border-[#5ef2ff]/15";
  return (
    <div
      className={
        `flex shrink-0 items-center justify-between gap-3 border-b ${borderClass} ` +
        `px-5 py-3 sm:px-7 ${props.className ?? ""}`
      }
    >
      <div className="font-display truncate text-[15px] tracking-[0.3em] text-[#eaffff] uppercase sm:text-base">
        {props.title}
      </div>
      {props.aside}
    </div>
  );
}
