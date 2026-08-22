# ref_10 — Унифицировать naming conventions

## Проблема

Коллекции и переменные названы непоследовательно:

| Сущность | Название в системе | Название в EntityPool | Название в game.ts |
|----------|:---:|:---:|:---:|
| Враги | `enemies` (EnemySystem) | `enemyList` | `enemyList` |
| Пули игрока | `bullets` (BulletSystem) | `bullets` | `bullets` |
| Пули врагов | `enemyBullets` (BulletSystem) | `enemyBulletList` | `enemyBulletList` |
| Дроны | `allyDrones` | `allyDrones` | `allyDrones` |
| Мины | `mines` | `mines` | `mines` |
| Бонусы | `pickups` | `pickups` | `pickups` |
| Астероиды | `list` (AsteroidField) | — | `list` |
| Разломы | `list` (RiftField) | — | `list` |

Также:
- `EntityPoolSystem` хранит данные как публичные поля (`enemyList: Enemy[] = []`)
- `PlayerSystem` хранит внутренние данные как `player: PlayerState = {...}`
- `EnemySystem` хранит `enemies: Enemy[] = []` и `flock: Enemy[] = []`

## Цель

Единый стандарт именования. Все коллекции используют суффикс `List`.

## Задачи

### 1. Унифицировать EntityPool

```typescript
// EntityPoolSystem.ts:
enemyList: Enemy[] = [];         // ✅ уже OK
bulletList: Bullet[] = [];       // rename from 'bullets'
enemyBulletList: EBullet[] = []; // ✅ уже OK
pickupList: Pickup[] = [];       // rename from 'pickups'
allyDroneList: AllyDrone[] = []; // rename from 'allyDrones'
mineList: Mine[] = [];           // rename from 'mines'
```

### 2. Унифицировать PlayerSystem

```typescript
// PlayerSystem.ts:
private state: PlayerState = {...};  // rename from 'player'

getState(): PlayerState { ... }
getPosition(): {x, y} { ... }
```

### 3. Унифицировать EnemySystem

```typescript
// EnemySystem.ts:
private enemyList: Enemy[] = [];  // rename from 'enemies'

getEnemyList(): Enemy[] { return this.enemyList; }

// Удалить или переименовать 'flock'
private displayList: Enemy[] = []; // rename from 'flock'
```

### 4. Унифицировать AsteroidField и RiftField

```typescript
// AsteroidField.ts:
private list: Asteroid[] = [];     // rename to asteroidList
public getAsteroidList(): Asteroid[] { return this.asteroidList; }

// RiftField.ts:
private list: Rift[] = [];         // rename to riftList
public getRiftList(): Rift[] { return this.riftList; }
```

## Критерии готовности

- [ ] Все коллекции имеют суффикс `List` (кроме приватных полей)
- [ ] Нет `this.bullets.push()` — только `this.bulletList.push()`
- [ ] Нет `this.enemies.push()` — только `this.enemyList.push()`
- [ ] `npm run typecheck` без ошибок

## Ожидаемый эффект

- Код становится предсказуемым
- Новым разработчикам проще ориентироваться
- Автодополнение в IDE работает единообразно

## Зависимости

Нет. Можно делать в любое время.
