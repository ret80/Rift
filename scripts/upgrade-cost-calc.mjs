/* ============================================================
   Upgrade economy calculator.

   Воспроизводит реальные формулы баланса (waves.ts, drops/детали)
   и считает ожидаемый кумулятивный доход деталей к волне 50.
   Затем подбирает новые стоимости апгрейдов так, чтобы суммарная
   стоимость всех апгрейдов ≈ доходу к 50-й волне.

   Запуск: node scripts/upgrade-cost-calc.mjs
   ============================================================ */

/* ------------------- Источник правды: src/game ------------------- */

// math.ts
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function ramp01(v, s, f) { return clamp((v - s) / (f - s), 0, 1); }

// balance/waves.ts
function waveTotalFor(w) { return Math.min(100, Math.round(30 + (w - 1) * 2.4)); }
function kindWeights(w) {
  return [
    ["drone", 1],
    ["hunter", 0.15 * ramp01(w, 3, 18)],
    ["fighter", 0.55 * ramp01(w, 1, 12)],
    ["cruiser", 0.45 * ramp01(w, 4, 15)],
    ["carrier", 0.25 * ramp01(w, 8, 16)],
  ];
}

// systems/PickupDropSystem.ts — детали за убийство врага
const PARTS_PER_ENEMY = { drone: 2, hunter: 4, fighter: 5, cruiser: 12, carrier: 25 };

/* ------------------- Текущие апгрейды (upgrades.ts) ------------------- */

/*
 * ВНИМАНИЕ: скрипт — калькулятор одного прогона.
 * CURRENT_TIERS — это состояние прокачки ДО пересчёта: по нему подбираются
 * новые стоимости, а результат вписывается в upgrades.ts.
 * Повторный прогон по уже пересчитанным числам даёт чуть другие значения,
 * потому что модель нормирует взвешенную сумму, а не обычную.
 */
const CURRENT_TIERS = {
  hull:          { baseCost: 81,  costStep: 60,  maxLevel: 10 },
  speed:         { baseCost: 16,  costStep: 12,  maxLevel: 8  },
  guns:          { baseCost: 214, costStep: 160, maxLevel: 4  },
  drones:        { baseCost: 341, costStep: 239, maxLevel: 7  },
  shieldPercent: { baseCost: 160, costStep: 120, maxLevel: 7  },
  shieldRegen:   { baseCost: 110, costStep: 85,  maxLevel: 5  },
};

// upgrades.ts: cost(l) = baseCost + costStep * l
function upgradeCost(tier, level) { return tier.baseCost + tier.costStep * level; }
function tierTotal(tier) {
  let sum = 0;
  for (let l = 0; l < tier.maxLevel; l++) sum += upgradeCost(tier, l);
  return sum;
}

/* ------------------- Ожидаемый доход по волнам ------------------- */

function incomePerWave(w) {
  const total = waveTotalFor(w);
  const weights = kindWeights(w);
  const wsum = weights.reduce((a, [, wt]) => a + wt, 0);
  let income = 0;
  for (const [kind, wt] of weights) {
    const share = wsum > 0 ? wt / wsum : 0;
    income += total * share * PARTS_PER_ENEMY[kind];
  }
  return income;
}

function printEconomy(maxWave) {
  console.log("=== Ожидаемый доход деталей по волнам ===");
  let cumulative = 0;
  let last = 0;
  for (let w = 1; w <= maxWave; w++) {
    const inc = incomePerWave(w);
    cumulative += inc;
    last = inc;
    if (w <= 10 || w % 5 === 0 || w === maxWave) {
      console.log(`wave ${String(w).padStart(2)}: +${inc.toFixed(1).padStart(7)}  cumulative=${cumulative.toFixed(0).padStart(7)}`);
    }
  }
  console.log(`--- доход на волне ${maxWave}: ${last.toFixed(1)}/волна`);
  console.log(`--- суммарный доход c 1 по ${maxWave}: ${cumulative.toFixed(0)}`);
  return cumulative;
}

/* ------------------- Текущая суммарная стоимость ------------------- */

