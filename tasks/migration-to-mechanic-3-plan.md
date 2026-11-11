# План миграции РАЗЛОМа на Механику 3 («Рогалик + Мета + Асценсия»)

**Основание:**  
- `docs/gdd-mechanic-3.md` — целевой дизайн  
- `docs/gameplay-mechanics-analysis.md` — анализ механик  
- `tasks/gameplay-replayability-audit-2026-11-05.md` — аудит реиграбельности  
- `tasks/gameplay-replayability-assessment-2026-11-05.md` — оценка мер  
- Текущий код: `src/`

**Дата:** 11 ноября 2026  
**Статус:** в процессе (частично выполнено; см. отметки ⏳/✅)

---

## 1. Цель и scope

Перевести игру с **Механики 1** (перманентный прогресс, смерть = откат волны) на **Механику 3** (рогалик-забеги + мета-кредиты + асценсия + доктрины + наследие), описанную в `docs/gdd-mechanic-3.md`.

**В scope:**
- Сброс забега при смерти + начисление кредитов.
- Мета-дерево (Зеркало Ночи) с ветками.
- Разблокировки (оружие, дроны, способности) за кредиты/достижения.
- Доктрины и Наследие (артефакты).
- Асценсия (Threat Levels + модификаторы).
- Новые враги (8 архетипов) + элиты + боссы.
- Новое оружие (4 вида) + альтернативный огонь + эволюции.
- Дроны: роли + режимы + lock-on.
- Активный щит, рывок (уже есть), выбор цели.
- Якоря, буря, сжатие, клещи (частично есть).
- UI: экраны мета, доктрин, наследия, асценсии, радар.

**Вне scope (отложено):**
- Арены-модификаторы (эллипс, квадрат, кольцо, порталы) — этап 10.
- Монетизация, мультиплеер, серверная часть.
- Переход на другой движок/рендер.

---

## 2. Текущее состояние (что уже есть)

### 2.1. Реализовано (из аудита)

| Мера | Статус | Файлы |
|---|---|---|
| E1–E4 (количество врагов, скорость, минёр, тактический режим) | ✅ | `balance/waves.ts`, `balance/enemies.ts`, `ai/strategies/MinerStrategy.ts` |
| A1 (сжатие зоны) | ✅ | `waves/ZoneModel.ts` |
| A4 (враги заходят на кромку) | ✅ | `ai/strategies/*`, `ai/EnemyAvoidance.ts` |
| A2 (буря на кромке) | ✅ | `waves/ZoneStorm.ts` |
| B1 (Threat Director) | ✅ | `ai/ThreatDirector.ts` |
| B5 (рывок) | ✅ | `systems/PlayerMovement.ts`, `core/PlayerControls.ts` |
| D1 (цена оружия 420) | ✅ | `upgrades.ts` |
| D3 (graze/комбо/чистая зачистка) | ✅ | `systems/GrazeSystem.ts`, `systems/ScoringSystem.ts` |
| D4 (орудия 2 уровня) | ✅ | `upgrades.ts` |
| D8 (скорость цена) | ✅ | `upgrades.ts` |

### 2.2. Частично реализовано

| Компонент | Статус | Комментарий |
|---|---|---|
| Боссы | ✅ | `ai/strategies/BossStrategy.ts`, каждые 10 волн |
| Минёр | ✅ | `ai/strategies/MinerStrategy.ts` |
| Зона (сжатие, буря) | ✅ | `waves/ZoneModel.ts`, `waves/ZoneStorm.ts` |
| Threat Director | ✅ | `ai/ThreatDirector.ts` |
| Рывок | ✅ | работает |
| Graze/комбо | ✅ | работает |

### 2.3. Не реализовано (gap)

