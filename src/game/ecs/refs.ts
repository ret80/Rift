/**
 * Живые связки компонентов и общие источники данных ECS-мира.
 *
 * Связки — это не DTO: все поля являются ссылками на реальные компоненты,
 * поэтому чтение и запись идут напрямую в ECS без копирования каждый кадр.
 * Типы вынесены отдельно от фасада, чтобы домены и системы не зависели
 * друг от друга циклически.
 */

import type { GameEntity } from "./GameEntity";
import type { AsteroidComponent } from "./components/AsteroidComponent";
import type { AllyDroneComponent } from "./components/AllyDroneComponent";
import type { BulletComponent } from "./components/BulletComponent";
import type { BulletSweepComponent } from "./components/BulletSweepComponent";
import type { EnemyBulletComponent } from "./components/EnemyBulletComponent";
import type { EnemyComponent } from "./components/EnemyComponent";
import type { HomingRef } from "./components/HomingRef";
import type { LaserBeamComponent } from "./components/LaserBeamComponent";
import type { PickupKindComponent } from "./components/PickupKindComponent";
import type { PlayerComponent } from "./components/PlayerComponent";
import type { PositionComponent } from "./components/PositionComponent";
import type { RadiusComponent } from "./components/RadiusComponent";
import type { VelocityComponent } from "./components/VelocityComponent";
import type { LifeComponent } from "./components/LifeComponent";

/** Источник позиции игрока (хитбокс) для систем пикапов. */
export type PlayerSource = () => { x: number; y: number; r: number };

/** Живая связка компонентов астероида. */
export interface AsteroidRef {
  entity: GameEntity;
  marker: AsteroidComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Живая связка компонентов дрона-компаньона. */
export interface DroneRef {
  entity: GameEntity;
  marker: AllyDroneComponent;
  position: PositionComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Живая связка компонентов игрока (Singleton-сущность). */
export interface PlayerRef {
  entity: GameEntity;
  marker: PlayerComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Живая связка компонентов врага. */
export interface EnemyRef {
  entity: GameEntity;
  marker: EnemyComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Живая связка компонентов снаряда игрока. */
export interface BulletRef {
  entity: GameEntity;
  bullet: BulletComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  life: LifeComponent;
  /** Компонент самонаведения (только у ракет). */
  homing?: HomingRef;
}

/** Живая связка компонентов вражеского снаряда. */
export interface EnemyBulletRef {
  entity: GameEntity;
  bullet: EnemyBulletComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  life: LifeComponent;
  radius: RadiusComponent;
  sweep: BulletSweepComponent;
}

/** Живая связка компонентов пикапа. */
export interface PickupRef {
  entity: GameEntity;
  kind: PickupKindComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  life: LifeComponent;
  radius: RadiusComponent;
  /** Детерминированный визуальный seed из id сущности. */
  seed: number;
}

/** Живая связка компонентов визуального луча лазера. */
export interface BeamRef {
  entity: GameEntity;
  beam: LaserBeamComponent;
  life: LifeComponent;
}

/** Данные для спавна астероида (раскладываются по базовым+доменным компонентам). */
export type AsteroidSpawn = Partial<Omit<AsteroidComponent, "type" | "id">> & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
};

/** Данные для спавна дрона-компаньона (раскладываются по базовым+доменным компонентам). */
export type AllyDroneSpawn = Partial<Omit<AllyDroneComponent, "type" | "id">> & {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
};
