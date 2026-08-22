/**
 * FSM — минималистичная машина состояний для управления состоянием игры.
 * Гарантирует:
 *  - Одно активное состояние за раз (no double-entry)
 *  - Явные графы переходов (allowed transitions)
 *  - Подписку на события и таймеры переходов
 */

export type StateId = string;

export interface Transition<TContext = unknown> {
  /** Событие или метод, который вызывает переход */
  trigger: string;
  /** Состояние в которое переходим */
  target: StateId;
  /** Condition function: можно ли перейти сейчас */
  guard?: (ctx: TContext) => boolean;
  /** Action: что сделать при переходе */
  onEnter?: (ctx: TContext) => void;
}

export class GameStateMachine<TContext = unknown> {
  private currentState: StateId | null = null;
  private listeners: Map<string, Set<(ctx: TContext) => void>> = new Map();
  private enterListeners: Map<string, Set<(ctx: TContext) => void>> = new Map();

  constructor(
    private initialState: StateId,
    private transitions: Transition<TContext>[],
    private initialContext?: TContext
  ) {
    this.currentState = initialState;
    // Run onEnter for initial state if needed
    const initTransition = this.transitions.find(t => t.target === initialState);
    if (initTransition?.onEnter) {
      initTransition.onEnter(this.initialContext!);
    }
  }

  /** Текущее состояние */
  get state(): StateId | null {
    return this.currentState;
  }

  /** Проверить, находимся ли мы в состоянии (или состояниях) */
  is(...states: StateId[]): boolean {
    return this.currentState !== null && states.includes(this.currentState);
  }

  /** Проверить, что мы НЕ в каком-либо из состояний */
  not(...states: StateId[]): boolean {
    return !this.is(...states);
  }

  /** Выполнить переход */
  fire(trigger: string, ctx?: TContext): boolean {
    const context = ctx ?? this.initialContext;
    if (!context) {
      return false;
    }

    const allowed = this.transitions.filter(
      t =>
        t.trigger === trigger &&
        this.currentState !== null &&
        (t.guard?.(context) !== false)
    );

    if (allowed.length === 0) {
      return false;
    }

    for (const t of allowed) {
      // Переход в то же состояние — noop (защита от двойного входа)
      if (t.target === this.currentState) {
        if (t.onEnter) t.onEnter(context);
        return true;
      }
      this.currentState = t.target;
      if (t.onEnter) t.onEnter(context);
      this.notifyEnter(t.target, context);
      return true;
    }

    return false;
  }

  /** Подписаться на событие */
  on(event: string, cb: (ctx: TContext) => void): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(cb);
    return () => {
      this.listeners.get(event)?.delete(cb);
    };
  }

  /** Подписаться на вход в состояние */
  onEnter(state: StateId, cb: (ctx: TContext) => void): () => void {
    if (!this.enterListeners.has(state)) {
      this.enterListeners.set(state, new Set());
    }
    this.enterListeners.get(state)!.add(cb);
    return () => {
      this.enterListeners.get(state)?.delete(cb);
    };
  }

  /** Опубликовать событие всем подписчикам */
  emit(event: string, ctx?: TContext): void {
    const context = ctx ?? this.initialContext;
    if (!context) return;

    const cbs = this.listeners.get(event);
    if (cbs) {
      const snapshot = Array.from(cbs);
      for (const cb of snapshot) {
        try {
          cb(context);
        } catch (err) {
          console.error(`[FSM] Error in event listener "${event}":`, err);
        }
      }
    }
  }

  private notifyEnter(state: StateId, ctx: TContext): void {
    const cbs = this.enterListeners.get(state);
    if (cbs) {
      const snapshot = Array.from(cbs);
      for (const cb of snapshot) {
        try {
          cb(ctx);
        } catch (err) {
          console.error(`[FSM] Error in enter listener for state "${state}":`, err);
        }
      }
    }
  }
}
