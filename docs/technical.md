# Технические требования

> Раздел GDD. Общее оглавление — [gdd-mechanic-3.md](gdd-mechanic-3.md).

## 16. Технические требования (кратко)

### 16.1. Архитектура

- ECS-система (@trixt0r/ecs) для игровых сущностей.
- Системы: PlayerMovement, EnemyAI, WeaponManager, ShieldSystem, PickupDropSystem, ScoringSystem, ThreatDirector, ZoneSystem, WaveOrchestrator.
- Рендер: picogl (WebGL).
- Физика: planck (2D).
- Хранение: localStorage (PersistencePort) для мета, деталей, рекордов.

### 16.2. Производительность

- 60 FPS при 100+ врагах на экране.
- Пул объектов для пуль, частиц, врагов.
- Лимит активных вражеских снарядов ≤ 30 (p90).
- Макс. атакующих в радиусе 260px ≤ 8.

### 16.3. Ввод

- Клавиатура: WASD/стрелки (тяга), Shift (форсаж), ЛКМ/ПКМ (основной/альтернативный огонь), Space (способность), T (тактический режим), Esc/P (пауза).
- Геймпад: левый стик (тяга), A/B (подтвердить/назад), LB/RB (вкладки), Start (пауза).
- Тач: виртуальный джойстик + кнопки.

### 16.4. Сохранение

- `localStorage` ключи: upgrades, bestWave, weaponLoadout, metaTree, unlocks, doctrines, legacy, threatLevel, stats.
- Автосохранение после каждого забега.
- Экспорт/импорт сохранения (JSON).

---

