/**
 * MetricsSink — сбор метрик прогона.
 *
 * Все цифры берутся из одного источника правды мира: событий (`player_shot`,
 * `enemy_damaged`, `player_damaged`, `bullet_grazed`, `game_over`) и
 * потиковой выборки зоны. Никакой отдельной «симуляционной физики» нет.
 *
 * Важно: `hits` — число попаданий (событий урона), а не уникальных снарядов.
 * У лазера один выстрел может нанести несколько порций урона, поэтому
 * `hitRate` — это «попаданий на выстрел», и он может быть больше 1.
 */

import type { GameWorld } from "../core/GameWorld";
import type { RngStream } from "../core/rng";

/** Метрики одного прогона. */
export interface RunMetrics {
  shots: number;
  hits: number;
  hitRate: number;
  damageDealt: number;
  dps: number;
  damageTaken: number;
  damageTakenPerSecond: number;
  survivalTime: number;
  kills: number;
  killsPerSecond: number;
  graze: number;
  zoneViolations: number;
  abilityUses: number;
  finalHp: number;
  /** Максимальная волна, до которой дошёл прогон. */
  waveReached: number;
  byKind: Record<string, { kills: number; damage: number }>;
  /** Урон, полученный игроком, в разрезе источника (вид врага / asteroid). */
  damageTakenByKind: Record<string, number>;
  rngDraws: Record<RngStream, number>;
}

export class MetricsSink {
  private shots = 0;
  private hits = 0;
  private damageDealt = 0;
  private damageTaken = 0;
  private graze = 0;
  private abilityUses = 0;
  private zoneViolations = 0;
  private waveReached = 1;
  private deathTime: number | null = null;
  private killsByKind = new Map<string, number>();
  private damageByKind = new Map<string, number>();
  private damageTakenByKind = new Map<string, number>();
  private readonly unsubscribers: Array<() => void> = [];

  constructor(private readonly world: GameWorld) {
    const bus = world.eventBus;

    this.unsubscribers.push(
      bus.subscribe("player_shot", () => {
        this.shots++;
      }),
    );
    this.unsubscribers.push(
      bus.subscribe("enemy_damaged", (event) => {
        const { dmg, kind, killed } = event.payload;
        this.hits++;
        this.damageDealt += dmg;
        this.damageByKind.set(kind, (this.damageByKind.get(kind) ?? 0) + dmg);
        if (killed) this.killsByKind.set(kind, (this.killsByKind.get(kind) ?? 0) + 1);
      }),
    );
    this.unsubscribers.push(
      bus.subscribe("player_damaged", (event) => {
        this.damageTaken += event.payload.dmg;
        const source = event.payload.source ?? "unknown";
        this.damageTakenByKind.set(source, (this.damageTakenByKind.get(source) ?? 0) + event.payload.dmg);
      }),
    );
    // Урон среды (буря на кромке) — тот же счётчик урона, отдельный источник.
    this.unsubscribers.push(
      bus.subscribe("player_zone_damaged", (event) => {
        this.damageTaken += event.payload.dmg;
        const source = event.payload.source;
        this.damageTakenByKind.set(
          source,
          (this.damageTakenByKind.get(source) ?? 0) + event.payload.dmg,
        );
      }),
    );
    this.unsubscribers.push(
      bus.subscribe("bullet_grazed", (event) => {
        this.graze += event.payload.count;
      }),
    );
    this.unsubscribers.push(
      bus.subscribe("ability_used", () => {
        this.abilityUses++;
      }),
    );
    this.unsubscribers.push(
      bus.subscribe("game_over", () => {
        if (this.deathTime === null) this.deathTime = world.time;
      }),
    );
  }

  /**
   * Потиковая выборка. Вызывать после каждого `world.tick`.
   *
   * Нарушением зоны считается тик, когда игрок вне активной зоны: за её
   * краем он получает прямой урон, и агент обязан этого избегать.
   */
  sample(): void {
    const wave = this.world.waveOrchestrator.wave;
    if (wave > this.waveReached) this.waveReached = wave;

    const zone = this.world.waveOrchestrator.zoneState;
    if (!zone.active || zone.radius <= 0) return;
    const player = this.world.getPlayerPosition();
    const dist = Math.hypot(player.x - zone.x, player.y - zone.y);
    if (dist > zone.radius) this.zoneViolations++;
  }

  /** Собрать метрики прогона. */
  build(): RunMetrics {
    const survivalTime = this.deathTime ?? this.world.time;
    const kills = this.world.scoringSystem.getState().killed;
    const byKind: Record<string, { kills: number; damage: number }> = {};
    for (const kind of new Set([...this.killsByKind.keys(), ...this.damageByKind.keys()])) {
      byKind[kind] = {
        kills: this.killsByKind.get(kind) ?? 0,
        damage: this.damageByKind.get(kind) ?? 0,
      };
    }
    const damageTakenByKind: Record<string, number> = {};
    for (const [kind, damage] of this.damageTakenByKind) {
      damageTakenByKind[kind] = damage;
    }

    return {
      shots: this.shots,
      hits: this.hits,
      hitRate: this.shots > 0 ? this.hits / this.shots : 0,
      damageDealt: this.damageDealt,
      dps: survivalTime > 0 ? this.damageDealt / survivalTime : 0,
      damageTaken: this.damageTaken,
      damageTakenPerSecond: survivalTime > 0 ? this.damageTaken / survivalTime : 0,
      survivalTime,
      kills,
      killsPerSecond: survivalTime > 0 ? kills / survivalTime : 0,
      graze: this.graze,
      zoneViolations: this.zoneViolations,
      abilityUses: this.abilityUses,
      finalHp: this.world.playerSystem.getHp(),
      waveReached: this.waveReached,
      byKind,
      damageTakenByKind,
      rngDraws: this.world.rngDraws(),
    };
  }

  /** Отписаться от событий. */
  dispose(): void {
    for (const unsub of this.unsubscribers) unsub();
    this.unsubscribers.length = 0;
  }
}