| Компонент GDD | Статус | Приоритет |
|---|---|---|
| Сброс забега при смерти + кредиты | ⏳ | P0 | (кредиты ✅, полный сброс улучшений — Этап 8)
| Мета-дерево (Зеркало Ночи) | ⏳ | P0 | (MetaScreen + MetaStorage ✅, стабы MetaTree/Unlock ⏳)
| Разблокировки за кредиты/достижения | ❌ | P0 |
| Доктрины | ❌ | P1 |
| Наследие (артефакты) | ❌ | P1 |
| Асценсия (Threat Levels) | ❌ | P1 |
| Новые враги (8 архетипов) | ❌ | P0/P1 |
| Элиты (аффиксы) | ❌ | P1 | (affixes.ts ✅, применение ⏳)
| Новое оружие (рельса, флак, тетер, пожиратель) | ❌ | P0/P1 |
| Альтернативный огонь | ❌ | P1 |
| Эволюции оружия | ❌ | P2 |
| Дроны: роли (разведчик/штурмовик/часовой) | ❌ | P1 |
| Дроны: режимы (сопровождение/штурм/удержание) | ⏳ | P1 | (DroneCommandSystem ✅, интеграция ⏳)
| Lock-on (выбор цели) | ⏳ | P1 | (LockOnSystem ✅, интеграция ⏳)
| Активный щит | ⏳ | P1 | (ActiveShieldSystem ✅, интеграция ⏳)
| Якоря-разломы | ✅ | P0 |
| Клещи на спавне | ❌ | P1 |
| Радар | ⏳ | P1 | (RadarSystem ✅, UI ⏳)
| Экраны мета/доктрин/наследия/асценсии | ⏳ | P1 | (MetaScreen ✅, остальные ❌)
| Банк деталей (10% сохранение) | ❌ | P2 |

---

## 3. Архитектурные изменения

### 3.1. Новые системы (создать)

| Система | Назначение | Файл |
|---|---|---|
| `CreditSystem` | Начисление кредитов по формуле | `src/game/systems/CreditSystem.ts` |
| `MetaTree` | Зеркало Ночи: таланты с ветками | `src/game/meta/MetaTree.ts` |
| `UnlockSystem` | Разблокировки за кредиты/достижения | `src/game/meta/UnlockSystem.ts` |
| `DoctrineSystem` | Доктрины: выбор и применение | `src/game/meta/DoctrineSystem.ts` |
| `LegacySystem` | Артефакты наследия | `src/game/meta/LegacySystem.ts` |
| `AscensionSystem` | Threat Levels + модификаторы | `src/game/meta/AscensionSystem.ts` |
| `AnchorSystem` | Якоря-разломы | `src/game/systems/AnchorSystem.ts` |
| `RadarSystem` | Радар и индикаторы за кадром | `src/game/systems/RadarSystem.ts` |
| `LockOnSystem` | Выбор цели | `src/game/systems/LockOnSystem.ts` |
| `DroneCommandSystem` | Приказы дронам | `src/game/systems/DroneCommandSystem.ts` |
| `ActiveShieldSystem` | Активный щит (сектор) | `src/game/systems/ActiveShieldSystem.ts` |

### 3.2. Модификации существующих систем

| Система | Изменение |
|---|---|
| `GameFSM` | Добавить состояния: `meta`, `doctrine_select`, `legacy_select`, `ascension`. Переход `restart` → выбор доктрины/наследия → `playing`. |
| `DeathSystem` | При смерти: начислить кредиты, сохранить разблокировки, сбросить забег (детали, улучшения, оружие). |
| `GameUpgrades` | Разделить на «забеговые» (parts) и «мета» (credits). Забеговые сбрасываются при смерти. |
| `upgrades.ts` | Добавить мета-дерево, доктрины, наследие, асценсию. |
| `SpawnSystem` | Добавить клещи (pincer), якоря, элиты. |
| `EnemyAI` | Добавить новые стратегии (8 архетипов). |
| `WeaponManager` | Добавить новое оружие, альтернативный огонь, эволюции. |
| `DroneSystem` | Добавить роли и режимы. |
| `HudLayer` | Добавить радар, индикатор рывка, лок, режим дронов. |
| `GameOverScreen` | Добавить кредиты, разблокировки, статистику. |
| `MainMenu` | Добавить экраны мета/доктрин/наследия/асценсии. |
| `storageKeys` | Добавить ключи для мета, доктрин, наследия, TL, статистики. |

