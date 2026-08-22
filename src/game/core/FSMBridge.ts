/**
 * FSMBridge — мост между Game и StateMachine.
 *
 * Инкапсулирует:
 *  - Создание/конфигурацию FSM
 *  - Хук-контекст GameFSMContext (жизненный цикл состояний)
 *  - Подписку на события FSM для волнового жизненного цикла
 *
 * Game передаёт в FSMBridge все колбэки жизненного цикла,
 * а FSMBridge возвращает готовый GameStateMachine.
 */

import { GameStateMachine } from "./StateMachine";
import type { GameFSMContext, GameStateId } from "./GameFSM";

// ============================== Bridge Hooks ==============================

/** Хуки, которые Game предоставляет для каждого перехода FSM */
export interface FSMBridgeHooks {
  /** Обработчик смерти игрока (спавн взрыва, сохранение прогресса, очистка пуль) */
  onPlayerDeath: () => void;
  /** Обработчик окончания death-анимации (подсчёт статистики) */
  onDeathAnimationEnd: () => void;
  /** Обработчик конца игры */
  onGameOver: () => void;
  /** Обработчик возврата в меню */
  onReturnToMenu: () => void;
  /** Обработчик старта забега */
  onStartRun: (wave: number) => void;
  /** Обработчик начала волны */
  onWaveStart: (wave: number) => void;
  /** Обработчик завершения волны */
  onWaveComplete: () => void;
  /** Обработчик перехода к следующей волне */
  onWaveAdvanced: (wave: number) => void;
  /** Обработчик завершения countdown */
  countdownDone: () => void;
  /** Обработчик паузы */
  onPause: (paused: boolean) => void;
}

// ============================== FSM Bridge ==============================

export class FSMBridge {
  private fsm: GameStateMachine<GameFSMContext>;
  private ctx: GameFSMContext;

  constructor(hooks: FSMBridgeHooks) {
    // Создаём пустой контекст для предотвращения circular dependency
    this.ctx = {
      onPlayerDeath: () => {},
      onDeathAnimationEnd: () => {},
      onGameOver: () => {},
      onReturnToMenu: () => {},
      onStartRun: () => {},
      onWaveStart: () => {},
      countdownDone: () => {},
      onPause: () => {},
      onWaveComplete: () => {},
      onWaveAdvanced: () => {},
    };

    // Создаём FSM с initial context
    this.fsm = new GameStateMachine<GameFSMContext>("menu", 
      [
        { trigger: "start", target: "playing", guard: () => true, onEnter: () => {} },
        { trigger: "to_menu", target: "menu", guard: () => true, onEnter: () => this.ctx.onReturnToMenu() },
        { trigger: "countdown_done", target: "active", guard: () => this.fsm.is("playing"), onEnter: () => {} },
        { trigger: "wave_cleared", target: "cleared", guard: () => true, onEnter: () => this.ctx.onWaveComplete() },
        { trigger: "next_wave", target: "playing", guard: () => true, onEnter: () => {} },
        { trigger: "player_died", target: "dying", guard: () => true, onEnter: () => this.ctx.onPlayerDeath() },
        { trigger: "death_anim_done", target: "over", guard: () => true, onEnter: () => this.ctx.onDeathAnimationEnd() },
        { trigger: "restart", target: "playing", guard: () => true, onEnter: () => this.ctx.onStartRun(1) },
      ] as any,
      this.ctx
    );

    // Заполняем контекст после создания FSM (pattern: "mysterious sender")
    this.ctx.onPlayerDeath = hooks.onPlayerDeath;
    this.ctx.onDeathAnimationEnd = hooks.onDeathAnimationEnd;
    this.ctx.onGameOver = hooks.onGameOver;
    this.ctx.onReturnToMenu = hooks.onReturnToMenu;
    this.ctx.onStartRun = hooks.onStartRun;
    this.ctx.onWaveStart = hooks.onWaveStart;
    this.ctx.countdownDone = hooks.countdownDone;
    this.ctx.onPause = hooks.onPause;
    this.ctx.onWaveComplete = hooks.onWaveComplete;
    this.ctx.onWaveAdvanced = hooks.onWaveAdvanced;

    // Подписываемся на события FSM для волнового жизненного цикла
    this.fsm.on("countdown_done", () => {
      // Countdown finished, game is now active
    });
    this.fsm.on("wave_cleared", () => {
      // Wave cleared, orchestrator will advance after delay
    });
  }

  /** Получить готовый GameStateMachine */
  get fsmMachine(): GameStateMachine<GameFSMContext> {
    return this.fsm;
  }

  /** Получить контекст FSM (для прямых вызовов хуков) */
  get context(): GameFSMContext {
    return this.ctx;
  }
}
