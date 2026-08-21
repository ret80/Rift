/**
 * EnemySystem - управление врагами.
 * Отвечает за AI, движение, стрельбу и состояние врагов.
 */

import type { AudioEngine } from '../audio';
import { EnemyKind, massForRadius } from '../balance';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import { TAU, lerpAngle as lerpAngleMath } from '../math';


// Флаг для отладки вращения кораблей
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;

function logRotation(tag: string, msg: string): void {
  if (!DEBUG_ROTATION) return;
  if (rotationLogCounter.enemy >= MAX_ROTATION_LOGS) return;
  console.log(`[ROTATION] ${tag}: ${msg}`);
}

interface EnemyFireData {
  x: number;
  y: number;
  kind: EnemyKind;
  angle: number;
  r: number;
  boltDmg: number;
  heavy: boolean;
  cruiser: boolean;
}

/** Пуля врага для уклонения от неё */
interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
}

interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  dead: boolean;
  parent: Enemy | null;
  mass: number;
  // Насколько сильно этот тип избегает других врагов (1.0 = база, 2.0 = сильно)
  dodgeWeight: number;
  // Cruiser dual turrets (independent cooldowns)
  tCd1?: number;
  tCd2?: number;
  // Carrier burst spawning
  burstSpawned: number; // drones spawned in current burst
  burstActive: boolean; // is burst phase active
  burstRestT: number; // countdown before next burst
  burstCd: number; // cooldown between individual spawns
  // Dodge maneuvers
  dodgeDir: number; // 1 = right, -1 = left, 0 = none
  dodgeTimer: number; // remaining time for dodge maneuver
}

interface EnemyDef {
  hp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  bolt: number;
  mass: number;
}

