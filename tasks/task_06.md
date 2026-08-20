Как профессиональный гейм-дизайнер, я вижу, что проблема не в одной настройке, а в сочетании нескольких систем. Игрок на 22 волне чувствует себя в безопасности, потому что враги не представляют угрозы: медленные, стреляют вхолостую, скапливаются в центре.

## Текущий анализ проблемы

1. **Скорость врагов**: дроны (60) и истребители (110) слишком медленные для 22 волны
2. **Меткость**: нет прогрессии меткости, враги стреляют с большим разбросом (0.15 рад у истребителей)
3. **Поведение**: все враги стремятся к центру зоны, создавая "кучу" без угрозы
4. **Огонь**: редкий, нет ощущения давления

## План ребаланса

### 1. Прогрессия скорости врагов

**Что нужно**: Скорость врагов должна расти с волнами, чтобы они могли догнать игрока.

**Замена**:

```typescript
// В EnemySystem.ts - ускоряем врагов с прогрессией
// Вместо фиксированных скоростей:

// Было:
case "drone": return { hp: 8, r: 14, speed: 60, ... }
case "hunter": return { hp: 20, r: 14, speed: 150, ... }
case "fighter": return { hp: 35, r: 18, speed: 110, ... }

// Стало:
case "drone": return { 
  hp: 8, r: 14, 
  speed: 80 + this.wave * 2.5, // 80 → 132 к 22 волне
  ...
}
case "hunter": return { 
  hp: 20, r: 14, 
  speed: 180 + this.wave * 3, // 180 → 246 к 22 волне
  ...
}
case "fighter": return { 
  hp: 35, r: 18, 
  speed: 140 + this.wave * 3.5, // 140 → 217 к 22 волне
  ...
}
```

### 2. Меткость врагов (ключевое изменение)

**Что нужно**: Прогрессия меткости с волнами, но с потолком ~70-75%, чтобы игрок мог уклоняться.

**Замена**:

```typescript
// В EnemySystem.ts - метод стрельбы
// Добавить параметр accuracy (0.2 = базовая меткость, 0.05 = прирост за волну)

private getAccuracy(wave: number): number {
  // Базовая меткость 30%, растет до 70% к 30 волне
  return Math.min(0.7, 0.3 + wave * 0.013);
}

// Вместо:
const spread = e.kind === "fighter" ? 0.15 : 0.18;

// Стало:
const accuracy = this.getAccuracy(this.wave);
const spread = (1 - accuracy) * 1.5; // При accuracy=0.7 разброс = 0.45 рад (~25°)
```

### 3. Тактика врагов - стратегии преследования

**Что нужно**: Враги должны преследовать игрока, а не скапливаться в центре. Использовать фланговые маневры.

**Замена для DroneStrategy.ts**:

```typescript
// Drone должен агрессивно преследовать, а не "роиться"
update(enemy: Enemy, context: GameContext, dt: number): void {
  const { playerX, playerY, enemies } = context;
  
  // 1. Основное направление - прямо к игроку (без шума)
  const angleToPlayer = Math.atan2(playerY - enemy.y, playerX - enemy.x);
  
  // 2. Добавить небольшое смещение для флангового захода
  const wave = context.state.wave.wave;
  const flankFactor = Math.min(0.3, 0.05 + wave * 0.01);
  const flankAngle = Math.sin(enemy.seed + context.time * 0.5) * flankFactor;
  
  // 3. Целевой угол - к игроку с фланговым смещением
  const targetAngle = angleToPlayer + flankAngle;
  
  // 4. Скорость зависит от дистанции - чем дальше, тем быстрее
  const dist = context.distanceToPlayer(enemy.x, enemy.y);
  const speedMult = Math.min(1.5, 0.8 + dist / 400);
  const speed = enemy.speed * speedMult;
  
  // Плавный поворот
  enemy.angle = this.lerpAngle(enemy.angle, targetAngle, dt * 6);
  
  enemy.vx = Math.cos(enemy.angle) * speed;
  enemy.vy = Math.sin(enemy.angle) * speed;
  enemy.integrate(dt);
}
```

**Замена для FighterStrategy.ts**:

```typescript
// Истребитель должен атаковать с дистанции, а не просто орбитировать
update(enemy: Enemy, context: GameContext, dt: number): void {
  const { playerX, playerY } = context;
  const dist = context.distanceToPlayer(enemy.x, enemy.y);
  const angleToPlayer = Math.atan2(playerY - enemy.y, playerX - enemy.x);
  
  // Золотая дистанция стрельбы - 200-280
  const idealDist = 220 + Math.sin(enemy.modeT * 0.3) * 30;
  
  if (dist > idealDist * 1.2) {
    // Сближение
    const targetAngle = angleToPlayer;
    enemy.angle = this.lerpAngle(enemy.angle, targetAngle, dt * 5);
    const speed = enemy.speed * 1.1;
    enemy.vx = Math.cos(enemy.angle) * speed;
    enemy.vy = Math.sin(enemy.angle) * speed;
  } else if (dist < idealDist * 0.7) {
    // Отступление
    const targetAngle = angleToPlayer + Math.PI;
    enemy.angle = this.lerpAngle(enemy.angle, targetAngle, dt * 4);
    const speed = enemy.speed * 0.7;
    enemy.vx = Math.cos(enemy.angle) * speed;
    enemy.vy = Math.sin(enemy.angle) * speed;
  } else {
    // Удержание дистанции + стрельба
    // Движение по касательной (орбита) с удержанием дистанции
    const tangent = angleToPlayer + Math.PI / 2 * (enemy.strafeDir);
    enemy.angle = this.lerpAngle(enemy.angle, tangent, dt * 3);
    const speed = enemy.speed * 0.6;
    enemy.vx = Math.cos(enemy.angle) * speed;
    enemy.vy = Math.sin(enemy.angle) * speed;
    
    // Активная стрельба - с повышенной точностью
    enemy.fireCd = Math.max(0, enemy.fireCd - dt * 1.5);
  }
  
  enemy.integrate(dt);
}
```

