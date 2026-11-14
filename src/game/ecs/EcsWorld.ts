/**
 * EcsWorld — тонкий фасад-агрегатор EcsEngine и доменов сущностей.
 *
 * Мир не знает, как устроены отдельные типы сущностей: игрок, враги, пули, пикапы,
 * астероиды, дроны, лучи, эффекты и разломы живут в собственных доменах.
 * Фасад — единая точка сборки для GameContext: регистрирует ECS-системы,
 * делегирует операции доменам и собирает тела кадра для физики (Engine наружу не отдаётся).
 */

import type { System } from "@trixt0r/ecs";
import type { EnemyKind, PickupKind } from "../balance";
import type { EventBus } from "../core/EventBus";
import type { PhysicsEntity } from "../physics/IPhysics";
import { BulletSystem } from "./systems/BulletSystem";
import type { Particle, Rift, Ring } from "../types/world";
import { AsteroidDomain } from "./domains/AsteroidDomain";
import { BeamDomain } from "./domains/BeamDomain";
import { BulletDomain } from "./domains/BulletDomain";
import { DroneDomain } from "./domains/DroneDomain";
import { EffectDomain } from "./domains/EffectDomain";
import { EnemyDomain, type EnemySystemDeps } from "./domains/EnemyDomain";
import { PickupDomain } from "./domains/PickupDomain";
import { PlayerDomain } from "./domains/PlayerDomain";
import { RiftDomain } from "./domains/RiftDomain";
import { EcsEngine } from "./EcsEngine";
import { collectPhysicsBodies } from "./physicsBodies";
import type {
    AllyDroneSpawn,
    AsteroidRef,
    AsteroidSpawn,
    BeamRef,
    BulletRef,
    DroneRef,
    EnemyBulletRef,
    EnemyRef,
    PickupRef,
    PlayerRef,
    PlayerSource,
} from "./refs";
import type { BeamSpawn, BulletSpawn, EnemySpawn } from "./spawn";
import { BeamSystem } from "./systems/BeamSystem";
import { ParticleSystem } from "./systems/ParticleSystem";
import { PickupCollectionSystem } from "./systems/PickupCollectionSystem";
import { PickupMovementSystem } from "./systems/PickupMovementSystem";
import { RingSystem } from "./systems/RingSystem";
import { ZoneEnemyPullSystem } from "./systems/ZoneEnemyPullSystem";
import { AsteroidBeltSystem } from "./systems/AsteroidBeltSystem";
import type { PhasedSystem } from "./SystemSchedule";

export class EcsWorld {
  private readonly core = new EcsEngine();
  private readonly playerDomain = new PlayerDomain(this.core);
  private readonly bulletDomain = new BulletDomain(this.core);
  private readonly pickupDomain = new PickupDomain(this.core);
  private readonly asteroidDomain = new AsteroidDomain(this.core);
  private readonly droneDomain = new DroneDomain(this.core);
  private readonly beamDomain = new BeamDomain(this.core);
  private readonly effectDomain = new EffectDomain(this.core);
  private readonly riftDomain = new RiftDomain(this.core);
  private readonly enemyDomain: EnemyDomain;
  /** ECS-системы мира в порядке регистрации (фазы заданы SystemSchedule). */
  readonly systems: readonly PhasedSystem[];

  constructor(
    eventBus: EventBus,
    getPlayer: PlayerSource,
    deps: EnemySystemDeps,
    onPickupCollected: (kind: PickupKind) => void,
  ) {
    this.enemyDomain = new EnemyDomain(this.core, eventBus, deps, (...shot) =>
      this.bulletDomain.spawnEnemyBullet(...shot),
    );

    // Порядок важен для систем с одинаковой фазой: внутри фазы он сохраняется.
    this.systems = [
      new PickupMovementSystem(getPlayer, deps.isPickupMagnetDisabled, deps.getPickupMagnetRadius),
      new PickupCollectionSystem(eventBus, getPlayer, onPickupCollected),
      new ParticleSystem(),
      new RingSystem(),
      new BeamSystem(),
      new BulletSystem(),
      ...this.enemyDomain.systems,
      new ZoneEnemyPullSystem(this.core, deps.getZoneBounds),
      new AsteroidBeltSystem(this.core, deps.getZoneBounds),
    ];
  }

  addSystem(system: System): void { this.core.engine.systems.add(system); }
  update(dt: number): void { this.core.update(dt); }
  physicsBodies(): PhysicsEntity[] {
    return collectPhysicsBodies(this.core, this.playerDomain, this.enemyDomain, this.asteroidDomain);
  }
  /** Метрики роя дронов для debug-оверлея. */
  swarmMetrics(): { groups: number; detached: number; directions: string } {
    return {
      groups: this.enemyDomain.swarmGroups,
      detached: this.enemyDomain.swarmDetached,
      directions: this.enemyDomain.swarmDirections,
    };
  }

