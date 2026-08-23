# ref_02 — Унификация naming conventions и дублирование утилит

## Цель
Единый стандарт именования коллекций + удаление дубликатов `rand()` и `rgba()`.

## Задачи

### Task 2.1: EntityPoolSystem — суффикс `List`

**Текущее состояние:**
```typescript
// ✅ Правильно:
enemyList: Enemy[] = [];
enemyBulletList: EBullet[] = [];

// ❌ Нужно переименовать:
bulletList: Bullet[] = [];          // → bulletList (УЖЕ ОК! но проверим use-site)
pickups: Pickup[] = [];             // → pickupList
allyDrones: AllyDrone[] = [];       // → allyDroneList
mines: Mine[] = [];                 // → mineList
```

**Проверка фактических именований в `EntityPoolSystem.ts`:**
Файл уже использует правильное именование! Все поля уже имеют суффикс `List`:
```typescript
enemyList: Enemy[] = [];         ✅
bulletList: Bullet[] = [];       ✅
enemyBulletList: EBullet[] = []; ✅
pickupList: Pickup[] = [];       ✅
allyDroneList: AllyDrone[] = []; ✅
mineList: Mine[] = [];           ✅
```

**Вывод:** ref_10 уже частично выполнен. EntityPoolSystem в порядке.

### Task 2.2: Публичные поля → приватные с getters

**Проблема:** `EntityPoolSystem` имеет публичные массивы, которые можно мутировать напрямую.

**Решение:**
```typescript
// БЫЛО:
enemyList: Enemy[] = [];

// СТАЛО:
private enemyList: Enemy[] = [];
get enemyList(): Enemy[] { return this.enemyList; }
```

Это не требует изменения use-sites — чтение всё ещё `this.entityPool.enemyList`, но `push()` вызовет ошибку TS.

### Task 2.3: Удалить дублирование `rand()` 

**Найдено дублирование:**

| Файл | Статус |
|------|--------|
| `src/game/math.ts` | ✅ Источник |
| `src/game/systems/PlayerSystem.ts` | ❌ Lines 546-548 |
| `src/game/systems/EnemySystem.ts` | ❌ Line 454-456 |

**Действия:**
1. В `PlayerSystem.ts`:
   ```typescript
   // УДАЛИТЬ (lines 546-548):
   function rand(min: number, max: number): number {
     return min + Math.random() * (max - min);
   }
   
   // ДОБАВИТЬ в imports:
   import { rand, TAU } from '../math';
   ```

2. В `EnemySystem.ts`:
   ```typescript
   // УДАЛИТЬ (lines 454-456):
   function rand(min: number, max: number): number {
     return min + Math.random() * (max - min);
   }
   
   // ДОБАВИТЬ в imports:
   import { rand, TAU } from '../math';
   ```

### Task 2.4: Удалить дублирование `rgba()`

**Найдено дублирование:**

| Файл | Статус |
|------|--------|
| `src/game/math.ts` | ✅ Источник (возвращает `string`) |
| `src/game/systems/PlayerSystem.ts` | ❌ Lines 550-554 |
| `src/game/render.ts` | ✅ Возвращает `RGBA` (другой тип) |

**Важно:** `math.ts` возвращает `string`, `render.ts` возвращает `RGBA` (tuple).

**Действия:**
1. В `PlayerSystem.ts`:
   ```typescript
   // УДАЛИТЬ (lines 550-554):
   function rgba(hex: string, alpha: number): string {
     const r = parseInt(hex.slice(1, 3), 16);
     const g = parseInt(hex.slice(3, 5), 16);
     const b = parseInt(hex.slice(5, 7), 16);
     return `rgba(${r},${g},${b},${alpha})`;
   }
   
   // УБЕДИТЬСЯ что используется import из math.ts
   // math.ts имеет: export function rgba(hex: string, a: number): RGBA
   // PlayerSystem использует string-версию
   ```

**ВНИМАНИЕ:** `math.ts` `rgba()` возвращает `RGBA` (tuple), но `PlayerSystem.ts` использует string-rgba для FX. Нужно проверить совместимость.

## Критерии готовности
- [ ] Все коллекции в EntityPool имеют приватные поля с getters
- [ ] `rand()` удалён из `PlayerSystem.ts` и `EnemySystem.ts`
- [ ] `rgba()` удалён из `PlayerSystem.ts`
- [ ] `npm run typecheck` без ошибок
