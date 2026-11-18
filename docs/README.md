# Документация Rift

Проект — аркадный bullet hell с рогалик-забегами, мета-прогрессией и
асценсией. Документация разбита по темам: главный GDD держит только общую
картину, детали лежат в отдельных файлах.

## С чего начать

- **[gdd-mechanic-3.md](gdd-mechanic-3.md)** — главный GDD: концепция, pillars,
  core loop, слои прогрессии. Оглавление и ссылки на всё остальное.

## Игровые системы

| Документ | О чём |
|---|---|
| [enemies.md](enemies.md) | Все вражеские корабли: роли, состояния ИИ, числа, боссы, элитные аффиксы. Сверено с кодом |
| [waves-arena.md](waves-arena.md) | Волны, зона и её сжатие, разломы, спавн, якоря, события волн |
| [storm.md](storm.md) | Буря на кромке: геометрия, тайминги, урон, проклятия |
| [ascension.md](ascension.md) | Уровни угрозы, модификаторы, награды |
| [talents.md](talents.md) | Зеркало Ночи, кредиты, разблокировки, доктрины |
| [player-ship.md](player-ship.md) | Корабли игрока: что за корабль, что на него вешают, ангар и два корпуса |
| [workshop.md](workshop.md) | Мастерская между волнами, магазин, экономика забега, graze и комбо |
| [weapons.md](weapons.md) | Оружие, линии прокачки, альтернативный огонь, эволюции, криты |
| [drones.md](drones.md) | Дроны-компаньоны и приказы |
| [bonuses.md](bonuses.md) | Пикапы, временные бонусы, артефакты наследия |
| [combat.md](combat.md) | Форсаж, активный щит, лок-он, квантовая подмена |
| [ui-ux.md](ui-ux.md) | HUD, телеграфы, экраны |
| [balance.md](balance.md) | Числа игрока, врагов, экономики |
| [technical.md](technical.md) | Архитектура, производительность, ввод, сохранение |
| [roadmap.md](roadmap.md) | Этапы внедрения |

## Аналитика

- [gameplay-mechanics-analysis.md](gameplay-mechanics-analysis.md) — разбор
  референсов и решение о Механике 3.
- [gameplay-recording-and-calibration.md](gameplay-recording-and-calibration.md) —
  калибровка по записям забегов.

## Соответствие старым номерам GDD

Прежний единый документ нумеровал разделы §0–§17; ссылки вида «см. §12» в
тексте означают эти файлы:

| Было | Стало |
|---|---|
| §0–§3 | [gdd-mechanic-3.md](gdd-mechanic-3.md) |
| §4 | [waves-arena.md](waves-arena.md) |
| §5 | [enemies.md](enemies.md) |
| §6 | [weapons.md](weapons.md), [drones.md](drones.md) |
| §7 | [combat.md](combat.md), [drones.md](drones.md) |
| §8 | [workshop.md](workshop.md), [bonuses.md](bonuses.md) |
| §9–§10 | [talents.md](talents.md) |
| §11 | [bonuses.md](bonuses.md) |
| §12 | [ascension.md](ascension.md) |
| §13 | [waves-arena.md](waves-arena.md) |
| §14 | [ui-ux.md](ui-ux.md) |
| §15 | [balance.md](balance.md) |
| §16 | [technical.md](technical.md) |
| §17 | [roadmap.md](roadmap.md) |