export class EnemySystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioEngine;
  private enemyFireCallback: (e: EnemyFireData) => void;
  private getZoneBounds: () => { x: number; y: number; radius: number; active: boolean };
  
  private enemies: Enemy[] = [];
  private wave = 1;
  
  // Для отрисовки
  public flock: Enemy[] = [];
  
  constructor(
    eventBus: EventBus,
    state: GameState,
    fx: Fx,
    audio: AudioEngine,
    enemyFireCallback: (e: EnemyFireData) => void,
    getZoneBounds: () => { x: number; y: number; radius: number; active: boolean }
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
    this.enemyFireCallback = enemyFireCallback;
    this.getZoneBounds = getZoneBounds;
  }
  
  reset(): void {
    this.enemies = [];
    this.flock = [];
  }
  
  setWave(wave: number): void {
    this.wave = wave;
  }
  
  getEnemies(): Enemy[] {
    return this.enemies;
  }
  
  getLiveCount(): number {
    return this.enemies.filter(e => !e.dead).length;
  }
  


  addEnemy(kind: EnemyKind, x: number, y: number, def: EnemyDef): void {
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === EnemyKind.Drone
      ? Math.atan2(this.state.player.y - y, this.state.player.x - x)
      : rand(0, TAU);
    logRotation('spawn', `${kind} at (${x.toFixed(0)},${y.toFixed(0)}) angle=${angle.toFixed(3)}`);
    const mass = massForRadius(def.r);
    // Cruiser gets dual turrets with staggered cooldowns
    const tStagger = rand(-0.5, 0.5);
    // Carrier gets burst spawning logic
    const carrierBurstActive = Math.random() < 0.5; // stagger initial state
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;
    // dodgeWeight: насколько сильно враг избегает других
    const dodgeWeight = this.getDodgeWeight(kind);
    this.enemies.push({
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      hp: def.hp,
      maxHp: def.hp,
      r: def.r,
      speed: def.speed,
      contact: def.contact,
      score: def.score,
      boltDmg: def.bolt,
      fireCd: rand(0.3, 1),
      mode: 0,
      modeT: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 100,
      spawnCd: rand(1, 2),
      flash: 0,
      hitCd: 0,
      dead: false,
      parent: null,
      mass,
      dodgeWeight,
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned,
      burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: 0.5,
      dodgeDir: 0,
      dodgeTimer: 0,
    });
  }
  
  update(dt: number, enemyList: Enemy[], playerPos: { x: number; y: number }, enemyBullets?: EnemyBullet[]): void {
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = 0;
    const playerVy = 0;
    const zone = this.getZoneBounds();
    const zoneTarget = zone.radius;
    
    // Копируем пули врагов (только живые, с оставшейся жизнью > 0.2s)
    const bullets: EnemyBullet[] = [];
    if (enemyBullets) {
      for (const b of enemyBullets) {
        if (b.life > 0.2) {
          bullets.push({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, life: b.life });
        }
      }
    }
    
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (e.dead) continue;
      
      e.flash = Math.max(0, e.flash - dt * 5);
      e.hitCd = Math.max(0, e.hitCd - dt);
      
      const dx = playerX - e.x;
      const dy = playerY - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      
      switch (e.kind) {
        case EnemyKind.Drone: {
          // Прямое преследование с боковыми уклонениями от пуль
          const angleToPlayer = Math.atan2(playerY - e.y, playerX - e.x);
          
          // Фланговое смещение — чем выше волна, тем агрессивнее
          const flankFactor = Math.min(0.3, 0.05 + this.wave * 0.01);
          const flankAngle = Math.sin(e.seed + this.wave * 0.5) * flankFactor;
          let targetAngle = angleToPlayer + flankAngle;
          
          // Уклонение от пуль: боковой манёвр влево/вправо
          if (bullets.length > 0) {
            const dodgeRadius = 180 + this.wave * 2; // радиус обнаружения пуль
            let bestDir = 0; // 1 = вправо, -1 = влево, 0 = не уклоняемся
            
            for (const b of bullets) {
              const bdx = b.x - e.x;
              const bdy = b.y - e.y;
              const bDist = Math.hypot(bdx, bdy);
              
              if (bDist < dodgeRadius) {
                // Вектор направления пули
                const bulletSpeed = Math.hypot(b.vx, b.vy);
                if (bulletSpeed < 50) continue;
                const bdxN = b.vx / bulletSpeed;
                const bdyN = b.vy / bulletSpeed;
                
                // Время до столкновения (если летит в дрона)
                const relX = (playerX - e.x) - b.x + e.x;
                const relY = (playerY - e.y) - b.y + e.y;
                const dotProduct = bdxN * bdx + bdyN * bdy;
                
                // Пуля летит к дрону? (dot > 0)
                if (dotProduct < 0) continue;
                
                // Расстояние до точкиclosest point на траектории пули
                const projectedDist = bDist - (dotProduct * bDist);
                
                if (projectedDist < 100) {
                  // Пуля летит в дрона — нужно уклониться
                  // Перпендикулярный вектор (направо и налево)
                  // Нормаль: (-vy, vx) и (vy, -vx)
                  const perpX = -bdyN;
                  const perpY = bdxN;
                  
                  // Проверяем, свободна ли сторона вправо (перпендикуляр)
                  // и левая (обратный перпендикуляр)
                  // Выбираем сторону, где меньше препятствий (простая эвристика)
                  const rightSideDist = this.checkSideFree(e.x, e.y, perpX, perpY, e.vx, e.vy, bullets, this.enemies);
                  const leftSideDist = this.checkSideFree(e.x, e.y, -perpX, -perpY, -e.vx, -e.vy, bullets, this.enemies);
                  
                  // Предпочитаем сторону с большим расстоянием
                  let chooseRight = rightSideDist > leftSideDist;
                  
                  // Предпочитаем противоположную сторону от последнего манёвра
                  if (e.dodgeDir !== 0) {
                    const oppositeRight = e.dodgeDir < 0; // предыдущий влево → сейчас вправо
                    const oppositeLeft = e.dodgeDir > 0;
                    // Смещаем выбор в пользу противоположной стороны
                    if (oppositeRight && chooseRight) {
                      // обе рекомендуют вправо — оставляем
                    } else if (oppositeRight) {
                      chooseRight = Math.random() < 0.7; // 70% шанс вправо
                    } else if (oppositeLeft && !chooseRight) {
                      chooseRight = Math.random() < 0.3; // 30% шанс вправо (т.е. 70% влево)
                    }
                  }
                  
                  bestDir = chooseRight ? 1 : -1;
                  break; // нашли угрозу — выбираем направление
                }
              }
            }
            
            if (bestDir !== 0) {
              // Боковое смещение перпендикулярно направлению к игроку
              const lateralAngle = angleToPlayer + (bestDir > 0 ? Math.PI / 2 : -Math.PI / 2);
              const dodgeForce = 0.8;
              targetAngle = this.lerpAngleAngle(targetAngle, lateralAngle, dodgeForce);
              e.dodgeDir = bestDir; // запоминаем направление
              e.dodgeTimer = 0.3; // таймер на манёвр
            }
          }
          
          // Таймер уклонения — после истечения возвращаемся к преследованию
          if (e.dodgeTimer > 0) {
            e.dodgeTimer -= dt;
          } else {
            e.dodgeDir = 0; // сбрасываем направление
          }
          
          // Скорость зависит от дистанции — чем дальше, тем быстрее
          const speedMult = Math.min(1.5, 0.8 + dist / 400);
          const speed = e.speed * speedMult;
          
          const k = 1 - Math.exp(-6 * dt);
          e.vx += (Math.cos(targetAngle) * speed - e.vx) * k;
          e.vy += (Math.sin(targetAngle) * speed - e.vy) * k;
          
          // Rotation: face movement direction
          const dsp = Math.hypot(e.vx, e.vy);
          if (dsp > 5) {
            const movementAngle = Math.atan2(e.vy, e.vx);
            e.angle = lerpAngleMath(e.angle, movementAngle, 1 - Math.exp(-5 * dt));
          }
          break;
        }
        
        case EnemyKind.Hunter: {
          // Улучшенное предсказание с прогрессией — чем выше волна, тем лучше предсказание
          const lookahead = 0.4 + this.wave * 0.03;
          const leadX = playerX + playerVx * lookahead;
          const leadY = playerY + playerVy * lookahead;
          const hx = leadX - e.x;
          const hy = leadY - e.y;
          const hd = Math.hypot(hx, hy) || 1;
          const k = 1 - Math.exp(-(hd < 120 ? 7.5 : 4.5) * dt);
          e.vx += ((hx / hd) * e.speed - e.vx) * k;
          e.vy += ((hy / hd) * e.speed - e.vy) * k;
          const hv = Math.hypot(e.vx, e.vy);
          if (hv > 5) {
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-6 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] hunter: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
            }
          }
          break;
        }
        
        case EnemyKind.Fighter: {
          // Атака с дистанции: сближение → удержание идеальной дистанции → орбита
          const angleToPlayer = Math.atan2(playerY - e.y, playerX - e.x);
          
          // Идеальная дистанция стрельбы — 200-280
          const idealDist = 220 + Math.sin(e.modeT * 0.3) * 30;
          
          if (dist > idealDist * 1.2) {
            // Сближение
            const targetAngle = angleToPlayer;
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, dt * 5);
            const speed = e.speed * 1.1;
            e.vx += (Math.cos(targetAngle) * speed - e.vx) * (1 - Math.exp(-5 * dt));
            e.vy += (Math.sin(targetAngle) * speed - e.vy) * (1 - Math.exp(-5 * dt));
          } else if (dist < idealDist * 0.7) {
            // Отступление
            const targetAngle = angleToPlayer + Math.PI;
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, dt * 4);
            const speed = e.speed * 0.7;
            e.vx += (Math.cos(targetAngle) * speed - e.vx) * (1 - Math.exp(-4 * dt));
            e.vy += (Math.sin(targetAngle) * speed - e.vy) * (1 - Math.exp(-4 * dt));
          } else {
            // Удержание дистанции + движение по касательной (страф)
            const tangent = angleToPlayer + Math.PI / 2 * e.strafeDir;
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, tangent, dt * 3);
            const speed = e.speed * 0.6;
            e.vx += (Math.cos(tangent) * speed - e.vx) * (1 - Math.exp(-4 * dt));
            e.vy += (Math.sin(tangent) * speed - e.vy) * (1 - Math.exp(-4 * dt));
          }
          
          e.modeT -= dt;
          if (e.modeT <= 0) {
            e.modeT = rand(1.5, 3);
            e.strafeDir *= -1; // меняем направление страфа
          }
          
          const kAngle = 1 - Math.exp(-6 * dt);
          const oldAngleF = e.angle;
          e.angle = lerpAngleMath(e.angle, Math.atan2(e.vy, e.vx), kAngle);
          let angleDeltaF = e.angle - oldAngleF;
          while (angleDeltaF > Math.PI) angleDeltaF -= TAU;
          while (angleDeltaF < -Math.PI) angleDeltaF += TAU;
          if (DEBUG_ROTATION && Math.abs(angleDeltaF) > 0.3) {
            rotationLogCounter.enemy++;
            console.log(`[ROTATION] fighter(dist=${dist.toFixed(0)}): angle ${oldAngleF.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDeltaF.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
          }
          break;
        }
        
        case EnemyKind.Cruiser: {
          let escort: Enemy | null = null;
          let ed = 1e9;
          for (const o of this.enemies) {
            if (o.kind !== EnemyKind.Carrier || o.dead) continue;
            const dd = Math.hypot(e.x - o.x, e.y - o.y);
            if (dd < ed) {
              ed = dd;
              escort = o;
            }
          }
          
          let desX: number;
          let desY: number;
          
          if (escort && ed < 290) {
            const ox = e.x - escort.x;
            const oy = e.y - escort.y;
            const od = Math.hypot(ox, oy) || 1;
            const radial = (od - 150) * 1.2;
            desX = (ox / od) * radial + (-oy / od) * e.strafeDir * e.speed;
            desY = (oy / od) * radial + (ox / od) * e.strafeDir * e.speed;
          } else {
            const zr = zoneTarget > 0 ? zoneTarget : 420;
            const HOLD = Math.min(400, zr * 0.8);
            const radial = (dist - HOLD) * 1.0;
            desX = dirX * radial + -dirY * e.strafeDir * e.speed * 0.6;
            desY = dirY * radial + dirX * e.strafeDir * e.speed * 0.6;
          }
          
          for (const o of this.enemies) {
            if (o === e || o.dead) continue;
            const ddx = e.x - o.x;
            const ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            const minSep = (e.r + o.r) * 1.1;
            if (d2 < minSep * minSep && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = (minSep - d) / d * 180;
              desX += (ddx / d) * push;
              desY += (ddy / d) * push;
            }
          }
          
          const k = 1 - Math.exp(-2.8 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const sp = Math.hypot(e.vx, e.vy);
          if (sp > 5) {
            // Плавные повороты: lerp factor снижен с 6 до 4
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-4 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] cruiser: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
            }
          }
          break;
        }
        
        case EnemyKind.Carrier: {
          const HOLD = 480;
          const radial = (dist - HOLD) * 0.7;
          let desX = dirX * radial + -dirY * e.strafeDir * e.speed * 0.4;
          let desY = dirY * radial + dirX * e.strafeDir * e.speed * 0.4;
          
          for (const o of this.enemies) {
            if (o === e || o.dead) continue;
            // Исключаем parent-child коллизии: carrier не должен избегать дроны, которые он спавнит
            if (o.parent === e || e.parent === o) continue;
            const ddx = e.x - o.x;
            const ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            const minSep = (e.r + o.r) * 1.05;
            if (d2 < minSep * minSep && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = (minSep - d) / d * 120;
              desX += (ddx / d) * push;
              desY += (ddy / d) * push;
            }
          }
          
          const k = 1 - Math.exp(-2.2 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const sp = Math.hypot(e.vx, e.vy);
          if (sp > 5) {
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-5 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] carrier: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
            }
          }
          
          // spawn drones in bursts: more aggressive with wave progression
          const maxDrones = 12 + Math.floor(this.wave / 5);
          if (e.burstActive) {
            // Burst phase: spawn drones
            e.burstCd -= dt;
            if (e.burstCd <= 0 && this.getLiveCount() < 30 && e.burstSpawned < maxDrones) {
              e.burstCd = 0.35; // faster spawn rate
              e.burstSpawned++;
              // Random offset so drones don't spawn exactly at carrier center
              const angle = Math.random() * TAU;
              const offset = e.r + 25;
              const spawnX = e.x + Math.cos(angle) * offset;
              const spawnY = e.y + Math.sin(angle) * offset;
              this.eventBus.emit('carrierSpawnDrone', { x: spawnX, y: spawnY, parent: e });
            }
            // End of burst?
            if (e.burstSpawned >= maxDrones) {
              e.burstActive = false;
              e.burstRestT = rand(3, 6); // shorter rest
            }
          } else {
            // Rest phase: countdown
            e.burstRestT -= dt;
            if (e.burstRestT <= 0) {
              e.burstActive = true;
              e.burstSpawned = 0;
            }
          }
          break;
        }
      }
      
      // apply velocity
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      
      // shooting logic
      if (e.kind === EnemyKind.Fighter || e.kind === EnemyKind.Cruiser || e.kind === EnemyKind.Carrier) {
        const canShoot = (e.kind === EnemyKind.Fighter && dist < 500) ||
                        (e.kind === EnemyKind.Cruiser && dist < 380) ||
                        (e.kind === EnemyKind.Carrier && dist < 500);
        
        if (canShoot) {
          // Cruiser: dual independent turrets with staggered cooldowns
          if (e.kind === EnemyKind.Cruiser) {
            const accuracy = this.getAccuracy(this.wave);
            const spread = (1 - accuracy) * 0.8;
            // Скорость пуль +20%: 540+w*3 → 648+w*3.6
            const speed = 648 + this.wave * 3.6;
            const rate = 1.5 / (3 + this.wave * 0.08);
            
            // Turret 1 (port side)
            e.tCd1! -= dt;
            if (e.tCd1! <= 0) {
              e.tCd1! = rate + rand(-0.15, 0.15);
              const perpA = e.angle + Math.PI / 2;
              const tx = e.x - Math.sin(e.angle) * 14;
              const ty = e.y + Math.cos(e.angle) * 14;
              const tAngle = Math.atan2(playerY - ty, playerX - tx) + (Math.random() - 0.5) * 2 * spread;
              
              this.enemyFireCallback({
                x: tx, y: ty,
                kind: e.kind,
                angle: tAngle,
                r: e.r,
                boltDmg: e.boltDmg,
                heavy: true,
                cruiser: true,
              });
              this.audio.heavyShoot();
            }
            
            // Turret 2 (starboard side)
            e.tCd2! -= dt;
            if (e.tCd2! <= 0) {
              e.tCd2! = rate + rand(-0.15, 0.15);
              const perpA = e.angle + Math.PI / 2;
              const tx = e.x + Math.sin(e.angle) * 14;
              const ty = e.y - Math.cos(e.angle) * 14;
              const tAngle = Math.atan2(playerY - ty, playerX - tx) + (Math.random() - 0.5) * 2 * spread;
              
              this.enemyFireCallback({
                x: tx, y: ty,
                kind: e.kind,
                angle: tAngle,
                r: e.r,
                boltDmg: e.boltDmg,
                heavy: true,
                cruiser: true,
              });
              this.audio.heavyShoot();
            }
          } else {
            // Fighter and carrier: single turret
            const accuracy = this.getAccuracy(this.wave);
            const spread = (1 - accuracy) * 1.2;
            // Скорость пуль = скорости игрока (560), с малой прогрессией
            const speed = e.kind === EnemyKind.Fighter ? 560 + this.wave * 0.5 : 560 + this.wave * 0.5;
            const life = e.kind === EnemyKind.Fighter ? 1.35 : 1.8;
            const baseRate = e.kind === EnemyKind.Fighter ? 0.8 : 1.5; //fighter = cruiser rate
            const waveBoost = Math.min(2.5, 1 + this.wave * 0.08);
            e.fireCd -= dt * waveBoost;
            
            if (e.fireCd <= 0) {
              e.fireCd = baseRate; // сбрасываем на baseRate для нового цикла
              const heavy = e.kind === EnemyKind.Carrier;
              
              this.enemyFireCallback({
                x: e.x,
                y: e.y,
                kind: e.kind,
                angle: e.angle + (Math.random() - 0.5) * 2 * spread,
                r: e.r,
                boltDmg: e.boltDmg,
                heavy: heavy,
                cruiser: false,
              });
              
              if (heavy) this.audio.heavyShoot();
              else this.audio.enemyShoot();
            }
          }
        }
      }
    }
    
    // Simple collision avoidance between all enemies (replaces RVO)
    this.applyAvoidance(dt);
  }
  
  /** Мягко раздвигает врагов, которые слишком близко друг к другу */
  private applyAvoidance(dt: number): void {
    const minDist = 35; // базовая дистанция избежания
    const basePush = 1.2; // сила отталкивания (нормализована к 60fps)
    
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        
        // Исключаем parent-child коллизии
        if (a.parent === b || b.parent === a) continue;
        
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const minDistSq = minDist * minDist;
        
        if (distSq < minDistSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          // Push сильнее при близости: от 0 до basePush
          const push = (1 - dist / minDist) * basePush;
          const pushX = (dx / dist) * push;
          const pushY = (dy / dist) * push;
          
          // dodgeWeight определяет насколько сильно каждый враг избегает
          const aMult = a.dodgeWeight || 1.0;
          const bMult = b.dodgeWeight || 1.0;
          
          // dt уже учтён в basePush (нормализация к 60fps)
          a.vx += pushX * aMult;
          a.vy += pushY * aMult;
          b.vx -= pushX * bMult;
          b.vy -= pushY * bMult;
        }
      }
    }
  }

  /** Возвращает weight для avoidance: насколько сильно корабль должен избегать других */
  private getDodgeWeight(kind: EnemyKind): number {
    switch (kind) {
      case 'drone':     return 2.5; // рой должен рассеиваться
      case 'hunter':    return 1.5; // охотники маневрируют
      case 'fighter':   return 1.2; // истребители — умеренно
      case 'cruiser':   return 1.0; // тяжёлые — по базе
      case 'carrier':   return 0.8; // носители — меньше избегают
      default:          return 1.0;
    }
  }
  
  damageEnemy(index: number, dmg: number): boolean {
    if (index < 0 || index >= this.enemies.length) return false;
    
    const e = this.enemies[index];
    if (e.dead) return false;
    
    e.hp -= dmg;
    e.hitCd = 0.15;
    
    if (e.hp <= 0) {
      e.dead = true;
      return true; // enemy killed
    }
    
    return false;
  }
  
  removeDead(): void {
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  spawn(kind: EnemyKind, x: number, y: number, parent: Enemy | null, enemyList: any[]): void {
    const def = this.getEnemyDef(kind);
    const mass = massForRadius(def.r);
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === EnemyKind.Drone
      ? Math.atan2(this.state.player.y - y, this.state.player.x - x)
      : rand(0, TAU);
    logRotation('spawn', `${kind} at (${x.toFixed(0)},${y.toFixed(0)}) angle=${angle.toFixed(3)}`);
    // Cruiser gets dual turrets with staggered cooldowns
    const tStagger = rand(-0.5, 0.5);
    // Carrier gets burst spawning logic
    const carrierBurstActive = Math.random() < 0.5;
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;
    const e: Enemy = {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      hp: def.hp,
      maxHp: def.hp,
      r: def.r,
      speed: def.speed,
      contact: def.contact,
      score: def.score,
      boltDmg: def.bolt,
      fireCd: rand(0.3, 1),
      mode: 0,
      modeT: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 100,
      spawnCd: rand(1, 2),
      flash: 0,
      hitCd: 0,
      dead: false,
      parent,
      mass,
      dodgeWeight: this.getDodgeWeight(kind),
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned,
      burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: rand(0.7, 1.2),
      dodgeDir: 0,
      dodgeTimer: 0,
    };
    // Добавляем И во внутренний массив И во внешний (enemyList)
    // чтобы рендерер и коллизии видели врага
    this.enemies.push(e);
    enemyList.push(e);
    if (parent) {
      parent.spawnCd = 0;
    }
  }
  
  /** Ограничивает врагов пределами зоны волны */
  clampEnemiesToZone(zoneX: number, zoneY: number, zoneR: number, zoneOn: boolean): void {
    if (!zoneOn || zoneR <= 0) return;
    
    for (const e of this.enemies) {
      if (e.dead) continue;
      
      const dx = e.x - zoneX;
      const dy = e.y - zoneY;
      const dist = Math.hypot(dx, dy);
      const limit = zoneR - e.r;
      
      if (dist > limit) {
        const angle = Math.atan2(dy, dx);
        e.x = zoneX + Math.cos(angle) * limit;
        e.y = zoneY + Math.sin(angle) * limit;
        
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const dot = e.vx * nx + e.vy * ny;
        if (dot > 0) {
          const oldVx = e.vx;
          const oldVy = e.vy;
          e.vx -= 2 * dot * nx;
          e.vy -= 2 * dot * ny;
          logRotation('clamped', `${e.kind} at (${e.x.toFixed(0)},${e.y.toFixed(0)}) vx ${oldVx.toFixed(1)}→${e.vx.toFixed(1)}, vy ${oldVy.toFixed(1)}→${e.vy.toFixed(1)}`);
        }
      }
    }
  }

  /** Меткость врагов: 0.3 на волне 1, растёт до 0.7 к волне 30. */
  private getAccuracy(wave: number): number {
    return Math.min(0.7, 0.3 + wave * 0.013);
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    const w = this.wave;
    switch (kind) {
      case EnemyKind.Drone:
        // +30%: 295*1.3 ≈ 384: 384 + w*2, ~426 к волне 22
        return { hp: 8, r: 14, speed: 384 + w * 2, contact: 12, score: 10, bolt: 8, mass: massForRadius(14) };
      case EnemyKind.Hunter:
        // Быстрее игрока: 290 + w*2, ~334 к волне 22
        return { hp: 20, r: 14, speed: 290 + w * 2, contact: 16, score: 25, bolt: 12, mass: massForRadius(14) };
      case EnemyKind.Fighter:
        // Скорость игрока (211) * 1.1 = 232 + w*0.5, ~243 к волне 22
        return { hp: 35, r: 18, speed: 232 + w * 0.5, contact: 20, score: 40, bolt: 15, mass: massForRadius(18) };
      case EnemyKind.Cruiser:
        // Тяжёлый, медленный: 60 + w*1.5, ~93 к волне 22
        return { hp: 250, r: 26, speed: 60 + w * 1.5, contact: 24, score: 80, bolt: 18, mass: massForRadius(26) };
      case EnemyKind.Carrier:
        // Самый медленный: 50 + w*1, ~72 к волне 22
        return { hp: 350, r: 41, speed: 50 + w * 1, contact: 30, score: 150, bolt: 25, mass: massForRadius(41) };
      default:
        return { hp: 10, r: 12, speed: 80, contact: 14, score: 15, bolt: 10, mass: massForRadius(12) };
    }
  }

  /** Сложение двух углов с учётом весов (для blended dodge) */
  private lerpAngleAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    return a + diff * t;
  }
  
  /**
   * Проверяет, свободна ли сторона от столкновений.
   * Возвращает минимальное расстояние до любой пули/врага в этом направлении.
   */
  private checkSideFree(
    ex: number, ey: number,
    nx: number, ny: number, // направление проверки (нормализованное)
    evx: number, evy: number, // текущая скорость дрона
    bullets: Array<{x: number; y: number; vx: number; vy: number; life: number}>,
    allEnemies: Array<{x: number; y: number; kind: string; dead: boolean}>
  ): number {
    const checkDist = 120;
    let minDist = 9999;
    
    // Проверяем пули
    for (const b of bullets) {
      const dx = b.x - ex;
      const dy = b.y - ey;
      const proj = dx * nx + dy * ny;
      if (proj < 0 || proj > checkDist) continue;
      
      // Перпендикулярное расстояние
      const perpDist = Math.abs(dx * ny - dy * nx);
      if (perpDist < minDist) minDist = perpDist;
    }
    
    // Проверяем других врагов
    for (const other of allEnemies) {
      if (other.dead) continue;
      const dx = other.x - ex;
      const dy = other.y - ey;
      const proj = dx * nx + dy * ny;
      if (proj < 0 || proj > checkDist) continue;
      
      const perpDist = Math.abs(dx * ny - dy * nx);
      if (perpDist < minDist) minDist = perpDist;
    }
    
    return minDist;
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

