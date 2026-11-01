/**
 * fighter-circle-sim — модель «игрок летает по кругу, стреляет истребитель».
 *
 * Отвечает на два вопроса:
 *   1. Есть ли вообще выстрел, который попадёт (окно), при разных скоростях болта?
 *   2. Попадает ли болт, если целиться по линейному упреждению (как сейчас)
 *      и если целиться по дуге (круговое упреждение)?
 *
 * Геометрия: игрок летит по окружности радиуса R со скоростью Vp, истребитель
 * стоит в точке на дистанции d под углом φ. Перебираются все углы φ и фазы
 * орбиты — метрика не зависит от того, где сейчас противники.
 *
 * Запуск: node scripts/fighter-circle-sim.mjs
 */

const VP = 600;              // скорость игрока
const HIT_R = 28;            // внешний радиус хитбокса игрока
const DT = 1 / 240;          // шаг интегрирования
const MAX_T = 3;             // сколько секунд сопровождаем болт
const MIN_TIME = 0.12;       // FIGHTER_FIRE_MIN_TIME
const MAX_TIME = 1.1;        // FIGHTER_FIRE_MAX_TIME
const MIN_ANGULAR = 0.05;    // FIGHTER_FIRE_MIN_ANGULAR

/** Линейное упреждение: |P + V·t − S| = v·t. */
function linearIntercept(dx, dy, vx, vy, v) {
  const a = vx * vx + vy * vy - v * v;
  const b = 2 * (dx * vx + dy * vy);
  const c = dx * dx + dy * dy;
  if (Math.abs(a) < 1e-9) {
    if (Math.abs(b) < 1e-9) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  const t1 = (-b - s) / (2 * a);
  const t2 = (-b + s) / (2 * a);
  const first = Math.min(t1, t2);
  if (first > 0) return first;
  const second = Math.max(t1, t2);
  return second > 0 ? second : null;
}

/** Позиция игрока на дуге через t (движение с постоянной угловой скоростью). */
function arcPoint(px, py, vx, vy, w, t) {
  if (Math.abs(w) < 1e-6) {
    return [px + vx * t, py + vy * t];
  }
  const s = Math.sin(w * t);
  const c = 1 - Math.cos(w * t);
  return [px + (s * vx - c * vy) / w, py + (c * vx + s * vy) / w];
}

/** Круговое упреждение: итеративно ищем время полёта по дуге. */
function arcIntercept(sx, sy, px, py, vx, vy, w, v) {
  let t = Math.hypot(px - sx, py - sy) / v;
  for (let i = 0; i < 8; i++) {
    const [ix, iy] = arcPoint(px, py, vx, vy, w, t);
    const next = Math.hypot(ix - sx, iy - sy) / v;
    if (!Number.isFinite(next)) return null;
    if (Math.abs(next - t) < 1e-4) {
      t = next;
      break;
    }
    t = next;
  }
  return t > 0 ? t : null;
}

/** Болт летит прямой; проверяем, проходит ли он в хитбоксе движущейся цели. */
function boltHits(sx, sy, px, py, vx, vy, w, angle, v) {
  const bx = Math.cos(angle) * v;
  const by = Math.sin(angle) * v;
  let px2 = px;
  let py2 = py;
  let last = Infinity;
  for (let t = DT; t <= MAX_T; t += DT) {
    const bx2 = sx + bx * t;
    const by2 = sy + by * t;
    const [qx, qy] = arcPoint(px2, py2, vx, vy, w, t);
    const d = Math.hypot(bx2 - qx, by2 - qy);
    if (d <= HIT_R) return true;
    if (d > last + 60) return false; // разошлись и расходятся
    last = d;
  }
  return false;
}

/** Один тест: где стоит истребитель и куда летит игрок. */
function test(sx, sy, px, py, vx, vy, w, v, mode) {
  let t;
  if (mode === 'linear') {
    t = linearIntercept(px - sx, py - sy, vx, vy, v);
  } else {
    t = arcIntercept(sx, sy, px, py, vx, vy, w, v);
  }
  if (t === null) return { window: false, hit: false, miss: Infinity };

  const [ix, iy] = mode === 'linear'
    ? [px + vx * t, py + vy * t]
    : arcPoint(px, py, vx, vy, w, t);

  const dist = Math.hypot(ix - sx, iy - sy) || 1;
  const angular = Math.asin(Math.min(1, HIT_R / dist));
  const win =
    !(t < MIN_TIME || t > MAX_TIME) && angular >= MIN_ANGULAR && linearOk(t);
  const angle = Math.atan2(iy - sy, ix - sx);
  const hit = win && boltHits(sx, sy, px, py, vx, vy, w, angle, v);
  // промах: минимальное расстояние болта до цели
  let miss = Infinity;
  if (win) {
    const bx = Math.cos(angle) * v;
    const by = Math.sin(angle) * v;
    for (let tt = DT; tt <= MAX_T; tt += DT) {
      const [qx, qy] = arcPoint(px, py, vx, vy, w, tt);
      const d = Math.hypot(sx + bx * tt - qx, sy + by * tt - qy);
      if (d < miss) miss = d;
    }
  }
  return { window: win, hit, miss };
}

function linearOk(t) {
  return t >= MIN_TIME && t <= MAX_TIME;
}

/** Прогон всей сетки геометрий. */
function sweep({ R, dists, boltSpeeds, mode, orbit = 1 }) {
  const rows = [];
  const phases = 24;
  const bearings = 12;
  for (const d of dists) {
    for (const v of boltSpeeds) {
      let win = 0;
      let hit = 0;
      let n = 0;
      let missSum = 0;
      let missN = 0;
      for (let i = 0; i < phases; i++) {
        const th = (i / phases) * Math.PI * 2;
        const px = Math.cos(th) * R;
        const py = Math.sin(th) * R;
        const w = (orbit * VP) / R;
        const vx = -Math.sin(th) * VP * orbit;
        const vy = Math.cos(th) * VP * orbit;
        for (let j = 0; j < bearings; j++) {
          const phi = (j / bearings) * Math.PI * 2;
          const sx = px + Math.cos(phi) * d;
          const sy = py + Math.sin(phi) * d;
          const r = test(sx, sy, px, py, vx, vy, w, v, mode);
          n++;
          if (r.window) {
            win++;
            if (Number.isFinite(r.miss)) {
              missSum += r.miss;
              missN++;
            }
          }
          if (r.hit) hit++;
        }
      }
      rows.push({
        R, d, v, mode,
        windowRate: win / n,
        hitRate: hit / n,
        meanMiss: missN ? missSum / missN : NaN,
      });
    }
  }
  return rows;
}

function pct(x) {
  return (x * 100).toFixed(0).padStart(3) + '%';
}

const R = Number(process.argv[2] ?? 300);
const line = (r) =>
  `  R=${String(r.R).padStart(3)} d=${String(r.d).padStart(3)} v=${String(r.v).padStart(3)} ` +
  `окно=${pct(r.windowRate)} попало=${pct(r.hitRate)} ` +
  `сред.промах=${Number.isFinite(r.meanMiss) ? r.meanMiss.toFixed(0).padStart(4) : '  —'} px`;

for (const mode of ['linear', 'arc']) {
  console.log(`\n=== ${mode === 'linear' ? 'ЛИНЕЙНОЕ упреждение (как сейчас)' : 'КРУГОВОЕ упреждение (дуга)'} ===`);
  const speeds = [300, 420, 540, 660, 780];
  const rows = sweep({ R, dists: [300, 420, 550], boltSpeeds: speeds, mode });
  for (const r of rows) console.log(line(r));
}

// Второй блок: насколько опасен облёт разного радиуса при текущем болте.
console.log('\n=== Радиус орбиты игрока, v_bolt = 300, d = 420 ===');
for (const radius of [250, 350, 500, 700]) {
  const rows = sweep({ R: radius, dists: [420], boltSpeeds: [300, 780], mode: 'linear' });
  console.log(`  орбита R=${radius}`);
  for (const r of rows) console.log(line(r));
}