### 3.3. Новые типы и данные

| Файл | Содержание |
|---|---|
| `src/game/meta/types.ts` | Типы: CreditState, MetaTalent, Doctrine, LegacyArtifact, ThreatLevel, Unlock |
| `src/game/meta/doctrines.ts` | Список 12 доктрин с эффектами |
| `src/game/meta/legacy.ts` | Список 12 артефактов |
| `src/game/meta/ascension.ts` | 15 модификаторов TL |
| `src/game/meta/unlocks.ts` | Список достижений и разблокировок |
| `src/game/balance/enemies.ts` | Добавить 8 новых EnemyKind + базы |
| `src/game/balance/affixes.ts` | Новые файл: аффиксы элит |

### 3.4. Новые UI-экраны

| Экран | Файл | Назначение |
|---|---|---|
| Мета-дерево | `src/ui/screens/MetaTreeScreen.tsx` | Зеркало Ночи, ветки, покупка |
| Арсенал | `src/ui/screens/ArmoryScreen.tsx` | Оружие, дроны, линии |
| Доктрины | `src/ui/screens/DoctrinesScreen.tsx` | Выбор доктрины |
| Наследие | `src/ui/screens/LegacyScreen.tsx` | Слоты артефактов |
| Асценсия | `src/ui/screens/AscensionScreen.tsx` | TL, модификаторы |
| Радар (компонент) | `src/ui/components/Radar.tsx` | Радар в HUD |

---

## 4. Поэтапный план

### Этап 0: Подготовка (1–2 дня) ✅ ВЫПОЛНЕНО

**Задачи:**
1. ✅ Создать ветку `feature/mechanic-3`.
2. ✅ Создать структуру папок: `src/game/meta/`, `src/ui/components/`.
3. ✅ Добавить типы в `src/game/meta/types.ts`.
4. ✅ Добавить ключи в `src/game/core/storageKeys.ts`: credits, metaTree, unlocks, doctrines, legacy, threatLevel, ascension, playerStats.
5. ✅ Создать заглушки новых систем: CreditSystem, MetaTree, UnlockSystem, DoctrineSystem, LegacySystem, AscensionSystem, AnchorSystem, RadarSystem, LockOnSystem, DroneCommandSystem, ActiveShieldSystem.
6. ✅ Создать данные: doctrines.ts (12), legacy.ts (12), ascension.ts (15), unlocks.ts (16), affixes.ts (8).

**Файлы:** `storageKeys.ts`, `meta/types.ts`, новые папки.  
**Зависимости:** нет.  
**Приёмка:** проект компилируется, тесты проходят.

---

### Этап 1: Core Roguelike — сброс забега + кредиты (1–2 недели) — В ПРОЦЕССЕ

**Задачи:**
1. ✅ Модифицировать `DeathSystem`/`GameWorld`: при смерти начислить кредиты, сбросить parts.
2. ✅ Создать `CreditSystem` с формулой из GDD §3.3 (база 5% + mastery-заготовки).
3. ✅ `GameFSM`: переходы `player_died` → `dying` → `over` → `restart` → `playing` уже есть; выбор доктрины — Этап 9.
4. ✅ `GameUpgrades`/`UpgradeSystem`: добавлен `resetParts()`; забеговые детали сбрасываются при смерти.
5. ⏳ `resetRun()` — сброс parts реализован; полный сброс улучшений/оружия/дронов — Этап 8 (мета).
6. ✅ `GameOverScreen`: показаны кредиты и заработанные кредиты.
7. ✅ Минимум 1 кредит за забег (CreditSystem.calculate).

