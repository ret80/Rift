# План реализации поддержки геймпада

> Дата: 2026-11-01
> Статус: **выполнен** ✅

## 1. Анализ

Проект «РАЗЛОМ // СЕКТОР-9» — top-down space shooter на кастомном ECS-движке (trixt0r/ecs).
Ввод обрабатывается двумя изолированными системами:

- **InputManager** (`src/game/input.ts`) — клавиатура (WASD/стрелки) + тач-джойстик → нормализованный `MoveAxis { x, y }`
- **InputSystem** (`src/game/systems/InputSystem.ts`) — мышь (прицеливание) + тач (стрельба) → события `onAimUpdate`, `onFiringChanged`

Существующая архитектура чётко разделяет **абстракцию ввода** и **потребление ввода** системами (PlayerSystem, WeaponManager и т.д.). Это идеальная основа для расширения.

**Требования:**
- Левый стик / крестовина (D-pad) — перемещение игроателя
- Кнопка A (Cross) — применить / войти / подтвердить
- Кнопка B (Circle) — назад / отмена

## 2. Архитектурные решения

### 2.1. GamepadManager — новый модуль ввода

Создаём `src/game/gamepad.ts` — аналог InputManager, но для геймпада.

- Использует Web Gamepad API (`navigator.getGamepadEvent`, `navigator.getGamepads()`)
- Опрос состояния в каждом кадре игрового цикла
- Поддержка стандартных раскладок (Xbox, PlayStation, HID)
- Мёржит данные стика и D-pad (D-pad имеет приоритет при активном стике)
- Мёржит данные двух стиков (левый — движение, правый — прицеливание, если нужно в будущем)
- Мёржит кнопки (A, B, и другие для будущего расширения)

### 2.2. Интеграция с InputManager

InputManager расширяется для поддержки геймпада как дополнительного источника ввода:

- `InputManager` получает опциональную ссылку на `GamepadManager`
- Геттер `axis()` объединяет клавиатуру, тач и геймпад (геймпад имеет приоритет)
- Добавляются виртуальные коды клавиш: `"GamepadA"`, `"GamepadB"`, `"GamepadStart"`
- `consumePress()` поддерживает эти виртуальные коды

### 2.3. Интеграция с UI

- При подключении геймпада — показывать подсказки с кнопками геймпада вместо/вместе с клавиатурными
- Кнопка A → «Войти/Применить»
- Кнопка B → «Назад/Отмена»
- Навигация по меню стрелками/стиком (опционально, в будущем)

### 2.4. SOLID-принципы

- **SRP**: GamepadManager отвечает только за опрос геймпада и нормализацию данных
- **OCP**: Новый источник ввода добавляется без изменения существующего кода InputManager (через интерфейс)
- **LSP**: Все источники ввода реализуют единый интерфейс `InputSource`
- **ISP**: Узкие интерфейсы: `MovementInputSource`, `ButtonInputSource`
- **DIP**: Системы зависят от абстракций ввода, а не от конкретных реализаций

## 3. Реализация

### Этап 1: Абстракция ввода (фундамент)

**Файл:** `src/game/input.ts`

Создаём интерфейс `InputSource` для единообразной интеграции источников ввода:

```typescript
export interface MoveAxis {
  x: number;
  y: number;
}

export interface InputSource {
  axis: MoveAxis;
}
```

InputManager реализует `InputSource`. Это позволит GamepadManager иметь ту же сигнатуру.

### Этап 2: GamepadManager

**Файл:** `src/game/gamepad.ts` (новый)

```
GamepadManager
├── poll()              — опрос состояния геймпада каждый кадр
├── axis                — нормализованная ось движения (левый стик + D-pad)
├── isButton(code)      — проверка зажатой кнопки
├── consumePress(code)  — одноразовое нажатие кнопки
├── isConnected         — флаг подключения
├── deadzone            — мёртвая зона стика (по умолчанию 0.15)
└── buttonDeadzone      — мёртвая зона кнопок (по умолчанию 0.5)
```

**Маппинг кнопок (стандартный Gamepad API):**

