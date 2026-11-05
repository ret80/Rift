/**
 * Scenario — описание боя для симуляции.
 *
 * Сценарий — это входные данные прогона: seed, длительность, состав волны,
 * агент игрока и его параметры. Он не зависит от кода мира и читается из
 * JSON, поэтому один и тот же сценарий прогоняется из CLI и из тестов.
 *
 * Проверка строгая: неизвестный агент, отрицательная длительность или
 * неизвестный физический движок — понятная ошибка, а не тихий fallback.
 */

import { EnemyKind, isEnemyKind } from "../balance";
import type { WaveCompositionOverride } from "../balance/waves";
import {
  hasBalanceOverride,
  validateBalanceOverrides,
  type BalanceOverrides,
} from "../balance/BalanceOverrides";
import type { DroneLoadout } from "../drones/Drone";
import { isPhysicsEngineId, type PhysicsEngineId } from "../physics/index";
import { WEAPON_IDS, type WeaponId } from "../weapons/WeaponCatalog";
import { WEAPON_STAT_MAX_LEVEL } from "../upgrades";
import {
  createSeedSet,
  isSeedSet,
  type Rng,
  type SeedSet,
} from "../core/rng";
import { FIXED_DT } from "../core/SimulationClock";
import type { PlayerAgent } from "./agents/PlayerAgent";
import {
  createPlayerAgent,
  isPlayerAgentKind,
  type PlayerAgentFactoryOptions,
  type PlayerAgentKind,
} from "./agents/index";

/** Tick rate мира фиксирован: других значений сценарий задать не может. */
export const SCENARIO_TICK_RATE = Math.round(1 / FIXED_DT);

/** Состав врагов в сценарии. */
export interface ScenarioEnemy {
  kind: EnemyKind;
  count: number;
}

/** Параметры агента из сценария. */
export interface ScenarioPlayer extends PlayerAgentFactoryOptions {
  agent: PlayerAgentKind;
}

/** Арсенал оружия из сценария: куплено ли оружие и уровни его линий. */
export interface ScenarioWeapon {
  owned: boolean;
  reload?: number;
  damage?: number;
  accuracy?: number;
}

/** Сценарий как он лежит в JSON. */
export interface Scenario {
  name: string;
  seed: { master: number; streams?: Partial<SeedSet["streams"]> };
  /** Частота симуляции; поддерживается только 60 Гц. */
  tickRate?: number;
  /** Длительность прогона, секунды. */
  duration: number;
  physics?: PhysicsEngineId;
  startWave?: number;
  /** Пропустить отсчёт волны (headless и повтор записи). */
  skipCountdown?: boolean;
  /** Множители баланса; отсутствие поля — мир без изменений. */
  balance?: BalanceOverrides;
  viewport?: { width: number; height: number };
  player: ScenarioPlayer;
  enemies?: ScenarioEnemy[];
  /** Персистентные апгрейды игрока (поля PlayerUpgrades). */
  upgrades?: Record<string, number>;
  /** Купленное оружие и уровни его линий (пушка куплена всегда). */
  weapons?: Partial<Record<WeaponId, ScenarioWeapon>>;
  /** Ангар дронов из записи (счётчики и модели). */
  droneLoadout?: DroneLoadout;
  /** Какие метрики печатать в отчёте. */
  metrics?: string[];
}

/** Ошибка валидации сценария. */
export class ScenarioError extends Error {
  constructor(readonly issues: string[]) {
    super(`Невалидный сценарий:\n  - ${issues.join("\n  - ")}`);
    this.name = "ScenarioError";
  }
}

