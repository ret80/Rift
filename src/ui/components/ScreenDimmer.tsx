import React from "react";

/**
 * Отдельный компонент затемнения фона.
 * Показывается когда в игре открыто любое меню (пауза, гейм овер, настройки, прокачка).
 * Не привязан к конкретному меню — управляется из App.tsx на основе состояния.
 */
export default function ScreenDimmer() {
  return (
    <div className="absolute inset-0 z-10 bg-[#04070d]/60 backdrop-blur-[2px] pointer-events-none" />
  );
}
