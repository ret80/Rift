/**
 * ECS — точка входа подсистемы Entity-Component-System (библиотека @trixt0r/ecs).
 *
 * Экспортирует мир (EcsWorld), базовую сущность, компоненты и системы
 * для перевода игровых доменов на ECS. Остальной код игры использует
 * только публичный API из этого модуля.
 */

export { EcsWorld } from "./EcsWorld";
export type { PlayerSource } from "./EcsWorld";
export { GameEntity } from "./GameEntity";

export { PickupComponent } from "./components/PickupComponent";
export { EnemyComponent } from "./components/EnemyComponent";
export { BulletComponent } from "./components/BulletComponent";
export { EnemyBulletComponent } from "./components/EnemyBulletComponent";
export { AllyDroneComponent } from "./components/AllyDroneComponent";
export { LaserBeamComponent } from "./components/LaserBeamComponent";
export { PlayerComponent } from "./components/PlayerComponent";
export { ParticleComponent } from "./components/ParticleComponent";
export { RingComponent } from "./components/RingComponent";
export { RiftComponent } from "./components/RiftComponent";
export { PickupMovementSystem } from "./systems/PickupMovementSystem";
export { PickupCollectionSystem } from "./systems/PickupCollectionSystem";