/** Проверить и нормализовать сценарий из JSON. */
export function parseScenario(raw: unknown): Scenario {
  const issues: string[] = [];

  if (typeof raw !== "object" || raw === null) {
    throw new ScenarioError(["сценарий должен быть JSON-объектом"]);
  }
  const data = raw as Record<string, unknown>;

  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : "";
  if (!name) issues.push("name: не задано имя сценария");

  // Seed: либо { master }, либо полный SeedSet.
  const seedRaw = data.seed;
  let seed: Scenario["seed"] | null = null;
  if (isSeedSet(seedRaw)) {
    seed = { master: seedRaw.master, streams: seedRaw.streams };
  } else if (typeof seedRaw === "object" && seedRaw !== null) {
    const master = (seedRaw as { master?: unknown }).master;
    const streams = (seedRaw as { streams?: unknown }).streams;
    if (typeof master !== "number" || !Number.isFinite(master)) {
      issues.push("seed.master: должен быть числом");
    } else if (master < 0 || master > 0xffffffff) {
      issues.push("seed.master: должен быть 32-битным беззнаковым (0..4294967295)");
    } else {
      seed = {
        master: master >>> 0,
        ...(streams && typeof streams === "object" ? { streams: streams as SeedSet["streams"] } : {}),
      };
    }
  } else {
    issues.push("seed: нужен { master } или SeedSet");
  }

  const duration = data.duration;
  if (typeof duration !== "number" || !Number.isFinite(duration) || duration <= 0) {
    issues.push("duration: должно быть положительным числом секунд");
  }

  if (data.tickRate !== undefined && data.tickRate !== SCENARIO_TICK_RATE) {
    issues.push(`tickRate: поддерживается только ${SCENARIO_TICK_RATE} Гц`);
  }

  let physics: PhysicsEngineId = "custom";
  if (data.physics !== undefined) {
    if (typeof data.physics !== "string" || !isPhysicsEngineId(data.physics)) {
      issues.push("physics: ожидается custom | planck | p2");
    } else {
      physics = data.physics;
    }
  }

  const playerRaw = data.player;
  let player: ScenarioPlayer | null = null;
  if (typeof playerRaw !== "object" || playerRaw === null) {
    issues.push("player: нужен объект с полем agent");
  } else {
    const candidate = playerRaw as Record<string, unknown>;
    if (!isPlayerAgentKind(candidate.agent)) {
      issues.push("player.agent: ожидается orbit | kite | evade | random | replay");
    } else {
      player = { ...(candidate as unknown as ScenarioPlayer), agent: candidate.agent };
    }
  }

  const enemies: ScenarioEnemy[] = [];
  if (data.enemies !== undefined) {
    if (!Array.isArray(data.enemies)) {
      issues.push("enemies: ожидается массив { kind, count }");
    } else {
      for (const [index, entry] of data.enemies.entries()) {
        if (typeof entry !== "object" || entry === null) {
          issues.push(`enemies[${index}]: ожидается объект { kind, count }`);
          continue;
        }
        const item = entry as { kind?: unknown; count?: unknown };
        if (!isEnemyKind(item.kind)) {
          issues.push(`enemies[${index}].kind: неизвестный вид врага "${String(item.kind)}"`);
          continue;
        }
        if (typeof item.count !== "number" || !Number.isInteger(item.count) || item.count < 0) {
          issues.push(`enemies[${index}].count: ожидается целое >= 0`);
          continue;
        }
        enemies.push({ kind: item.kind, count: item.count });
      }
    }
  }

  const upgrades =
    typeof data.upgrades === "object" && data.upgrades !== null
      ? (data.upgrades as Record<string, number>)
      : undefined;

  if (data.skipCountdown !== undefined && typeof data.skipCountdown !== "boolean") {
    issues.push("skipCountdown: ожидается boolean");
  }

  issues.push(...validateBalanceOverrides(data.balance));

  let droneLoadout: DroneLoadout | undefined;
  if (data.droneLoadout !== undefined) {
    if (typeof data.droneLoadout !== "object" || data.droneLoadout === null) {
      issues.push("droneLoadout: ожидается объект ангара");
    } else {
      droneLoadout = data.droneLoadout as DroneLoadout;
    }
  }

  const weapons: Partial<Record<WeaponId, ScenarioWeapon>> = {};
  if (data.weapons !== undefined) {
    if (typeof data.weapons !== "object" || data.weapons === null) {
      issues.push("weapons: ожидается объект { <weapon>: { owned, reload?, damage?, accuracy? } }");
    } else {
      for (const [id, raw] of Object.entries(data.weapons as Record<string, unknown>)) {
        if (!(WEAPON_IDS as readonly string[]).includes(id)) {
          issues.push(`weapons.${id}: неизвестное оружие (ожидается ${WEAPON_IDS.join(" | ")})`);
          continue;
        }
        if (typeof raw !== "object" || raw === null) {
          issues.push(`weapons.${id}: ожидается объект`);
          continue;
        }
        const entry = raw as Record<string, unknown>;
        if (typeof entry.owned !== "boolean") {
          issues.push(`weapons.${id}.owned: ожидается boolean`);
          continue;
        }
        const levels: ScenarioWeapon = { owned: entry.owned };
        let valid = true;
        for (const stat of ["reload", "damage", "accuracy"] as const) {
          const value = entry[stat];
          if (value === undefined) continue;
          if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > WEAPON_STAT_MAX_LEVEL) {
            issues.push(`weapons.${id}.${stat}: ожидается целое 0..${WEAPON_STAT_MAX_LEVEL}`);
            valid = false;
            continue;
          }
          levels[stat] = value;
        }
        if (valid) weapons[id as WeaponId] = levels;
      }
    }
  }

  if (issues.length > 0) throw new ScenarioError(issues);

  return {
    name,
    seed: seed!,
    tickRate: SCENARIO_TICK_RATE,
    duration: duration as number,
    physics,
    startWave: typeof data.startWave === "number" ? Math.max(1, Math.floor(data.startWave)) : 1,
    // Поля с нейтральным значением не попадают в объект: хэш старого
    // сценария не должен меняться от появления новых возможностей.
    ...(data.skipCountdown === true ? { skipCountdown: true } : {}),
    ...(hasBalanceOverride(data.balance as BalanceOverrides | undefined)
      ? { balance: data.balance as BalanceOverrides }
      : {}),
    ...(droneLoadout ? { droneLoadout } : {}),
    viewport:
      typeof data.viewport === "object" && data.viewport !== null
        ? {
            width: Math.max(240, Number((data.viewport as { width?: number }).width) || 1920),
            height: Math.max(240, Number((data.viewport as { height?: number }).height) || 1080),
          }
        : { width: 1920, height: 1080 },
    player: player!,
    enemies,
    upgrades,
    ...(Object.keys(weapons).length > 0 ? { weapons } : {}),
    metrics: Array.isArray(data.metrics) ? (data.metrics as string[]) : undefined,
  };
}

