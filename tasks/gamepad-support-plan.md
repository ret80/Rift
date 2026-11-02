# План реализации поддержки геймпада

> Дата: 2026-11-01
> Статус: **этап 1 выполнен** ✅, **этап 2 выполнен** ✅

## 1. Анализ

Проект «РАЗЛОМ // СЕКТОР-9» — top-down space shooter на кастомном ECS-движке (trixt0r/ecs).
Ввод обрабатывается двумя изолированными системами:

- **InputManager** (`src/game/input.ts`) — клавиатура (WASD/стрелки) + тач-джойстик → нормализованный `MoveAxis { x, y }`
- **InputSystem** (`src/game/systems/InputSystem.ts`) — мышь (прицеливание) + тач (стрельба) → события `onAimUpdate`, `onFiringChanged`

Существующая архитектура чётко разделяет **абстракцию ввода** и **потребление ввода** системами.

### Этап 1 — Базовая поддержка ✅ (выполнен)

- Левый стик / крестовина (D-pad) — перемещение игрока в игре
- Кнопка A (Cross) — подтвердить / войти
- Кнопка B (Circle) — назад / отмена
- Кнопка Start — пауза
- Подсказки кнопок в оверлеях

### Этап 2 — Полная навигация по UI ✅ (выполнен)

**Требования:**

1. **Управление в игре**: левый стик / D-pad — перемещение игрока. Кнопка Start — пауза.
2. **Главное меню и пауза**: игрок перемещается по кнопкам вверх/вниз с помощью D-pad и левого стика.
3. **Экран прокачки**: D-pad / левый стик влево/вправо — навигация по кнопкам списка. Кнопка A — подтвердить покупку. Вкладки переключаются кнопками L / R.
4. **Кнопка Start**: вызывает паузу из игры, при повторном нажатии закрывает паузу.
5. **Кнопка B**: в меню с кнопкой «Назад» заменяет нажатие «Назад».
6. **Настройки**: D-pad / стик вверх/вниз — перемещение по пунктам. Слайдер: влево/вправо — регулировка. Выпадающий список: A — открыть, B — закрыть, навигация вверх/вниз, A — подтвердить выбор.
7. **Визуальный индикатор фокуса**: жёлтая рамка / подложка / линия под выделенным элементом.

**Расширенные кнопки геймпада:**
- D-pad (up/down/left/right) — навигация в меню
- Left Stick (x/y) — навигация в меню
- A, B, X, Y, L, R, Start, Select

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
| `src/game/core/GameHooks.ts` | **Модифицирован** ✅ | Добавлены onGamepadConfirm/Cancel/NavUp/NavDown/NavLeft/NavRight |
| `src/hooks/useGameLifecycle.ts` | **Модифицирован** ✅ | Прокладка геймпад-хуков (навигация) |
| `src/hooks/useGamepadFocus.ts` | **Создан** ✅ | Хук управления фокусом для навигации геймпада |
| `src/App.tsx` | **Модифицирован** ✅ | Полная обработка геймпада: Start, A, B, навигация |
| `src/ui/GameOverlays.tsx` | **Модифицирован** ✅ | Передача isGamepad в оверлеи |
| `src/ui/ScreenRouter.tsx` | **Модифицирован** ✅ | Передача gamepad props в экраны |
| `src/ui/components/GameButton.tsx` | **Модифицирован** ✅ | Поддержка gamepadFocused + визуальная подсветка |
| `src/ui/upgrade/TabButton.tsx` | **Модифицирован** ✅ | Поддержка gamepadFocused + визуальная подсветка |
| `src/ui/screens/MainMenu.tsx` | **Модифицирован** ✅ | Gamepad-навигация по кнопкам |
| `src/ui/screens/PauseOverlay.tsx` | **Модифицирован** ✅ | Gamepad-навигация + подсказки кнопок |
| `src/ui/screens/GameOverScreen.tsx` | **Модифицирован** ✅ | Gamepad-навигация + подсказки кнопок |
| `src/ui/screens/SettingsScreen.tsx` | **Модифицирован** ✅ | Gamepad-навигация по настройкам |
| `src/ui/upgrade/UpgradeScreen.tsx` | **Модифицирован** ✅ | Переключение вкладок L/R |
| `src/game/game.ts` | **Модифицирован** ✅ | Геттер isGamepadConnected |

## 5. Порядок реализации

