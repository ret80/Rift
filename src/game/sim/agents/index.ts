/**
 * Фабрика агентов игрока.
 *
 * Сценарий выбирает агента по имени; код мира при этом не меняется.
 * Все параметры (радиус, дистанции, темп решений, джиттер) приходят из
 * сценария, поэтому один и тот же агент моделирует разные уровни игры.
 */

import type { Rng } from "../../core/rng";
import { EvadeAgent, type EvadeAgentOptions } from "./EvadeAgent";
import { KiteAgent, type KiteAgentOptions } from "./KiteAgent";
import { OrbitAgent, type OrbitAgentOptions } from "./OrbitAgent";
import { RandomAgent, type RandomAgentOptions } from "./RandomAgent";
import { ReplayAgent } from "./ReplayAgent";
import type { PlayerAgent, PlayerIntent } from "./PlayerAgent";

export * from "./PlayerAgent";
export { OrbitAgent } from "./OrbitAgent";
export { KiteAgent } from "./KiteAgent";
export { EvadeAgent } from "./EvadeAgent";
export { RandomAgent } from "./RandomAgent";
export { ReplayAgent } from "./ReplayAgent";

/** Имена агентов, доступные из сценария. */
export type PlayerAgentKind = "orbit" | "kite" | "evade" | "random" | "replay";

export const PLAYER_AGENT_KINDS: readonly PlayerAgentKind[] = [
  "orbit",
  "kite",
  "evade",
  "random",
  "replay",
];

/** Опции, которые понимает фабрика. */
export interface PlayerAgentFactoryOptions
  extends OrbitAgentOptions,
    KiteAgentOptions,
    EvadeAgentOptions,
    RandomAgentOptions {
  /** Запись для ReplayAgent. */
  replay?: readonly PlayerIntent[];
}

/** Проверить, что строка — известный агент. */
export function isPlayerAgentKind(value: unknown): value is PlayerAgentKind {
  return typeof value === "string" && (PLAYER_AGENT_KINDS as readonly string[]).includes(value);
}

/**
 * Создать агента по имени.
 *
 * @param rng — поток `agent` из SeedSet: решения агента не сдвигают боевые броски.
 */
export function createPlayerAgent(
  kind: PlayerAgentKind,
  options: PlayerAgentFactoryOptions,
  rng: Rng,
): PlayerAgent {
  switch (kind) {
    case "orbit":
      return new OrbitAgent(options, rng);
    case "kite":
      return new KiteAgent(options, rng);
    case "evade":
      return new EvadeAgent(options, rng);
    case "random":
      return new RandomAgent(options, rng);
    case "replay":
      return new ReplayAgent(options.replay ?? []);
    default: {
      const exhaustive: never = kind;
      throw new Error(`Неизвестный агент игрока: ${String(exhaustive)}`);
    }
  }
}
