/**
 * PlayerDomain — жизненный цикл Singleton-сущности игрока.
 *
 * Игрок хранится в ECS как обычная сущность с базовыми компонентами
 * Position/Velocity/Radius/Life и узким PlayerComponent. Домен умеет
 * зарегистрировать игрока и отдать его живую связку компонентов.
 */

import { PLAYER_HITBOX_RADIUS } from "../../balance/player";
import { createPlayerState, type PlayerState } from "../../systems/PlayerState";
import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { LifeComponent } from "../components/LifeComponent";
import { PlayerComponent } from "../components/PlayerComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import type { PlayerRef } from "../refs";

export class PlayerDomain {
  private entity: GameEntity | null = null;

  constructor(private readonly ecs: EcsEngine) {}

  /**
   * Зарегистрировать игрока как Singleton-сущность ECS-мира.
   * Раскладывает состояние по базовым и узкому компонентам.
   */
  register(): PlayerState {
    if (this.entity) this.ecs.remove(this.entity);
    const entity = new GameEntity();
    const state = createPlayerState();
    entity.components.add(new PositionComponent(0, 0));
    entity.components.add(new VelocityComponent(0, 0));
    entity.components.add(new RadiusComponent(PLAYER_HITBOX_RADIUS));
    entity.components.add(new LifeComponent(100, 100));
    entity.components.add(new PlayerComponent(state.angle, state.invuln, state.thrusting, state.mass));
    this.ecs.add(entity);
    this.entity = entity;
    return state;
  }

  /** Живая связка компонентов игрока (или null, если игрока нет). */
  playerRef(): PlayerRef | null {
    if (!this.entity) return null;
    const entity = this.entity;
    const marker = entity.components.get(PlayerComponent);
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!marker || !position || !velocity || !radius || !life) return null;
    return { entity, marker, position, velocity, radius, life };
  }
}