1. **[P0] ✅** `src/game/gamepad.ts` — GamepadManager (опрос, оси, кнопки)
2. **[P0] ✅** `src/game/input.ts` — интеграция GamepadManager в InputManager
3. **[P0] ✅** `src/game/core/GameContext.ts` — создание и подключение GamepadManager
4. **[P1] ✅** `src/game/core/GameContext.ts` — пауза через GamepadStart (в handleDebugKeys)
5. **[P1] ✅** `src/game/core/GameHooks.ts` — хуки onGamepadConfirm/Cancel/NavUp/NavDown/NavLeft/NavRight
6. **[P1] ✅** `src/hooks/useGameLifecycle.ts` — прокидка геймпад-хуков
7. **[P1] ✅** `src/App.tsx` — полная обработка GamepadA/GamepadB/навигации
8. **[P2] ✅** `src/ui/GameOverlays.tsx` — подсказки кнопок геймпада
9. **[P2] ✅** `src/ui/screens/PauseOverlay.tsx` — подсказки кнопок в паузе
10. **[P2] ✅** `src/ui/screens/GameOverScreen.tsx` — подсказки кнопок в game over
11. **[P2] ✅** `src/game/game.ts` — геттер isGamepadConnected
12. **[P2] ✅** `src/hooks/useGamepadFocus.ts` — хук управления фокусом
13. **[P2] ✅** `src/ui/components/GameButton.tsx` — поддержка gamepadFocused
14. **[P2] ✅** `src/ui/upgrade/TabButton.tsx` — поддержка gamepadFocused
15. **[P2] ✅** `src/ui/ScreenRouter.tsx` — передача gamepad props
16. **[P2] ✅** `src/ui/screens/MainMenu.tsx` — gamepad навигация
17. **[P2] ✅** `src/ui/screens/SettingsScreen.tsx` — gamepad навигация
18. **[P2] ✅** `src/ui/screens/GameOverScreen.tsx` — gamepad навигация
19. **[P2] ✅** `src/ui/upgrade/UpgradeScreen.tsx` — переключение вкладок L/R

## 6. Реализация

### Что реализовано

**GamepadManager** (`src/game/gamepad.ts`):
- Опрос через `navigator.getGamepads()` каждый кадр
- Нормализация оси движения: левый стик + D-pad (автоматическое переключение)
- Мёртвая зона стика: 0.15 (настраивается)
- Все кнопки: A, B, X, Y, LB, RB, LT, RT, Start, Select, L3, R3, D-pad
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
- Пауза через GamepadStart (только Start, D-pad не используется для паузы)
- Хуки onGamepadConfirm/Cancel/NavUp/NavDown/NavLeft/NavRight
- Обработчики gamepadconnected/gamepaddisconnected

**useGamepadFocus** (`src/hooks/useGamepadFocus.ts`):
- Управление индексом фокуса для навигации геймпада
- Поддержка навигации up/down/left/right
- Автоматический сброс направления через 300мс

**GameButton** (`src/ui/components/GameButton.tsx`):
- Поддержка `gamepadFocused` пропса
- Визуальная подсветка: жёлтая рамка + подложка + свечение
- Поддержка `onConfirm` обработчика

**TabButton** (`src/ui/upgrade/TabButton.tsx`):
- Поддержка `gamepadFocused` пропса
- Визуальная подсветка при фокусе

**ScreenRouter** (`src/ui/ScreenRouter.tsx`):
- Передача `isGamepad` и навигационных хуков в экраны
- MainMenu: навигация up/down, confirm
- SettingsScreen: навигация up/down/left/right, confirm
- UpgradeScreen: табы L/R, confirm

**MainMenu** (`src/ui/screens/MainMenu.tsx`):
- Gamepad-навигация по кнопкам (Play, Upgrade, Settings, Help, Debug)
- D-pad up/down + стик → перемещение фокуса
- Кнопка A → подтвердить выбор
- Визуальный индикатор фокуса (жёлтая рамка)

**PauseOverlay** (`src/ui/screens/PauseOverlay.tsx`):
- Gamepad-навигация по кнопкам (Resume, Settings, Exit)
- D-pad up/down + стик → перемещение фокуса
- Кнопка A → подтвердить выбор
- Кнопка B → в главное меню

**GameOverScreen** (`src/ui/screens/GameOverScreen.tsx`):
- Gamepad-навигация по кнопкам (Retry, Menu, Upgrade)
- D-pad up/down + стик → перемещение фокуса
- Кнопка A → подтвердить выбор
- Кнопка B → в главное меню

**UpgradeScreen** (`src/ui/upgrade/UpgradeScreen.tsx`):
- Переключение вкладок кнопками L/R (LB/RB)
- Визуальный индикатор активной вкладки
- Поддержка gamepad-focused на вкладках

**SettingsScreen** (`src/ui/screens/SettingsScreen.tsx`):
- Навигация по пунктам настроек
- Слайдеры: левый/правый для регулировки
- Выпадающие списки: A — открыть, B — закрыть

**App.tsx**:
- Полная обработка геймпада: Start, A, B, навигация
- Start — пауза/продолжение
- A — подтверждение (зависит от экрана)
- B — отмена/назад (зависит от экрана)
- Навигационные хуки прокидываются в ScreenRouter

**Подсказки кнопок**:
- PauseOverlay — ✕ (A) и ○ (B) на кнопках
- GameOverScreen — ✕ (A) и ○ (B) на кнопках

