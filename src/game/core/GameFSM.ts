/**
 * GameFSM — конфигурация машины состояний игры.
 * Содержит типы, контекст и переходы для GameStateMachine.
 */

import type { Transition } from "./StateMachine";

/* ============================== Types ============================== */

export type GameStateId = "menu" | "playing" | "active" | "dying" | "over";

/**
 * Контекст FSM — коллбэки жизненного цикла,
 * которые машина состояний вызывает при переходах.
 * Волновой цикл (active/cleared) ведёт WaveOrchestrator,
 * поэтому в FSM нет переходов wave_cleared/next_wave.
 */
export interface GameFSMContext {
  onPlayerDeath: () => void;
  onDeathAnimationEnd: () => void;
  onReturnToMenu: () => void;
  onStartRun: (wave: number) => void;
  countdownDone: () => void;
  onPause: (paused: boolean) => void;
}

/* ============================== Transitions ============================== */

type GameTransition = Transition<GameFSMContext>;

export const GAME_TRANSITIONS: GameTransition[] = [
  {
    trigger: "start",
    target: "playing",
    guard: () => true,
    onEnter: () => {},
  },
  {
    trigger: "to_menu",
    target: "menu",
    guard: () => true,
    onEnter: (ctx) => ctx.onReturnToMenu(),
  },
  {
    trigger: "countdown_done",
    target: "active",
    guard: () => true,
    onEnter: (ctx) => ctx.countdownDone(),
  },
  {
    trigger: "player_died",
    target: "dying",
    guard: () => true,
    onEnter: (ctx) => ctx.onPlayerDeath(),
  },
  {
    trigger: "death_anim_done",
    target: "over",
    guard: () => true,
    onEnter: (ctx) => ctx.onDeathAnimationEnd(),
  },
  {
    trigger: "restart",
    target: "playing",
    guard: () => true,
    onEnter: (ctx) => ctx.onStartRun(1),
  },
];
