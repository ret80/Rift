/**
 * GameListeners — подписки игрового уровня на события EventBus.
 * Слой координирует FSM-переходы, запуск волны, проверку завершения
 * волны и спавн вражеских пуль. Ничего не владеет системами: все
 * зависимости приходят через GameContext.
 */

import { waveTotalFor } from "../balance";
import type { PickupKind } from "../balance";
import type { GameContext } from "./GameContext";
import type { EnemyFiredPayload } from "./EventBus";

export class GameListeners {
  private unsubscribers: Array<() => void> = [];

  constructor(private readonly ctx: GameContext) {
    const bus = this.ctx.eventBus;

    this.unsubscribers.push(
      bus.subscribe("wave_started", (event) => {
        // Запускаем волну при начале обратного отсчёта.
        // После первой волны FSM находится в "active", а не "playing".
        if (!this.ctx.fsm.is("playing", "active")) return;
        const waveData = event.payload as { wave: number };
        // Агрессивная боевая музыка на волну (с интенсивностью по номеру волны).
        this.ctx.audio.setCombatWave(waveData.wave);
        this.ctx.audio.setCombat(true);
        // Сброс счётчиков для новой волны
        this.ctx.scoringSystem.setKilledWave(0);
        this.ctx.spawnSystem.reset();
        // Инициализация оркестратора для волны
        const pos = this.ctx.getPlayerPosition();
        this.ctx.waveOrchestrator.initWave(pos.x, pos.y, waveData.wave, waveTotalFor(waveData.wave));
        this.ctx.waveOrchestrator.setSpeedMult(this.ctx.upgradeSystem.getApplied("speedMult"));
      }),
    );

    this.unsubscribers.push(
      bus.subscribe("game_over", (_event) => {
        // Волна окончена — возвращаемся к спокойной музыке.
        this.ctx.audio.setCombat(false);
        this.ctx.fsm.fire("player_died");
      }),
    );

    // Проверка завершения волны (после обновления scoring)
    this.unsubscribers.push(
      bus.subscribe("enemy_killed", () => {
        this.ctx.waveFlowSystem.checkWaveClear();
        // Волна зачищена — выходим из агрессивного трека в фоновый эмбиент.
        if (this.ctx.waveOrchestrator.waveState === "cleared") {
          this.ctx.audio.setCombat(false);
        }
      }),
    );

    this.unsubscribers.push(
      bus.subscribe("drone_hit", () => {
        this.ctx.audio.playDroneHit();
      }),
    );

    // Подбор пикапа: применить эффект (лечение, бонус, оружие, способность)
    this.unsubscribers.push(
      bus.subscribe("pickup_collected", (event) => {
        this.ctx.applyPickupSystem.apply(event.payload.kind as PickupKind);
      }),
    );

    // Вражеский выстрел: спавн пули со смещением от дула
    this.unsubscribers.push(
      bus.subscribe("enemy_fired", (event) => {
        const data = event.payload as EnemyFiredPayload;
        const heavy = data.cruiser || data.heavy;
        this.ctx.entityPool.spawnEnemyBullet(
          data.x + Math.cos(data.angle) * 14,
          data.y + Math.sin(data.angle) * 14,
          Math.cos(data.angle) * data.boltSpeed,
          Math.sin(data.angle) * data.boltSpeed,
          data.boltLife,
          data.boltDmg,
          heavy,
          data.cruiser,
        );
      }),
    );
  }

  destroy(): void {
    for (const unsub of this.unsubscribers) {
      unsub();
    }
    this.unsubscribers = [];
  }
}