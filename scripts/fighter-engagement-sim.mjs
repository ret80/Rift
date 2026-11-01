/**
 * fighter-engagement-sim — бой «игрок кружит, истребитель атакует».
 *
 * В отличие от fighter-circle-sim здесь моделируется весь цикл: руление
 * истребителя с инерцией, перезарядка, полёт болтов и попадания. Считаем
 * выстрелы в секунду и попадания в секунду для двух тактик игрока:
 *   - «orbit»      — ровный облёт круга;
 *   - «orbit+flip» — облёт с разворотом каждые 1.5 с (как играет живой игрок).
 *
 * Запуск: node scripts/fighter-engagement-sim.mjs
 */

const DT = 1 / 240;
const HIT_R = 28;
const PLAYER_SPEED = 600;
const SECONDS = 25;

/** Параметры сравниваемых конфигураций. */
const CONFIGS = {
  baseline: {
    boltSpeed: 300,
    fighterSpeed: 432,
    turnRate: 4.2,
    lead: 'linear',
    cooldown: 0.32,
    maxFlight: 1.1,
    mode: 'standoff',
  },
  'arc+fast': {
    boltSpeed: 660,
    fighterSpeed: 480,
    turnRate: 4.2,
    lead: 'arc',
    cooldown: 0.32,
    maxFlight: 1.4,
    mode: 'cut',
  },
  // Итоговые числа кода: FIGHTER_BOLT_SPEED 720, скорость на волне 20 — 480,
  // FIGHTER_FIRE_MAX_TIME 1.25, БЕЗ паузы после каждого выстрела.
  final: {
    boltSpeed: 720,
    fighterSpeed: 480,
    turnRate: 5.2,
    lead: 'arc',
    cooldown: 0.32,
    maxFlight: 1.25,
    mode: 'cut',
  },
  'cut-only': {
    boltSpeed: 660,
    fighterSpeed: 432,
    turnRate: 4.2,
    lead: 'arc',
    cooldown: 0.32,
    maxFlight: 1.4,
    mode: 'cut',
  },
  'linear+fast': {
    boltSpeed: 660,
    fighterSpeed: 480,
    turnRate: 4.2,
    lead: 'linear',
    cooldown: 0.32,
    maxFlight: 1.4,
    mode: 'cut',
  },
};

/* ------------------------------ геометрия ------------------------------ */

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

function arcPoint(px, py, vx, vy, w, t) {
  if (Math.abs(w) < 1e-6) return [px + vx * t, py + vy * t];
  const s = Math.sin(w * t);
  const c = 1 - Math.cos(w * t);
  return [px + (s * vx - c * vy) / w, py + (c * vx + s * vy) / w];
}

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