| Функция | Кнопка PlayStation | Кнопка Xbox | Виртуальный код |
|---------|-------------------|-------------|-----------------|
| Подтвердить | 0 (Cross/A) | 0 (A) | `"GamepadA"` |
| Отмена | 1 (Circle/B) | 1 (B) | `"GamepadB"` |
| Пауза | 9 (Options) | 8 (Start) | `"GamepadStart"` |
| Левый стик | — | — | оси 0, 1 |
| Правый стик | — | — | оси 2, 3 |
| D-pad вверх | 12 | 12 | — |
| D-pad вниз | 13 | 13 | — |
| D-pad влево | 14 | 14 | — |
| D-pad вправо | 15 | 15 | — |
| LB | 4 (L1) | 4 (LB) | — |
| RB | 5 (R1) | 5 (RB) | — |

**Логика мёрджа стик/D-pad:**
- Если левый стик выходит за мёртвую зону → используем стик
- Иначе если D-pad активен → используем D-pad
- Иначе { x: 0, y: 0 }

### Этап 3: Интеграция в InputManager

**Файл:** `src/game/input.ts` (модификация)

- Добавляем поддержку `consumePress()` для виртуальных кодов геймпада
- `axis()` возвращает ось геймпада с наивысшим приоритетом, если геймпад подключён
- Геймпад имеет наивысший приоритет (перекрывает клавиатуру и тач)

### Этап 4: Подключение в GameContext

**Файл:** `src/game/core/GameContext.ts` (модификация)

- Создаём экземпляр `GamepadManager`
- Передаём ссылку в `InputManager` через новый метод `setGamepadSource()`
- Регистрируем обработчики событий `gamepadconnected` / `gamepaddisconnected`

### Этап 5: Обработка кнопок в UI

**Файл:** `src/hooks/useGameActions.ts` (модификация)

- Добавляем обработку нажатий `GamepadA` и `GamepadB` для навигации по меню
- `GamepadA` → действия подтверждения (начать игру, открыть настройки, применить и т.д.)
- `GamepadB` → действия отмены (назад, закрыть меню)

**Файл:** `src/ui/GameOverlays.tsx` (модификация)

- При подключённом геймпаде — показывать подсказки с иконками кнопок геймпада
- Иконки: ✕ (A) и ○ (B) — Unicode-символы или SVG-иконки

### Этап 6: Обработка в игровом процессе

**Файл:** `src/game/systems/PlayerSystem.ts` (модификация)

- Уже использует `this.input.axis` — изменения не требуются (геймпад автоматически интегрируется)
- Добавить проверку `consumePress("GamepadStart")` для паузы (дублирует P/Escape)

## 4. Файлы для изменения

| Файл | Действие | Описание |
|------|----------|----------|
| `src/game/gamepad.ts` | **Создан** ✅ | GamepadManager — опрос геймпада, нормализация осей и кнопок |
| `src/game/input.ts` | **Модифицирован** ✅ | Добавлена поддержка GamepadManager, виртуальные коды кнопок |
| `src/game/core/GameContext.ts` | **Модифицирован** ✅ | Создан GamepadManager, подключён к InputManager, polling в handleDebugKeys |
| `src/game/core/GameHooks.ts` | **Модифицирован** ✅ | Добавлены onGamepadConfirm/onGamepadCancel |
| `src/hooks/useGameLifecycle.ts` | **Модифицирован** ✅ | Прокладка геймпад-хуков |
| `src/App.tsx` | **Модифицирован** ✅ | Обработка GamepadA/GamepadB для навигации, tracking gamepad state |
| `src/ui/GameOverlays.tsx` | **Модифицирован** ✅ | Передача isGamepad в оверлеи |
| `src/ui/screens/PauseOverlay.tsx` | **Модифицирован** ✅ | Подсказки кнопок ✕/○ в паузе |
| `src/ui/screens/GameOverScreen.tsx` | **Модифицирован** ✅ | Подсказки кнопок ✕/○ в game over |
| `src/game/game.ts` | **Модифицирован** ✅ | Геттер isGamepadConnected |

