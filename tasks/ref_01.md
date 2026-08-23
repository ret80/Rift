# ref_01 — Удаление мёртвого кода (Фаза 1)

## Цель
Удалить все неиспользуемые файлы и дубликаты — ~850 строк мёртвого кода.

## Обоснование (проверено анализом импортов)

### ✅ Мёртвые файлы (0 импортов)

| Файл | Строки | Проверка |
|------|--------|----------|
| `src/game/entities/Player.ts` | 273 | 0 импортов. `game.ts` использует `systems/PlayerSystem.ts` |
| `src/game/entities/Enemy.ts` | 133 | 0 импортов. `game.ts` использует `types.ts` (interface Enemy) |
| `src/game/progression/ScoreManager.ts` | 174 | 0 импортов. `game.ts` использует `systems/ScoringSystem.ts` |
| `src/game/core/PhysicsSystem.ts` | 222 | Импорт только как тип в `CollisionSystem.ts`, но `setPhysicsSystem()` НИКОГДА не вызывается. Экземпляры не создаются. |

### ⚠️ НЕ мёртвые файлы (ИСПОЛЬЗУЮТСЯ)

| Файл | Строки | Статус | Почему НЕ удалять |
|------|--------|--------|-------------------|
| `src/game/core/GameFSM.ts` | 154 | **Используется** | Импорт в `game.ts:39` (`GameFSMContext`) и `FSMBridge.ts:14` |
| `src/game/core/FSMBridge.ts` | 108 | **Используется** | Импорт в `game.ts:40`. Это активный FSM мост |

### Вывод по GameFSM
`GameFSM.ts` **НЕЛЬЗЯ УДАЛЯТЬ** — он экспортирует `GameFSMContext` и `GameStateId`, которые импортируются в `game.ts` и `FSMBridge.ts`.

**Решение:** Переместить интерфейсы из `GameFSM.ts` в `FSMBridge.ts`, удалить `createGameFSM` (не используется) и `TRANSITIONS` (дублируются в FSMBridge).

## Задачи

### Task 1.1: Удалить `entities/Player.ts`
```bash
rm src/game/entities/Player.ts
# Проверить что директория пуста (кроме возможно Enemy.ts)
```

### Task 1.2: Удалить `entities/Enemy.ts`  
```bash
rm src/game/entities/Enemy.ts
rmdir src/game/entities/  # если пусто
```

### Task 1.3: Удалить `progression/ScoreManager.ts`
```bash
rm src/game/progression/ScoreManager.ts
rmdir src/game/progression/  # если пусто
```

### Task 1.4: Удалить `core/PhysicsSystem.ts`
```bash
rm src/game/core/PhysicsSystem.ts
# CollisionSystem.ts имеет import type { PhysicsSystem } — оставить (type import, безопасен)
```

### Task 1.5: Рефакторить `GameFSM.ts` → `FSMBridge.ts`

**Текущее состояние:**
- `GameFSM.ts` экспортирует: `GameStateId`, `GameFSMContext`, `createGameFSM`
- `FSMBridge.ts` импортирует: `GameFSMContext`, `GameStateId` из `GameFSM.ts`
- `game.ts` импортирует: `GameFSMContext` из `GameFSM.ts`
- `createGameFSM()` нигде не используется
- `TRANSITIONS` в GameFSM.ts дублируются в FSMBridge.ts

**Действия:**
1. Переместить интерфейс `GameFSMContext` из `GameFSM.ts` в `FSMBridge.ts`
2. Переместить type `GameStateId` из `GameFSM.ts` в `FSMBridge.ts`
3. Удалить `GameFSM.ts` полностью
4. Обновить `FSMBridge.ts`:
   - Удалить `import type { GameFSMContext, GameStateId } from "./GameFSM"`
   - Добавить интерфейсы локально
5. Обновить `game.ts`:
   - Удалить `import { type GameFSMContext } from "./core/GameFSM"`
   - Добавить `import type { GameFSMContext, GameStateId } from "./core/FSMBridge"`

## Критерии готовности
- [ ] 4 мёртвых файла удалены
- [ ] 2 пустые директории удалены (`entities/`, `progression/`)
- [ ] `GameFSM.ts` удалён, типы перемещены в `FSMBridge.ts`
- [ ] `npm run typecheck` без ошибок
- [ ] `npm run build` без ошибок

## Ожидаемый результат
- Удалено: ~930 строк мёртвого кода
- Файлов удалено: 5
- Директорий удалено: 2