function printCurrentTotal() {
  console.log("\n=== Текущая полная стоимость апгрейдов ===");
  let sum = 0;
  for (const [key, tier] of Object.entries(CURRENT_TIERS)) {
    const t = tierTotal(tier);
    sum += t;
    console.log(`${key.padEnd(13)} ${String(t).padStart(5)}  (base=${tier.baseCost}, step=${tier.costStep}, max=${tier.maxLevel})`);
  }
  console.log(`ИТОГО: ${sum}`);
  return sum;
}

/* ------------------- Подбор новых стоимостей ------------------- */

// Ценность апгрейда (множитель «силы»):
//  - огневая мощь (guns, drones) и защита (hull, shieldPercent) — ДОРОЖЕ;
//  - мобильность (speed) — заметно дешевле.
const POWER_WEIGHT = {
  hull:          1.0,  // защита (HP)
  speed:         0.45, // мобильность (не боевая)
  guns:          1.15, // огневая мощь (мультипликативная)
  drones:        1.3,  // огневая мощь (авто-DPS, самый сильный)
  shieldPercent: 1.25, // защита: постоянный срез урона
  shieldRegen:   1.1,  // защита: быстрее возвращается щит
};

/**
 * Подобрать базовую стоимость и шаг под заданную полную стоимость линии.
 *
 * Пропорция base:step сохраняется (k), поэтому повторный прогон скрипта
 * даёт те же числа: base восстанавливается из округлённого шага.
 */
function fitTier(currentTier, targetTotal) {
  const k = currentTier.baseCost / currentTier.costStep; // 1.25..1.67
  const n = currentTier.maxLevel;
  // target = n * base + step * n(n-1)/2, base = k * step
  const step = Math.max(1, Math.round(targetTotal / (k * n + (n * (n - 1)) / 2)));
  const base = Math.max(1, Math.round(k * step));
  return {
    baseCost: base,
    costStep: step,
    maxLevel: currentTier.maxLevel,
  };
}

function suggest(maxWave, targetIncome, label) {
  console.log(`\n=== Подбор стоимостей (цель: сумма = ${label} = ${Math.round(targetIncome)}) ===`);

  // Взвешенная сумма текущих полных стоимостей
  let rawTotal = 0;
  for (const [key, tier] of Object.entries(CURRENT_TIERS)) {
    rawTotal += tierTotal(tier) * POWER_WEIGHT[key];
  }

  const factor = targetIncome / rawTotal;
  const proposed = {};
  let sum = 0;
  for (const [key, tier] of Object.entries(CURRENT_TIERS)) {
    const target = tierTotal(tier) * POWER_WEIGHT[key] * factor;
    proposed[key] = fitTier(tier, target);
    const total = tierTotal(proposed[key]);
    sum += total;
    console.log(`${key.padEnd(13)} ${String(total).padStart(5)}  (base=${proposed[key].baseCost}, step=${proposed[key].costStep}, max=${proposed[key].maxLevel})  x${POWER_WEIGHT[key]}`);
  }
  console.log(`СУММА: ${sum} (цель ${Math.round(targetIncome)}, отклонение ${Math.round(sum - targetIncome)})`);
  console.log("\nВ виде объекта UPGRADE_TIERS:\n");
  console.log(JSON.stringify(proposed, null, 2));
  return proposed;
}

/* ------------------- Запуск ------------------- */

const MAX_WAVE = 50;
const income = printEconomy(MAX_WAVE);
const currentTotal = printCurrentTotal();
console.log(`\nТекущая сумма (${currentTotal}) составляет ${(100 * currentTotal / income).toFixed(1)}% от дохода к ${MAX_WAVE}-й волне.`);

// Цель 1: абсолютно всё доступно к 50-й волне при идеальном сборе.
suggest(MAX_WAVE, income, "идеальный доход к 50");

// Цель 2 (реалистичнее): игрок теряет часть деталей (не всё убито/собрано),
// поэтому берём 90% дохода — всё должно покупаться примерно к 50-й волне
// с учётом накопления между забегами.
suggest(MAX_WAVE, income * 0.9, "90% дохода к 50");