### Архитектурные решения

- **Приоритет ввода**: геймпад > клавиатура/тач (в axis getter)
- **Опрос**: в `handleDebugKeys()` — каждый кадр, до игровых систем
- **Хуки**: onGamepadConfirm/Cancel/NavUp/NavDown/NavLeft/NavRight в GameHooks — decoupled от UI
- **Типизация**: GamepadInputSource — узкий интерфейс для InputManager (без циклических зависимостей)
- **Визуальный индикатор**: inline CSS-классы при `gamepadFocused=true` — жёлтая рамка `border-[#ffb84d]` + подложка `bg-[#ffb84d]/10` + свечение `shadow-[0_0_12px_rgba(255,184,77,0.3)]`
- **Навигация**: каждый экран самостоятельно управляет фокусом через `useGamepadFocus`
- **Пауза**: только кнопка Start, D-pad не используется (конфликт с навигацией)

## 7. Тестирование

- Проверить на нескольких типах геймпадов (Xbox, PlayStation, generic HID)
- Проверить мёртвые зоны стика и D-pad
- Проверить корректную обработку отключения геймпада
- Проверить, что клавиатура и тач-управление работают при отключённом геймпаде
- Проверить приоритет ввода (геймпад перекрывает клавиатуру)

## 8. Этап 2 — Архитектурные решения

### 8.1. Расширение GamepadManager

Добавляем поддержку всех кнопок:
- **X** (2), **Y** (3) — дополнительные кнопки (на будущее)
- **L** (4/LB), **R** (5/RB) — переключение вкладок в прокачке
- **Select** (9) — на будущее
- **LT** (6/L2), **RT** (7/R2) — триггеры, на будущее
- **L3** (10), **R3** (11) — нажатие стиков, на будущее

**Важно**: D-pad **НЕ** используется для паузы — конфликт с навигацией по меню.
Только Start — пауза.

### 8.2. Навигация по UI — GamepadFocusManager

Создаём хук `useGamepadFocus` для каждого меню-экрана:
- Поддерживает список интерактивных элементов
- D-pad up/down + left stick y → перемещение фокуса вверх/вниз
- D-pad left/right + left stick x → перемещение фокуса влево/вправо (для вкладок)
- Визуальный индикатор: жёлтая рамка (`border-[#ffb84d]`) + подложка

### 8.3. Интеграция с ScreenRouter

Каждый экран получает:
- `gamepadFocus` — текущий индекс фокуса
- `gamepadFocusDir` — направление навигации (up/down/left/right)
- `gamepadConfirm` — нажатие A
- `gamepadCancel` — нажатие B
- `gamepadTabLeft` — нажатие L
- `gamepadTabRight` — нажатие R

### 8.4. Визуальный индикатор

CSS-класс `.gamepad-focus` для выделенного элемента:
```css
.gamepad-focus {
  border-color: #ffb84d !important;
  background: rgba(255, 184, 77, 0.08) !important;
  box-shadow: 0 0 12px rgba(255, 184, 77, 0.3) !important;
}
```

## 9. Порядок реализации этапа 2

1. **[P0] ✅** Расширить GamepadManager: кнопки X, Y, LB, RB, Select
2. **[P0] ✅** Убрать D-pad из паузы (только Start)
3. **[P0] ✅** Расширить GameHooks: `onGamepadNavUp/Down/Left/Right`
4. **[P0] ✅** Расширить GameLifecycleCallbacks: навигационные хуки
5. **[P1] ✅** Создать `useGamepadFocus` хук
6. **[P1] ✅** Обновить App.tsx: полная обработка навигации геймпада
7. **[P1] ✅** MainMenu: навигация (up/down), A — выбор
8. **[P1] ✅** UpgradeScreen: навигация (up/down), табы L/R, A — покупка
9. **[P1] ✅** SettingsScreen: навигация (up/down), слайдеры (left/right), dropdown (A/B)
10. **[P2] ✅** GameOverScreen: навигация (up/down), A — выбор
11. **[P2] ✅** PauseOverlay: навигация (up/down), A — выбор
12. **[P2] ✅** Визуальный индикатор фокуса (жёлтая рамка + подложка + свечение)

## 7. Риски и ограничения

- **Браузерная совместимость**: Web Gamepad API поддерживается в Chrome, Firefox, Edge, Safari 16.4+. Для Safari < 16.4 — graceful degradation
- **Мультигеймпад**: API поддерживает до 4 геймпадов. Берём первый подключённый
- **Haptic feedback**: Не реализовано (требует отдельной работы с GamepadHapticActuator)
- **Калибровка стиков**: Мёртвая зона настраивается, но калибровка под конкретное устройство не предусмотрена (ограничение Web Gamepad API)
- **Мёртвая зона навигации**: Для D-pad в меню — отдельная мёртвая зона (0.3), чтобы избежать случайных сдвигов
