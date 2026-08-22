/**
 * GameFSM — машина состояний для управления уровнем игры.
 * 
 * Состояния:
 *   menu     → Главное меню (анимация, подготовка)
 *   playing  → Начинается новый забег (спавн игрока, стартовый отсчёт)
 *   active   → Игровой процесс (волна идёт, зона существует)
 *   cleared  → Волна пройдена, подготовка к следующей
 *   dying    → Смерть игрока, анимация взрыва
 *   over     → Конец игры (статистика)
 * 
 * Граф переходов:
 *   menu ──startRun──▶ playing ──countdown_end──▶ active
 *     ▲                    │                           │
 *     │                    ▼                           ▼
 *     └────toMenu◀────── over ◀─────game_over◀──dying
 *                                    │
 *                              (timer expires)
 */

import { GameStateMachine } from "./StateMachine";

// ============================== Types ==============================

export type GameStateId = "menu" | "playing" | "active" | "cleared" | "dying" | "over";

export interface GameFSMContext {
  /** Вызывается при смерти игрока */
  onPlayerDeath: () => void;
  /** Вызывается при завершении death-анимации */
  onDeathAnimationEnd: () => void;
  /** Вызывается при завершении игры */
  onGameOver: () => void;
  /** Вызывается когда игрок умирает (до анимации) */
  onPlayerDiedEvent?: () => void;
  /** Вызывается при возврате в меню */
  onReturnToMenu: () => void;
  /** Вызывается при старте нового забега */
  onStartRun: (wave: number) => void;
  /** Вызывается при начале волны (после countdown) */
  onWaveStart: (wave: number) => void;
  /** Вызывается при завершении волны */
  onWaveComplete: () => void;
  /** Вызывается при переходе к следующей волне (из cleared) */
  onWaveAdvanced?: (wave: number) => void;
  /** Вызывается когда countdown заканчивается */
  countdownDone?: () => void;
  /** Вызывается при паузе */
  onPause?: (paused: boolean) => void;
}

// ============================== Transitions ==============================

const TRANSITIONS = [
  // ---- MENU ----
  {
    trigger: "start",
    target: "playing",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      // Playing state entered - countdown will begin
    },
  },
  {
    trigger: "to_menu",
    target: "menu",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      ctx.onReturnToMenu();
    },
  },

  // ---- PLAYING -> ACTIVE (countdown finished) ----
  {
    trigger: "countdown_done",
    target: "active",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      // Active gameplay begins
    },
  },

  // ---- ACTIVE -> CLEARED (wave finished) ----
  {
    trigger: "wave_cleared",
    target: "cleared",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      ctx.onWaveComplete();
    },
  },

  // ---- CLEARED -> PLAYING (next wave countdown) ----
  {
    trigger: "next_wave",
    target: "playing",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      // Back to playing for next wave countdown
      if (ctx.onWaveAdvanced) {
        // Wave number will be set by caller before firing
      }
    },
  },

  // ---- ANY -> DYING (player dies) ----
  {
    trigger: "player_died",
    target: "dying",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      if (ctx.onPlayerDiedEvent) {
        ctx.onPlayerDiedEvent();
      }
      ctx.onPlayerDeath();
    },
  },

  // ---- DYING -> OVER (animation done) ----
  {
    trigger: "death_anim_done",
    target: "over",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      ctx.onDeathAnimationEnd();
    },
  },

  // ---- OVER -> PLAYING (restart) ----
  {
    trigger: "restart",
    target: "playing",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      ctx.onStartRun(1);
    },
  },

  // ---- OVER -> MENU ----
  {
    trigger: "to_menu",
    target: "menu",
    guard: (ctx: GameFSMContext) => true,
    onEnter: (ctx: GameFSMContext) => {
      ctx.onReturnToMenu();
    },
  },
];

// ============================== Factory ==============================

export function createGameFSM(ctx: GameFSMContext): GameStateMachine<GameFSMContext> {
  return new GameStateMachine<GameFSMContext>("menu", TRANSITIONS, ctx);
}