**Файлы:** `DeathSystem.ts`, `CreditSystem.ts`, `GameFSM.ts`, `GameUpgrades.ts`, `GameOverScreen.tsx`, `upgrades.ts`.  
**Зависимости:** Этап 0.  
**Приёмка:** смерть сбрасывает забег, начисляет кредиты, показывает экран. Повторный забег начинается с базового корабля.

---

### Этап 2: Threat Director + Телеграфы (1 неделя) — ЧАСТИЧНО

**Статус:** Threat Director уже есть. Телеграфы реализованы через отложенный выстрел (0.35с) в EnemyShootingSystem и рендер в EnemyRenderer.

**Задачи:**
1. ✅ ThreatDirector: лимиты и перераспределение уже реализованы.
2. ✅ Единый телеграф для атак: красная линия (хантер), оранжевый конус (турели), белая вспышка (залп истребителя). Фиолетовая дуга (tether) — не реализована (нет tether-оружия).
3. ✅ Таймеры телеграфа ≥0.35с в EnemyShootingSystem (pendingShots).
4. ✅ Рендер телеграфов в EnemyRenderer.
5. ✅ Радиальный залп босса теперь с телеграфом (arc, 0.35с).

**Файлы:** `EnemyShootingSystem.ts`, `EnemyRenderer` (в `systems/Renderers/`), `ai/strategies/*`.  
**Зависимости:** Этап 1.  
**Приёмка:** ≥80% урона приходится на атаки с телеграфом.

---

### Этап 3: Якоря + Буря + Сжатие + Клещи (1 неделя) — ЧАСТИЧНО

**Статус:** Буря и сжатие уже есть. Якоря реализованы (спавн на волнах кратных 3, HP, урон от пуль, бонус деталей, завершение волны, рендер). Клещи и тип волны `objective` не реализованы.

**Задачи:**
1. ✅ `AnchorSystem`: спавн 2–3 якорей, HP, уничтожение, бонус деталей, завершение волны.
2. ⏳ Тип волны `objective` в `WaveStateMachine` — не реализован (используется условие `wave % 3 === 0`).
3. ✅ Клещи (pincer) в `SpawnSystem` — волны кратные 4 используют 2 противоположных разлома.
4. ✅ Бонус деталей за уничтожение якоря (+40%).
5. ✅ Рендер якорей в `RendererSystem`.

**Файлы:** `AnchorSystem.ts`, `SpawnSystem.ts`, `RiftPlacement.ts`, `WaveStateMachine.ts`, `PickupDropSystem.ts`.  
**Зависимости:** Этап 1.  
**Приёмка:** волны с якорями завершаются при уничтожении всех; бонус +40% начисляется.

---

### Этап 4: Новые враги (2 недели) — В ПРОЦЕССЕ

**Задачи:**
1. ✅ Добавить 8 новых `EnemyKind` в `balance/enemies.ts` + базы (HP, скорость, урон).
2. ⏳ Создать 8 новых стратегий в `ai/strategies/` (пока fallback-движение):
   - `NeedleStrategy.ts` (снайпер, заряд луча) — ❌.
   - `ShieldbearerStrategy.ts` (аура −40%) — ❌.
   - `HarpoonerStrategy.ts` (tether) — ❌.
   - `SplitterStrategy.ts` (деление при смерти) — ❌.
   - `JammerStrategy.ts` (зона отключения автонаведения) — ❌.
   - `VortexStrategy.ts` (вращающийся лазер) — ❌.
   - `HiveMotherStrategy.ts` (рой + босс-фаза) — ❌.
   - `MinerStrategy.ts` (уже есть) — ✅.