/** Seed-набор сценария (явные потоки перекрывают выведенные из master). */
export function scenarioSeedSet(scenario: Scenario): SeedSet {
  const base = createSeedSet(scenario.seed.master);
  if (!scenario.seed.streams) return base;
  const streams = { ...base.streams };
  for (const [key, value] of Object.entries(scenario.seed.streams)) {
    if (typeof value === "number" && key in streams) {
      streams[key as keyof typeof streams] = value >>> 0;
    }
  }
  return { master: base.master, streams };
}

/** Сколько тиков длится сценарий. */
export function scenarioTicks(scenario: Scenario): number {
  return Math.max(1, Math.round(scenario.duration / FIXED_DT));
}

/** Состав волны из списка врагов (null — обычные веса волны). */
export function scenarioComposition(scenario: Scenario): WaveCompositionOverride | null {
  if (!scenario.enemies || scenario.enemies.length === 0) return null;
  const composition: WaveCompositionOverride = {};
  for (const enemy of scenario.enemies) {
    if (enemy.count <= 0) continue;
    composition[enemy.kind] = (composition[enemy.kind] ?? 0) + enemy.count;
  }
  return Object.keys(composition).length > 0 ? composition : null;
}

/** Фабрика агента, готовая для `GameWorldConfig.agent`. */
export function scenarioAgentFactory(scenario: Scenario): (rng: Rng) => PlayerAgent {
  const { agent, ...options } = scenario.player;
  return (rng: Rng) => createPlayerAgent(agent, options, rng);
}

/**
 * Канонический JSON: ключи отсортированы, числа — без локали.
 * Нужен для стабильного `scenarioHash`.
 */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
}

/** SHA-256 канонического JSON сценария: одинаковый смысл — одинаковый хэш. */
export async function scenarioHash(scenario: Scenario): Promise<string> {
  const text = canonicalJson(scenario);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    // Node без WebCrypto: стабильный небуквенный fallback для отчёта.
    return `no-sha256:${text.length}:${createSeedSet(text.length).master}`;
  }
  const digest = await subtle.digest("SHA-256", new TextEncoder().encode(text));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return `sha256:${hex}`;
}

/** Все виды врагов, допустимые в сценарии (для сообщений об ошибках). */
export const SCENARIO_ENEMY_KINDS = Object.values(EnemyKind);
