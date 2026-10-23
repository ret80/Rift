import type { MutableRefObject } from "react";
import type { LoadoutBarHandle } from "./components/LoadoutBar";

/**
 * Refs the HUD layer renders into and the HUD updater writes to.
 * Kept in one place so the markup and the updater never drift apart.
 */
export interface HudRefs {
  wave: MutableRefObject<HTMLDivElement | null>;
  progress: MutableRefObject<HTMLDivElement | null>;
  status: MutableRefObject<HTMLDivElement | null>;
  hullPanel: MutableRefObject<HTMLDivElement | null>;
  hpFill: MutableRefObject<HTMLDivElement | null>;
  /** Полоса энергии щита. */
  shieldFill: MutableRefObject<HTMLDivElement | null>;
  /** Текст процента блокировки щита. */
  shieldLabel: MutableRefObject<HTMLDivElement | null>;
  time: MutableRefObject<HTMLDivElement | null>;
  score: MutableRefObject<HTMLDivElement | null>;
  best: MutableRefObject<HTMLDivElement | null>;
  combo: MutableRefObject<HTMLDivElement | null>;
  minerals: MutableRefObject<HTMLDivElement | null>;
  parts: MutableRefObject<HTMLDivElement | null>;
  /** Weapon + bonus icon row under the top bar. */
  loadoutBar: MutableRefObject<LoadoutBarHandle | null>;
}
