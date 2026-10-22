import { useEffect, useState } from "react";
import type { PopupData } from "../game/types/ui";

/* Type guard instead of unsafe cast for Game internals */
interface GameInternals {
  camX: number;
  camY: number;
  zoom: number;
}

function isGameInternals(obj: unknown): obj is GameInternals {
  return (
    typeof obj === "object" &&
    obj !== null &&
    "camX" in obj &&
    "camY" in obj &&
    "zoom" in obj
  );
}

export interface FloatingPopupProps {
  p: PopupData;
  game: import("../game/game").Game | null;
}

export default function FloatingPopup({ p, game }: FloatingPopupProps) {
  const [pos, setPos] = useState({ x: -100, y: -100 });

  useEffect(() => {
    const internals = isGameInternals(game) ? game : null;
    if (!internals) return;

    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = w / 2 + (p.x - internals.camX) * internals.zoom;
    const y = h / 2 + (p.y - internals.camY) * internals.zoom;
    setPos({ x, y });
  }, [p, game]);

  return (
    <div
      className="anim-popup pointer-events-none absolute z-30 font-display text-sm"
      style={{ left: pos.x, top: pos.y, color: p.color }}
    >
      {p.text}
    </div>
  );
}