  /** Сколько астероидов сейчас захвачено поясом. */
  beltRockCount(): number {
    let count = 0;
    for (const asteroid of this.asteroidDomain.asteroids()) {
      if (asteroid.marker.beltState === "captured") count++;
    }
    return count;
  }

  clear(): void { this.core.clear(); }
  resetEnemyWave(): void { this.enemyDomain.resetWave(); }
  setEnemyWave(wave: number): void { this.enemyDomain.setWave(wave); }
  registerPlayer(): void { this.playerDomain.register(); }
  playerRef(): PlayerRef | null { return this.playerDomain.playerRef(); }
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    this.pickupDomain.spawn(kind, x, y, vx, vy);
  }
  pickups(out?: PickupRef[]): PickupRef[] { return this.pickupDomain.pickups(out); }
  clearPickups(): void { this.pickupDomain.clear(); }
  asteroids(out?: AsteroidRef[]): AsteroidRef[] { return this.asteroidDomain.asteroids(out); }
  spawnAsteroid(state: AsteroidSpawn): void { this.asteroidDomain.spawn(state); }
  asteroidByKey(key: string): AsteroidRef | null { return this.asteroidDomain.byKey(key); }
  removeAsteroidByKey(key: string): void { this.asteroidDomain.removeByKey(key); }
  clearAsteroids(): void { this.asteroidDomain.clear(); }

  addEnemy(enemy: EnemySpawn): void { this.enemyDomain.addEnemy(enemy); }
  enemies(out?: EnemyRef[]): EnemyRef[] { return this.enemyDomain.enemies(out); }
  enemyRefByEntity(entity: EnemyRef["entity"]): EnemyRef | null {
    return this.enemyDomain.enemyRefByEntity(entity);
  }
  spawnEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    parent: EnemyRef | null,
    playerPos?: { x: number; y: number },
  ): void {
    this.enemyDomain.spawnEnemy(kind, x, y, parent, playerPos);
  }
  damageEnemy(id: number | string, dmg: number): boolean { return this.enemyDomain.damageEnemy(id, dmg); }
  healEnemy(id: number | string, amount: number): void { this.enemyDomain.healEnemyById(id, amount); }
  forceKillEnemy(enemy: EnemyRef): void { this.enemyDomain.forceKillEnemy(enemy); }
  clearEnemies(): void { this.enemyDomain.clear(); }

  addBullet(bullet: BulletSpawn): void { this.bulletDomain.addBullet(bullet); }
  bullets(out?: BulletRef[]): BulletRef[] { return this.bulletDomain.bullets(out); }
  enemyBullets(out?: EnemyBulletRef[]): EnemyBulletRef[] { return this.bulletDomain.enemyBullets(out); }
  removeBullet(bullet: BulletRef): void { this.bulletDomain.removeBullet(bullet); }
  removeEnemyBullet(bullet: EnemyBulletRef): void { this.bulletDomain.removeEnemyBullet(bullet); }
  clearBullets(): void { this.bulletDomain.clearBullets(); }
  clearEnemyBullets(): void { this.bulletDomain.clearEnemyBullets(); }

  allyDrones(out?: DroneRef[]): DroneRef[] { return this.droneDomain.allyDrones(out); }
  addAllyDrone(state: AllyDroneSpawn): void { this.droneDomain.add(state); }
  removeAllyDroneById(id: number | string): void { this.droneDomain.removeById(id); }
  damageAllyDrone(id: number | string, dmg: number): boolean { return this.droneDomain.damage(id, dmg); }
  clearAllyDrones(): void { this.droneDomain.clear(); }

  addBeam(beam: BeamSpawn): void { this.beamDomain.add(beam); }
  beams(out?: BeamRef[]): BeamRef[] { return this.beamDomain.beams(out); }
  clearBeams(): void { this.beamDomain.clear(); }

  addParticle(particle: Particle): void { this.effectDomain.addParticle(particle); }
  particles(): Particle[] { return this.effectDomain.particles(); }
  clearParticles(): void { this.effectDomain.clearParticles(); }
  addRing(ring: Ring): void { this.effectDomain.addRing(ring); }
  rings(): Ring[] { return this.effectDomain.rings(); }
  clearRings(): void { this.effectDomain.clearRings(); }

  addRift(rift: Rift): void { this.riftDomain.add(rift); }
  rifts(): Rift[] { return this.riftDomain.rifts(); }
  clearRifts(): void { this.riftDomain.clear(); }
}