3. ⏳ Добавить веса спавна в `balance/waves.ts` (пока 0 — не спавнятся).
4. ⏳ Добавить элитные аффиксы в `balance/affixes.ts` + применение в `EnemyLifecycle` (данные ✅, применение ❌).
5. ✅ Добавить рендер-заглушку новых врагов в `EnemyRenderer` (базовый круг).

**Файлы:** `balance/enemies.ts`, `balance/waves.ts`, `balance/affixes.ts`, `ai/strategies/*`, `ecs/EnemyLifecycle.ts`, `systems/Renderers/EnemyRenderer.ts`.  
**Зависимости:** Этап 3.  
**Приёмка:** ≥3 разных типа угроз одновременно; каждый требует разных действий.

---

### Этап 5: Новое оружие (1 неделя)

**Задачи:**
1. Создать 4 новых оружия:
   - `RailgunWeapon.ts` (заряд 0.8с, пробитие).
   - `FlakWeapon.ts` (конус).
   - `TetherWeapon.ts` (сцепление).
   - `DevourerWeapon.ts` (поглощение пуль).
2. Добавить альтернативный огонь (alt-fire) в `WeaponManager` и `PlayerControls`.
3. Добавить новые оружия в `WeaponCatalog` и `WeaponRegistry`.
4. Добавить цены и разблокировку (через мета).
5. Эволюции оружия (P2): добавить таблицу эволюций в `WeaponManager`.

**Файлы:** `weapons/*`, `WeaponManager.ts`, `WeaponCatalog.ts`, `WeaponRegistry.ts`, `PlayerControls.ts`.  
**Зависимости:** Этап 4.  
**Приёмка:** новое оружие покупается, работает, меняет геймплей.

---

### Этап 6: Дроны — роли и режимы (1 неделя)

**Задачи:**
1. Добавить роли дронов (разведчик/штурмовик/часовой) в `Drone.ts` + `DroneSystem`.
2. Добавить режимы (сопровождение/штурм/удержание) в `DroneCommandSystem`.
3. Добавить ввод (клавиши 1/2/3, тач-кнопки).
4. Добавить индикатор режима в HUD.
5. Разблокировка дронов за кредиты/достижения.

**Файлы:** `drones/Drone.ts`, `drones/DroneSystem.ts`, `DroneCommandSystem.ts`, `HudLayer.tsx`.  
**Зависимости:** Этап 5.  
**Приёмка:** дроны меняют поведение по режиму; урон по локированной цели растёт.

---

### Этап 7: Lock-on + Активный щит (1 неделя)

**Задачи:**
1. Создать `LockOnSystem`: лок цели (Tab/стик/тап), индикатор, приоритет для дронов/ракет.
2. Создать `ActiveShieldSystem`: сектор 120°, дренаж 30/с, пассив 8%.
3. Интегрировать в `PlayerControls` и `ShieldSystem`.
4. Добавить рендер сектора щита.
5. Разблокировка через мета.

**Файлы:** `LockOnSystem.ts`, `ActiveShieldSystem.ts`, `ShieldSystem.ts`, `PlayerControls.ts`, `HudLayer.tsx`.  
**Зависимости:** Этап 6.  
**Приёмка:** урон, заблокированный активным щитом ≥35% у активного игрока.

---

### Этап 8: Мета-дерево (Зеркало Ночи) (2 недели)

**Задачи:**
1. Создать `MetaTree.ts`: таланты с ветками, покупка за кредиты, сохранение.
2. Создать `UnlockSystem.ts`: разблокировки за кредиты и достижения.
3. Создать `MetaTreeScreen.tsx`: UI мета-дерева.
4. Создать `ArmoryScreen.tsx`: оружие, дроны, линии.
5. Интегрировать мета-таланты в `applyUpgrades` и `GameUpgrades`.
6. Добавить достижения (таблица из GDD §3.4).

**Файлы:** `meta/MetaTree.ts`, `meta/UnlockSystem.ts`, `meta/types.ts`, `MetaTreeScreen.tsx`, `ArmoryScreen.tsx`, `upgrades.ts`, `GameUpgrades.ts`.  
**Зависимости:** Этап 1.  
**Приёмка:** покупка таланта меняет игру; разблокировка оружия работает.