## 5. Порядок реализации

1. **[P0] ✅** `src/game/gamepad.ts` — GamepadManager (опрос, оси, кнопки)
2. **[P0] ✅** `src/game/input.ts` — интеграция GamepadManager в InputManager
3. **[P0] ✅** `src/game/core/GameContext.ts` — создание и подключение GamepadManager
4. **[P1] ✅** `src/game/core/GameContext.ts` — пауза через GamepadStart (в handleDebugKeys)
5. **[P1] ✅** `src/game/core/GameHooks.ts` — хуки onGamepadConfirm/onGamepadCancel
6. **[P1] ✅** `src/hooks/useGameLifecycle.ts` — прокидка геймпад-хуков
7. **[P1] ✅** `src/App.tsx` — обработка GamepadA/GamepadB для навигации
8. **[P2] ✅** `src/ui/GameOverlays.tsx` — подсказки кнопок геймпада
9. **[P2] ✅** `src/ui/screens/PauseOverlay.tsx` — подсказки кнопок в паузе
10. **[P2] ✅** `src/ui/screens/GameOverScreen.tsx` — подсказки кнопок в game over
11. **[P2] ✅** `src/game/game.ts` — геттер isGamepadConnected

## 6. Реализация

### Что реализовано

**GamepadManager** (`src/game/gamepad.ts`):
- Опрос через `navigator.getGamepads()` каждый кадр
- Нормализация оси движения: левый стик + D-pad (автоматическое переключение)
- Мёртвая зона стика: 0.15 (настраивается)
- Кнопки: A (подтвердить), B (отмена), Start (пауза), D-pad
- Одноразовые нажатия через `consumePress()`
- Автоматическое обнаружение подключения/отключения

**Интеграция с InputManager** (`src/game/input.ts`):
- `setGamepadSource()` — подключение GamepadManager
- `axis` — геймпад имеет наивысший приоритет
- `consumePress()` — поддержка виртуальных кодов геймпада
- `clear()` — сброс состояния геймпада при паузе

**GameContext** (`src/game/core/GameContext.ts`):
- Создание GamepadManager в конструкторе
- Подключение к InputManager
- Polling в `handleDebugKeys()` каждый кадр
- Пауза через GamepadStart
- Хуки onGamepadConfirm/onGamepadCancel
- Обработчики gamepadconnected/gamepaddisconnected

**UI навигация** (`src/App.tsx`):
- GamepadA → подтверждение (старт, продолжить, рестарт)
- GamepadB → отмена (назад, в меню)
- Зависит от текущего экрана (menu/settings/game/pause/gameover)

**Подсказки кнопок**:
- PauseOverlay — ✕ (A) и ○ (B) на кнопках
- GameOverScreen — ✕ (A) и ○ (B) на кнопках

### Архитектурные решения

- **Приоритет ввода**: геймпад > клавиатура/тач (в axis getter)
- **Опрос**: в `handleDebugKeys()` — каждый кадр, до игровых систем
- **Хуки**: onGamepadConfirm/onGamepadCancel в GameHooks — decoupled от UI
- **Типизация**: GamepadInputSource — узкий интерфейс для InputManager (без циклических зависимостей)

## 7. Тестирование

- Проверить на нескольких типах геймпадов (Xbox, PlayStation, generic HID)
- Проверить мёртвые зоны стика и D-pad
- Проверить корректную обработку отключения геймпада
- Проверить, что клавиатура и тач-управление работают при отключённом геймпаде
- Проверить приоритет ввода (геймпад перекрывает клавиатуру)

## 7. Риски и ограничения

- **Браузерная совместимость**: Web Gamepad API поддерживается в Chrome, Firefox, Edge, Safari 16.4+. Для Safari < 16.4 — graceful degradation
- **Мультигеймпад**: API поддерживает до 4 геймпадов. Берём первый подключённый
- **Haptic feedback**: Не реализовано (требует отдельной работы с GamepadHapticActuator)
- **Калибровка стиков**: Мёртвая зона настраивается, но калибровка под конкретное устройство не предусмотрена (ограничение Web Gamepad API)
