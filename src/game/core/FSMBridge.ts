/**
 * FSMBridge — bridge between Game and StateMachine.
 *
 * Encapsulates:
 *  - FSM creation and configuration
 *  - GameFSMContext (state lifecycle hooks)
 *  - Subscriptions to FSM events for wave lifecycle
 *
 * Game passes all lifecycle callbacks to FSMBridge constructor,
 * and FSMBridge returns a ready-to-use GameStateMachine.
 */

import { GameStateMachine } from "./StateMachine";
import type { Transition } from "./StateMachine";

// ============================== Types ==============================

export type GameStateId = "menu" | "playing" | "active" | "cleared" | "dying" | "over";

export interface GameFSMContext {
  /** Called when player dies */
  onPlayerDeath: () => void;
  /** Called when death animation ends */
  onDeathAnimationEnd: () => void;
  /** Called when game is over */
  onGameOver: () => void;
  /** Called when player dies (before animation) */
  onPlayerDiedEvent?: () => void;
  /** Called when returning to menu */
  onReturnToMenu: () => void;
  /** Called when starting a new run */
  onStartRun: (wave: number) => void;
  /** Called when wave starts (after countdown) */
  onWaveStart: (wave: number) => void;
  /** Called when wave completes */
  onWaveComplete: () => void;
  /** Called when advancing to next wave (from cleared) */
  onWaveAdvanced?: (wave: number) => void;
  /** Called when countdown finishes */
  countdownDone?: () => void;
  /** Called on pause */
  onPause?: (paused: boolean) => void;
}

// ============================== Bridge Hooks ==============================

/** Hooks that Game provides for each FSM transition */
export interface FSMBridgeHooks {
  /** Player death handler (spawn explosion, save progress, clear bullets) */
  onPlayerDeath: () => void;
  /** Death animation end handler (statistics calculation) */
  onDeathAnimationEnd: () => void;
  /** Game over handler */
  onGameOver: () => void;
  /** Return to menu handler */
  onReturnToMenu: () => void;
  /** Run start handler */
  onStartRun: (wave: number) => void;
  /** Wave start handler */
  onWaveStart: (wave: number) => void;
  /** Wave complete handler */
  onWaveComplete: () => void;
  /** Next wave transition handler */
  onWaveAdvanced: (wave: number) => void;
  /** Countdown done handler */
  countdownDone: () => void;
  /** Pause handler */
  onPause: (paused: boolean) => void;
}

// ============================== FSM Transitions ==============================

/** Type-safe transition array for game FSM */
type GameTransition = Transition<GameFSMContext>;

const GAME_TRANSITIONS: GameTransition[] = [
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
    onEnter: (ctx) => ctx.countdownDone?.(),
  },
  {
    trigger: "wave_cleared",
    target: "cleared",
    guard: () => true,
    onEnter: (ctx) => ctx.onWaveComplete(),
  },
  {
    trigger: "next_wave",
    target: "playing",
    guard: () => true,
    onEnter: () => {},
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

// ============================== FSM Bridge ==============================

export class FSMBridge {
  private fsm: GameStateMachine<GameFSMContext>;
  private ctx: GameFSMContext;
  readonly machineId: number;

  constructor(hooks: FSMBridgeHooks) {
    // Create context with all hooks directly — no "mysterious sender" pattern
    this.ctx = {
      onPlayerDeath: hooks.onPlayerDeath,
      onDeathAnimationEnd: hooks.onDeathAnimationEnd,
      onGameOver: hooks.onGameOver,
      onReturnToMenu: hooks.onReturnToMenu,
      onStartRun: hooks.onStartRun,
      onWaveStart: hooks.onWaveStart,
      countdownDone: hooks.countdownDone,
      onPause: hooks.onPause,
      onWaveComplete: hooks.onWaveComplete,
      onWaveAdvanced: hooks.onWaveAdvanced,
    };

    // Create FSM with all hooks already wired — no post-construction filling
    this.fsm = new GameStateMachine<GameFSMContext>(
      "menu",
      GAME_TRANSITIONS,
      this.ctx
    );
    this.machineId = this.fsm.id;

    // Subscribe to FSM events for wave lifecycle coordination
    this.fsm.on("countdown_done", () => {
      // Countdown finished, game is now active
    });
    this.fsm.on("wave_cleared", () => {
      // Wave cleared, orchestrator will advance after delay
    });
  }

  /** Get the ready GameStateMachine */
  get fsmMachine(): GameStateMachine<GameFSMContext> {
    return this.fsm;
  }

  /** Get FSM context for direct hook calls */
  get context(): GameFSMContext {
    return this.ctx;
  }
}