function lerpAngle(a, b, k) {
  let d = b - a;
  d = ((d % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  return a + d * k;
}

/* ------------------------------ симуляция ------------------------------ */

function simulate(cfg, { R = 300, flipEvery = null, seed = 1 }) {
  let rnd = seed;
  const rand = () => {
    rnd = (rnd * 1664525 + 1013904223) | 0;
    return (rnd >>> 0) / 4294967296;
  };

  let th = 0;
  let dir = 1;
  let flipT = flipEvery;
  const omegaTrue = () => (PLAYER_SPEED / R) * dir;

  const playerAt = () => ({
    x: Math.cos(th) * R,
    y: Math.sin(th) * R,
    vx: -Math.sin(th) * PLAYER_SPEED * dir,
    vy: Math.cos(th) * PLAYER_SPEED * dir,
  });

  let p = playerAt();
  const fighter = { x: p.x + 520, y: p.y, vx: 0, vy: 0 };

  const bolts = [];
  let shots = 0;
  let hits = 0;
  let fireCd = 0;
  let mode = 'search';
  let modeT = 0;
  let evadeSide = 1;
  let wEst = 0;

  for (let step = 0; step < SECONDS / DT; step++) {
    // --- тактика игрока ---
    if (flipT !== null) {
      flipT -= DT;
      if (flipT <= 0) {
        flipT = flipEvery;
        dir = -dir;
      }
    }
    th += (dir * PLAYER_SPEED * DT) / R;
    p = playerAt();

    // --- восприятие: сглаженная угловая скорость курса ---
    wEst += (omegaTrue() - wEst) * (1 - Math.exp(-2.5 * DT));
    const circling = Math.abs(wEst) > 1.0;

    const fx = fighter.x;
    const fy = fighter.y;
    const toP = Math.atan2(p.y - fy, p.x - fx);
    const dist = Math.hypot(p.x - fx, p.y - fy);

    // --- выстрел ---
    const wUse = cfg.lead === 'arc' && circling ? wEst : 0;
    const tFlight =
      cfg.lead === 'arc'
        ? arcIntercept(fx, fy, p.x, p.y, p.vx, p.vy, wUse, cfg.boltSpeed)
        : linearIntercept(p.x - fx, p.y - fy, p.vx, p.vy, cfg.boltSpeed);

    const windowOpen =
      tFlight !== null &&
      tFlight >= 0.12 &&
      tFlight <= cfg.maxFlight &&
      Math.asin(Math.min(1, HIT_R / (tFlight * cfg.boltSpeed + 1))) >= 0.05;

    fireCd = Math.max(0, fireCd - DT);
    if (windowOpen && fireCd <= 0) {
      const [ix, iy] =
        cfg.lead === 'arc'
          ? arcPoint(p.x, p.y, p.vx, p.vy, wUse, tFlight)
          : [p.x + p.vx * tFlight, p.y + p.vy * tFlight];
      const angle = Math.atan2(iy - fy, ix - fx);
      bolts.push({
        x: fx + Math.cos(angle) * 14,
        y: fy + Math.sin(angle) * 14,
        vx: Math.cos(angle) * cfg.boltSpeed,
        vy: Math.sin(angle) * cfg.boltSpeed,
        age: 0,
      });
      shots++;
      fireCd = cfg.cooldown;
      // Как в коде: ближе FIGHTER_FIRE_KEEP_DIST — вираж, иначе остаёмся в строю.
      if (dist < 220) {
        mode = 'evade';
        modeT = 0;
        evadeSide = rand() < 0.5 ? 1 : -1;
      }
    }

    // --- руление ---
    let steerAngle = toP;
    let speed = cfg.fighterSpeed;

    if (mode === 'evade') {
      speed = cfg.fighterSpeed * 1.15;
      steerAngle = toP + Math.PI + (Math.PI / 3) * evadeSide;
      modeT += DT;
      if (modeT > 0.8) {
        mode = 'cooldown';
        modeT = 0;
      }
    } else if (mode === 'cooldown') {
      steerAngle = Math.atan2(fighter.vy, fighter.vx) + 0.35;
      modeT += DT;
      if (modeT > 1.2) {
        mode = 'search';
        modeT = 0;
      }
    } else if (cfg.mode === 'cut' && circling) {
      // Срез орбиты: внутреннее кольцо впереди по вращению.
      const Rs = PLAYER_SPEED / Math.abs(wEst);
      // Центр орбиты: r = P − C, v = ω × r  ⇒  P − C = (vy/ω, −vx/ω).
      const Cx = p.x - p.vy / wEst;
      const Cy = p.y + p.vx / wEst;
      const thp = Math.atan2(p.y - Cy, p.x - Cx);
      const rIn = Math.max(70, Math.min(Rs * 0.55, Rs - 60));
      // Как в коде: на тугой орбите опережение увеличивается, чтобы точка
      // среза не оказалась в упор (FIGHTER_CUT_DIST = 240).
      let leadAbs = 0.45;
      const cosLead = (rIn * rIn + Rs * Rs - 240 * 240) / (2 * rIn * Rs);
      if (Math.abs(cosLead) <= 1) leadAbs = Math.max(leadAbs, Math.acos(cosLead));
      const lead = leadAbs * Math.sign(wEst);
      const tx = Cx + Math.cos(thp + lead) * rIn;
      const ty = Cy + Math.sin(thp + lead) * rIn;
      steerAngle = Math.atan2(ty - fy, tx - fx);
      speed = cfg.fighterSpeed;
    } else {
      // standoff: держим 420 px, облетаем по касательной.
      const err = dist - 420;
      const mix = Math.max(0, Math.min(1, Math.abs(err) / 80));
      const radial = toP + (err > 0 ? 0 : Math.PI);
      const tangent = toP + Math.PI / 2;
      steerAngle = lerpAngle(tangent, radial, mix);
      speed = cfg.fighterSpeed * 0.9;
    }

    const k = 1 - Math.exp(-cfg.turnRate * DT);
    fighter.vx += (Math.cos(steerAngle) * speed - fighter.vx) * k;
    fighter.vy += (Math.sin(steerAngle) * speed - fighter.vy) * k;
    fighter.x += fighter.vx * DT;
    fighter.y += fighter.vy * DT;

    // --- болты ---
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i];
      b.x += b.vx * DT;
      b.y += b.vy * DT;
      b.age += DT;
      if (Math.hypot(b.x - p.x, b.y - p.y) <= HIT_R) {
        hits++;
        bolts.splice(i, 1);
      } else if (b.age > 3) {
        bolts.splice(i, 1);
      }
    }
  }

  return { shotsPerSec: shots / SECONDS, hitsPerSec: hits / SECONDS };
}

function run(name, cfg, opts) {
  const r = simulate(cfg, opts);
  const tag = `${name.padEnd(11)} R=${String(opts.R).padEnd(3)} ${
    opts.flipEvery ? 'с разворотами' : 'ровный облёт  '
  }`;
  console.log(
    `${tag} выстрелов/с=${r.shotsPerSec.toFixed(2).padStart(5)} ` +
      `попаданий/с=${r.hitsPerSec.toFixed(2).padStart(5)} ` +
      `урон/с≈${(r.hitsPerSec * 4.55).toFixed(1).padStart(4)}`
  );
}

const CASES = [250, 350, 500];

console.log('=== Сейчас: линейное упреждение, болт 300, файтер 432 ===');
for (const R of CASES) {
  run('baseline', CONFIGS.baseline, { R, flipEvery: null });
  run('baseline', CONFIGS.baseline, { R, flipEvery: 1.5 });
}

console.log('\n=== Только быстрый болт и срез орбиты, без дуги ===');
for (const R of CASES) {
  run('linear+fast', CONFIGS['linear+fast'], { R, flipEvery: null });
  run('linear+fast', CONFIGS['linear+fast'], { R, flipEvery: 1.5 });
}

console.log('\n=== Дуга + срез орбиты, скорость файтера прежняя ===');
for (const R of CASES) {
  run('cut-only', CONFIGS['cut-only'], { R, flipEvery: null });
  run('cut-only', CONFIGS['cut-only'], { R, flipEvery: 1.5 });
}

console.log('\n=== Дуга + срез орбиты + скорость файтера 480 ===');
for (const R of CASES) {
  run('arc+fast', CONFIGS['arc+fast'], { R, flipEvery: null });
  run('arc+fast', CONFIGS['arc+fast'], { R, flipEvery: 1.5 });
}

console.log('\n=== Итоговые числа (болт 720, окно 1.25 с) ===');
for (const R of CASES) {
  run('final', CONFIGS.final, { R, flipEvery: null });
  run('final', CONFIGS.final, { R, flipEvery: 1.5 });
}
