# ref_09 — Упростить FSM (объединить GameFSM + FSMBridge)

## Проблема

FSM-управление размазано по трём файлам с ненужным посредником:

```
GameFSM.ts    — полный файл переходов (154 строки)
FSMBridge.ts  — дублирует переходы + пустые хуки (108 строк)
game.ts       — использует оба через this.fsmBridge.fsmMachine
```

**Проблема FSMBridge:**

1. Создаёт FSM с пустыми хуками, потом заполняет их — паттерн "mysterious sender"
2. Переходы дублируются: `GameFSM.ts` имеет 9 переходов, `FSMBridge.ts` дублирует 8 из них
3. Контекст `GameFSMContext` содержит оба callback-а и event-bridge:

```typescript
interface GameFSMContext {
  onPlayerDeath: () => void;
  onDeathAnimationEnd: () => void;
  countdownDone?: () => void;
  // ...
}

// В GameFSM.ts на каждый переход:
onEnter: (ctx) => { ctx.onPlayerDeath(); }

// В FSMBridge.ts дублирует:
this.ctx.onPlayerDeath = hooks.onPlayerDeath;
```

4. Direct context access: `this.fsmBridge.context.countdownDone?.()` — bypass FSM machine

## Цель

Один `GameFSM.ts` с хуками в контексте. Удалить `FSMBridge.ts`.

## Задачи

### 1. Усилить `GameFSM.ts`

Сделать `createGameFSM` основной точкой создания:

```typescript
// GameFSM.ts:
export function createGameFSM(ctx: GameFSMContext): GameStateMachine<GameFSMContext> {
  return new GameStateMachine<GameFSMContext>("menu", TRANSITIONS, ctx);
}

// Game.ts:
this.fsm = createGameFSM({
  onPlayerDeath: () => this.deathSystem.startDeath(),
  onDeathAnimationEnd: () => this.deathSystem.onFinishDeath(),
  onReturnToMenu: () => this.toMenu(),
  onStartRun: (wave) => this.startRun(),
  // ...
});
```

### 2. Убрать `FSMBridge.ts`

Удалить файл и все вызовы:
```typescript
// Было:
this.fsmBridge = new FSMBridge({ ... });
this.fsmCtx = this.fsmBridge.context;
// this.fsmBridge.fsmMachine.fire("...");

// Стало:
this.fsm = createGameFSM({ ... });
// this.fsm.fire("...");
```

### 3. Убрать прямые вызовы контекста

```typescript
// Было (game.ts:413):
this.fsmBridge?.context.countdownDone?.();

// Стало — через FSM или напрямую:
this.fsm.fire("countdown_done");
// ИЛИ
context.countdownDone?.(); // store context reference
```

### 4. Упростить интерфейс контекста

Убрать optional fields где не нужно:

```typescript
interface GameFSMContext {
  onPlayerDeath: () => void;
  onDeathAnimationEnd: () => void;
  onGameOver: () => void;
  onReturnToMenu: () => void;
  onStartRun: (wave: number) => void;
  onWaveStart: (wave: number) => void;
  onWaveComplete: () => void;
  countdownDone: () => void;
  onPause: (paused: boolean) => void;
}
```

## Критерии готовности

- [ ] `FSMBridge.ts` удалён
- [ ] Game.ts создаёт FSM через `createGameFSM(ctx)`
- [ ] Нет доступа `this.fsmBridge.context`
- [ ] Нет дублирования переходов
- [ ] `npm run typecheck` без ошибок

## Ожидаемый эффект

- Удалить ~108 строк ненужного абстракционного кода
- FSM создаётся один раз, без двухэтапной инициализации
- Код проще читать: GameFSM.ts = всё о FSM

## Зависимости

Нет. Можно делать когда угодно, но лучше после ref_01 (меньше зависимостей в Game.ts).