---

### Этап 9: Доктрины + Наследие (1 неделя)

**Задачи:**
1. Создать `DoctrineSystem.ts`: 12 доктрин, выбор перед забегом, применение эффектов.
2. Создать `LegacySystem.ts`: 12 артефактов, слоты, получение за достижения.
3. Создать `DoctrinesScreen.tsx` и `LegacyScreen.tsx`.
4. Интегрировать в `GameFSM`: выбор доктрины/наследия перед стартом.
5. Добавить данные в `meta/doctrines.ts` и `meta/legacy.ts`.

**Файлы:** `meta/DoctrineSystem.ts`, `meta/LegacySystem.ts`, `meta/doctrines.ts`, `meta/legacy.ts`, `DoctrinesScreen.tsx`, `LegacyScreen.tsx`, `GameFSM.ts`.  
**Зависимости:** Этап 8.  
**Приёмка:** доктрина меняет правила забега; артефакт даёт бонус.

---

### Этап 10: Асценсия (1 неделя)

**Задачи:**
1. Создать `AscensionSystem.ts`: Threat Levels, модификаторы, награды.
2. Создать `AscensionScreen.tsx`: UI асценсии.
3. Интегрировать модификаторы в `balance/` (множители HP/урона/скорости врагов, радиус зоны, и т.д.).
4. Добавить данные в `meta/ascension.ts`.

**Файлы:** `meta/AscensionSystem.ts`, `meta/ascension.ts`, `AscensionScreen.tsx`, `balance/*.ts`.  
**Зависимости:** Этап 9.  
**Приёмка:** повышение TL меняет сложность; награды начисляются.

---

### Этап 11: Радар + UI полировка (1 неделя)

**Задачи:**
1. Создать `RadarSystem.ts` + `Radar.tsx`: зона, разломы, якоря, элиты, носители, босс.
2. Добавить индикаторы за кадром (вспышка на кромке).
3. Обновить `HudLayer.tsx`: радар, индикатор рывка, лок, режим дронов.
4. Обновить `MainMenu.tsx`: пункты мета/доктрин/наследия/асценсии.

**Файлы:** `RadarSystem.ts`, `Radar.tsx`, `HudLayer.tsx`, `MainMenu.tsx`.  
**Зависимости:** Этап 10.  
**Приёмка:** радар показывает угрозы; индикаторы за кадром работают.

---

### Этап 12: Полировка и балансировка (1–2 недели)

**Задачи:**
1. Плейтест + симулятор: балансировка кредитов, мета-дерева, асценсии.
2. Локализация (i18n): новые ключи.
3. Оптимизация: пул объектов, лимиты снарядов.
4. Финальное тестирование: `tsc`, `lint`, `check:i18n`, `sim:selftest`.
5. Документация: обновить `docs/`.

**Зависимости:** Этап 11.  
**Приёмка:** все проверки проходят; игра играбельна на TL 0–5.

---

## 5. Риски и открытые вопросы

| Риск | Влияние | Митигация |
|---|---|---|
| Мета-прогресс слишком медленный → grind | Высокое | Прогрессивная формула кредитов; разблокировки за достижения |
| Мета-прогресс слишком быстрый → тривиальность | Среднее | Балансировка через симулятор; асценсия для хардкора |
| Новые враги ломают баланс | Среднее | Добавлять по 2–3 за этап; тестировать в симуляторе |
| UI перегружен | Среднее | Постепенное добавление экранов; плейтест |
| Производительность при 100+ врагах | Среднее | Пул объектов, лимиты снарядов |
| Обратная совместимость сохранений | Высокое | Миграция старых сохранений (Mechanic 1 → Mechanic 3) |

