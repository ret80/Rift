# ref_04 — Коллизии и оружие

## Цель
Добавить корректные коллайдеры для игрока, врагов и астероидов. Настроить физику столкновений. Убедиться что система оружия работает корректно.

## Текущее состояние

### CollisionSystem.ts (417 строк) — ЕДИНСТВЕННАЯ система коллизий

**Реализованные коллизии:**
1. ✅ Пули игрока → враги (circle overlap, урон)
2. ✅ Пули игрока → астероиды (eventBus → AsteroidField.damageAt())
3. ✅ Пули врагов → игрок (увеличенный хитбокс +12px)
4. ✅ Игрок → враги (contact damage, уничтожение врага)
5. ✅ Игрок → астероиды (soft collision с mass, 20 damage)
6. ✅ Враги → астероиды (soft collision, slight HP damage)
7. ✅ Астероиды ↔ астероиды (softResolveCollision)
8. ✅ Подбор бонусов (player pickup collection)
9. ✅ Пули врагов → дроны (drone hit/death)

### Анализа коллайдеров

#### Игрок
- **Радиус:** `PLAYER_RADIUS` из `balance.ts`
- **Хитбокс:** Circle collision в CollisionSystem
- **Статус:** ✅ Реализован

#### Враги
- **Радиус:** `e.r` из типа Enemy
- **Хитбокс:** Circle collision
- **Статус:** ✅ Реализован

#### Астероиды
- **Радиус:** `a.r` из Asteroid
- **Хитбокс:** Circle collision
- **Статус:** ✅ Реализован

### Проверка взаимодействия

| Кто | С кем | Статус |
|-----|-------|--------|
| Игрок | Враги | ✅ collision (line 236-263) |
| Игрок | Астероиды | ✅ collision (line 266-297) |
| Игрок | Пули врагов | ✅ collision (line 217-233) |
| Враги | Астероиды | ✅ collision (line 299-337) |
| Враги | Враги | ❌ НЕТ (намеренно) |
| Астероиды | Астероиды | ✅ collision (line 340-367) |

### Вывод: Враги НЕ сталкиваются друг с другом

Это намеренно — в `EnemySystem.applyAvoidance()` враги мягко раздвигаются, но это не физическая коллизия.

## Задачи

### Task 4.1: Проверить радиусы коллизий

**Нужно проверить `balance.ts`:**
```typescript
// PLAYER_RADIUS — радиус игрока
// ENEMY_RADIUSES — радиусы врагов (разные для каждого типа)
// ASTEROID_RADIUSES — радиусы астероидов
```

**Действие:** Убедиться что:
- `PLAYER_RADIUS` ≈ 12-14px
- Враги: Drone(14), Hunter(14), Fighter(18), Cruiser(26), Carrier(41)
- Астероиды: small(8-12), medium(17-23), large(30-40)

### Task 4.2: Добавить коллизию Игрок ↔ Дроны (свои)

**Проблема:** Дроны-компаньоны не сталкиваются с игроком.

**Решение:** Добавить в `CollisionSystem.update()`:
```typescript
// Дроны ↔ Игрок (избегание столкновения)
for (const drone of allyDrones) {
  const dx = drone.x - playerState.x;
  const dy = drone.y - playerState.y;
  const dist = Math.hypot(dx, dy);
  const minDist = 10 + PLAYER_RADIUS; // drone r=10 + player r
  
  if (dist < minDist && dist > 0.01) {
    // Мягкое расталкивание
    const push = (1 - dist / minDist) * 0.5;
    const nx = dx / dist;
    const ny = dy / dist;
    playerState.vx += nx * push;
    playerState.vy += ny * push;
  }
}
```

### Task 4.3: Система оружия

**Текущее состояние:**

| Компонент | Файл | Статус |
|-----------|------|--------|
| Стрельба игрока | `PlayerSystem.fireAll()` + `BulletSystem.firePlayerBullets()` | ✅ |
| Авто-стрельба | `game.ts handleAutoFire()` | ✅ |
| Ракетная система | `PlayerSystem.activateMissileLauncher()` + `launchMissiles()` | ✅ |
| Пули врагов | `EnemySystem.updateFiring()` → `enemyFireCallback()` | ✅ |
| Дроны-враги стреляют | `DroneSystem.update()` → `eventBus.publish('drone_fired')` | ✅ |
| Бонус оружия | `game.ts applyPickup('gun')` → `addGunBonus(2, 15)` | ✅ |

**Проверка баланса:**
```typescript
// balance.ts должен содержать:
PLAYER_FIRE_CD     — базовый cooldown стрельбы
PLAYER_BULLET_SPEED — скорость пуль игрока
PLAYER_BULLET_DMG  — урон пуль игрока
MISSILE_*          — константы для ракет
```

### Task 4.4: Настроить BulletSystem

**Текущее состояние:** `BulletSystem` имеет свои массивы `bullets` и `enemyBullets`, но `game.ts` использует `entityPool.bulletList` и `entityPool.enemyBulletList`.

**Проблема:** Два источника истины для пуль!

**Проверка:**
```typescript
// game.ts line 608:
this.bulletSystem.update(dtScaled, this.entityPool.bulletList, this.entityPool.enemyBulletList, ...);

// game.ts line 954:
this.bulletSystem.firePlayerBullets(..., this.entityPool.bulletList);
```

**Вывод:** `BulletSystem` принимает массивы из EntityPool как аргументы — правильно!

**НО:** `PlayerSystem.bulletList` (line 96-100) — это дублирующий массив!

**Проблема:** `PlayerSystem` имеет `public bulletList` который Нигде не используется (нет импортов).

**Решение:** Удалить `PlayerSystem.bulletList` и все push в него. Использовать только `entityPool.bulletList`.

## Критерии готовности
- [ ] Игрок сталкивается со всеми врагами, астероидами, пулями
- [ ] Враги сталкиваются с астероидами и игроком, но не друг с другом
- [ ] Астероиды сталкиваются со всеми
- [ ] Радиусы коллизий соответствуют визуальным хитбоксам
- [ ] Система оружия работает: обычные пули, ракеты, авто-стрельба
- [ ] Удалён `PlayerSystem.bulletList` (дубликат)
- [ ] `npm run typecheck` без ошибок