### 4. Частота стрельбы

**Что нужно**: Увеличить давление огня, особенно на поздних волнах.

**Замена**:

```typescript
// В EnemySystem.ts - метод стрельбы
// Вместо фиксированного кулдауна:

// Было:
const rate = e.kind === "fighter" ? 2 : 4;
e.fireCd = rate / (4.4 + this.wave * 0.12);

// Стало:
const baseRate = e.kind === "fighter" ? 1.2 : 2.5;
const waveBoost = Math.min(2.0, 1 + this.wave * 0.05);
e.fireCd = baseRate / waveBoost;
```

### 5. Урон врагов

**Что нужно**: Урон должен расти, чтобы ошибка игрока была критичной.

**Замена в balance.ts**:

```typescript
// Вместо dmgScale только до 2x к 40 волне
export function dmgScale(w: number) {
  // 1x на волне 1, 1.5x к 10, 2.5x к 20, 3.5x к 40
  return 1 + 0.5 * ramp01(w, 1, 10) + 1.0 * ramp01(w, 10, 20) + 1.0 * ramp01(w, 20, 40);
}
```


### 7. Carrier - спавн дронов

**Что нужно**: Carrier должен быть реальной угрозой, спавнить больше дронов и чаще.

**Замена в EnemySystem.ts**:

```typescript
// Вместо 10 дронов с паузой 7-12 сек:
// Стало: 12-15 дронов, пауза 4-7 сек, с более агрессивным ИИ

if (e.burstActive) {
  e.burstCd -= dt;
  if (e.burstCd <= 0 && e.burstSpawned < 12 + Math.floor(this.wave / 5)) {
    e.burstCd = 0.35; // быстрее спавн
    e.burstSpawned++;
    // ... спавн дрона
  }
  if (e.burstSpawned >= 12 + Math.floor(this.wave / 5)) {
    e.burstActive = false;
    e.burstRestT = rand(3, 6); // короче пауза
  }
}
```

### 8. Cruiser - два орудия

**Что нужно**: Увеличить скорострельность Cruiser, сделать его главной угрозой на дистанции.

**Замена**:

```typescript
// Увеличить скорострельность турелей
// Вместо rate = 2.2 / (4.4 + this.wave * 0.12)
// Стало:
const rate = 1.5 / (3 + this.wave * 0.08);
```

### 9. Ускорение пуль врагов

**Что нужно**: Пули должны лететь быстрее, чтобы игрок не мог легко уклоняться.

**Замена**:

```typescript
// В EnemySystem.ts - enemyFireCallback
// Вместо speed = data.cruiser ? 260 : 300
// Стало:
const speed = data.cruiser ? 320 + this.wave * 2 : 350 + this.wave * 2;
```

### 10. Формирование волн

**Что нужно**: Волны должны быть более агрессивными, с волнами атак.

**Замена в SpawnSystem.ts**:

```typescript
// buildQueue - больше врагов, более агрессивный состав
buildQueue(count: number, wave: number): EnemyKind[] {
  const q: EnemyKind[] = [];
  const kinds = ['drone', 'hunter', 'fighter', 'cruiser'];
  
  // Веса классов с прогрессией
  const weights = {
    drone: Math.max(0.1, 0.6 - wave * 0.015),
    hunter: Math.max(0.1, 0.3 + wave * 0.01),
    fighter: Math.max(0.1, 0.1 + wave * 0.015),
    cruiser: Math.max(0, (wave - 6) * 0.02),
  };
  
  // ... формирование очереди с весами
}
```

## Итоговый список изменений

| № | Что меняем | Было | Стало | Причина |
|---|------------|------|-------|---------|
| 1 | Скорость дронов | 60 | 80 + wave*2.5 | Догнать игрока |
| 2 | Скорость истребителей | 110 | 140 + wave*3.5 | Угроза на дистанции |
| 3 | Скорость охотников | 150 | 180 + wave*3 | Агрессивное преследование |
| 4 | Меткость врагов | Фикс. 0.15 | 0.3→0.7 (прогрессия) | Опасный огонь |
| 5 | Частота стрельбы | 2/4 сек | 1.2/2.5 сек | Давление огня |
| 6 | Урон врагов | 1-1.5x | 1→3.5x (прогрессия) | Ошибки критичны |
| 7 | Тактика дронов | Роение | Прямое преследование | Не дают покоя |
| 8 | Тактика истребителей | Орбита | Атака с дистанции | Опасная стрельба |
| 9 | Carrier спавн | 10 дронов | 12-15 дронов | Реальная угроза |
| 10 | Скорость пуль | 260-300 | 320-350+ | Сложнее уклоняться |
| 11 | Cruiser стрельба | 2.2 сек | 1.5 сек | Главная угроза |
| 12 | Состав волн | Базовый | Прогрессивный | Эволюция угроз |

## Дополнительные рекомендации

1. **Добавить "агрессию" врагов**: переменная, которая растет с волнами и влияет на готовность врагов атаковать.

2. **Сделать врагов более умными**: на поздних волнах враги должны пытаться зайти игроку в тыл/фланг.

3. **Зона должна сжиматься быстрее**: на поздних волнах зона должна уменьшаться активнее, создавая давление.

4. **Визуальные подсказки**: добавить индикаторы прицеливания врагов, чтобы игрок мог предвидеть опасность.

5. **Звук**: усилить звуковые сигналы опасных выстрелов (особенно от Cruiser).