**Открытые вопросы:**
1. Сохранять ли старые сохранения (Mechanic 1) или сбросить? **Рекомендация:** мигрировать (конвертировать детали в кредиты по формуле).
2. Сколько слотов Наследия? **Рекомендация:** 1 слот на старте, 2–3 с мета-талантом.
3. Максимальный TL? **Рекомендация:** 20, потом бесконечный режим.
4. Нужны ли арены-модификаторы в v1? **Рекомендация:** отложить до v1.1.

---

## 6. Метрики приёмки (финальные)

| Метрика | Цель |
|---|---|
| Урон/мин облёта края на 70-й волне | ≥ 1.4× внутренней орбиты |
| Выживание облёта края 120с на 70-й | ≤ 4/8 seed |
| Число различных глаголов игрока | ≥ 5 |
| Врагов с уникальным контрприёмом | ≥ 8 из 10 |
| Макс. атакующих в 260px | ≤ 8 (p95) |
| Пик снарядов (p90) | ≤ 30 |
| Время до первой «новой механики» | ≤ 2 забега |
| Мёртвые покупки | 0 |
| Разных жизнеспособных сборок на 40-й | ≥ 3 |
| Длительность забега | 15–30 мин |
| Время до первой победы | 5–10 забегов |
| Полное мета-дерево | ~50–100 забегов |

---

## 7. Карта файлов (что создаётся/меняется)

### Создаётся (новые файлы)

```
src/game/meta/
├── types.ts
├── MetaTree.ts
├── UnlockSystem.ts
├── DoctrineSystem.ts
├── LegacySystem.ts
├── AscensionSystem.ts
├── doctrines.ts
├── legacy.ts
├── ascension.ts
├── unlocks.ts

src/game/systems/
├── CreditSystem.ts
├── AnchorSystem.ts
├── RadarSystem.ts
├── LockOnSystem.ts
├── DroneCommandSystem.ts
├── ActiveShieldSystem.ts

src/game/balance/
├── affixes.ts

src/game/ai/strategies/
├── NeedleStrategy.ts
├── ShieldbearerStrategy.ts
├── HarpoonerStrategy.ts
├── SplitterStrategy.ts
├── JammerStrategy.ts
├── VortexStrategy.ts
├── HiveMotherStrategy.ts

src/game/weapons/
├── RailgunWeapon.ts
├── FlakWeapon.ts
├── TetherWeapon.ts
├── DevourerWeapon.ts

src/ui/screens/
├── MetaTreeScreen.tsx
├── ArmoryScreen.tsx
├── DoctrinesScreen.tsx
├── LegacyScreen.tsx
├── AscensionScreen.tsx

src/ui/components/
├── Radar.tsx
```

### Модифицируется (существующие файлы)

```
src/game/core/GameFSM.ts
src/game/core/GameUpgrades.ts
src/game/core/storageKeys.ts
src/game/upgrades.ts
src/game/systems/DeathSystem.ts
src/game/systems/SpawnSystem.ts
src/game/systems/EnemyShootingSystem.ts
src/game/systems/ShieldSystem.ts
src/game/systems/HudLayer.tsx (via ui/)
src/game/ai/EnemyAI.ts
src/game/ai/ThreatDirector.ts (проверка)
src/game/weapons/WeaponManager.ts
src/game/weapons/WeaponCatalog.ts
src/game/weapons/WeaponRegistry.ts
src/game/drones/Drone.ts
src/game/drones/DroneSystem.ts
src/game/balance/enemies.ts
src/game/balance/waves.ts
src/game/waves/WaveStateMachine.ts
src/game/waves/RiftPlacement.ts
src/ui/screens/GameOverScreen.tsx
src/ui/screens/MainMenu.tsx
src/ui/i18n/* (новые ключи)
```

---

*План создан на основе GDD (docs/gdd-mechanic-3.md) и текущего кода проекта. Все этапы могут быть скорректированы по результатам плейтеста.*
