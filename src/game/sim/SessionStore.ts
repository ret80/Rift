/**
 * SessionStore — чтение и запись JSONL-сессий в Node.
 *
 * Источник истины — JSONL. SQLite здесь нет намеренно: запись должна
 * читаться `grep`-ом, диффиться и не требовать нативной сборки на Node 20.
 * Файл сессии не попадает в git: каталог `sim-results/` в `.gitignore`.
 */

import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import {
  parseSessionJsonl,
  recordToJsonl,
  SessionRecordError,
  type SessionRecordV1,
} from "../core/SessionRecord";
import type { BalanceOverrides } from "../balance/BalanceOverrides";
import { parseScenario, type Scenario, type ScenarioWeapon } from "./Scenario";
import { WEAPON_IDS, type WeaponId } from "../weapons/WeaponCatalog";

/** Каталог записей по умолчанию. */
export const DEFAULT_SESSIONS_DIR = "sim-results/sessions";

/** Прочитать сессию из файла. */
export function readSessionFile(path: string): SessionRecordV1 {
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch (error) {
    throw new Error(`Не удалось прочитать сессию ${path}: ${(error as Error).message}`);
  }
  try {
    return parseSessionJsonl(text);
  } catch (error) {
    if (error instanceof SessionRecordError) {
      throw new Error(`${path}: ${error.message}`);
    }
    throw error;
  }
}

/** Записать сессию в файл, создав каталоги. */
export function writeSessionFile(record: SessionRecordV1, path: string): string {
  const target = resolve(process.cwd(), path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, recordToJsonl(record), "utf8");
  return target;
}

/** Путь по умолчанию: `sessions/YYYYMMDD/<sessionId>.jsonl`. */
export function defaultSessionPath(record: SessionRecordV1): string {
  const day = record.createdAt.slice(0, 10).replace(/-/g, "") || "unknown";
  return join(DEFAULT_SESSIONS_DIR, day, `${record.sessionId}.jsonl`);
}

/** Найти все JSONL-файлы в каталоге (рекурсивно, без симлинков). */
export function listSessionFiles(dir: string = DEFAULT_SESSIONS_DIR): string[] {
  const root = resolve(process.cwd(), dir);
  if (!existsSync(root)) return [];
  const found: string[] = [];
  const walk = (path: string): void => {
    for (const entry of readdirSync(path, { withFileTypes: true })) {
      if (entry.isSymbolicLink()) continue;
      const full = join(path, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.isFile() && entry.name.endsWith(".jsonl")) found.push(full);
    }
  };
  walk(root);
  return found.sort();
}

/** Прочитать все сессии каталога; ошибки отдельных файлов не скрываются. */
export function listSessions(dir?: string): Array<{ path: string; record: SessionRecordV1 }> {
  return listSessionFiles(dir).map((path) => ({ path, record: readSessionFile(path) }));
}

export interface FromSessionOptions {
  /** Переопределить мастер-seed (по умолчанию — seed записи). */
  seed?: number;
  /** Переопределить множители баланса. */
  balance?: BalanceOverrides;
}

/** Перевести сохранённые модели оружия в формат сценария. */
function scenarioWeapons(record: SessionRecordV1): Scenario["weapons"] {
  const weapons: Partial<Record<WeaponId, ScenarioWeapon>> = {};
  for (const id of WEAPON_IDS) {
    const entry = record.meta.weaponLoadout[id];
    if (!entry?.owned) continue;
    weapons[id] = {
      owned: true,
      reload: entry.model.reload,
      damage: entry.model.damage,
      accuracy: entry.model.accuracy,
    };
  }
  return Object.keys(weapons).length > 0 ? weapons : undefined;
}

/**
 * Собрать сценарий из стартового контекста записи.
 *
 * `startWave` берётся из записи, а не из `bestWave`: последний — только
 * метаданные и не должен менять старт.
 */
export function scenarioFromSession(
  record: SessionRecordV1,
  options: FromSessionOptions = {},
): Scenario {
  const master = options.seed ?? record.seed.master;
  const weapons = scenarioWeapons(record);
  const raw = {
    name: `session:${record.sessionId}`,
    seed: { master },
    duration: Math.max(1, record.run.ticks / 60),
    physics: record.run.physics,
    startWave: record.run.startWave,
    skipCountdown: record.run.skipCountdown,
    viewport: { width: 1920, height: 1080 },
    player: { agent: "evade" },
    upgrades: { ...record.meta.upgrades },
    ...(weapons ? { weapons } : {}),
    ...(record.meta.droneLoadout ? { droneLoadout: record.meta.droneLoadout } : {}),
    balance: options.balance ?? record.run.balance,
    ...(record.run.paramProfile ? { paramProfile: record.run.paramProfile } : {}),
    ...(record.meta.ascension && record.meta.ascension.length > 0
      ? { ascension: [...record.meta.ascension] }
      : {}),
  };
  return parseScenario(raw);
}

/** Короткая сводка для `sessions list`/`show`. */
export function describeSession(record: SessionRecordV1): string[] {
  const seconds = record.run.ticks / 60;
  return [
    `sessionId   ${record.sessionId}`,
    `createdAt   ${record.createdAt}`,
    `seed        ${record.seed.master}`,
    `schema      v${record.schemaVersion}`,
    `replayable  ${record.run.replayable}`,
    `startTick   ${record.run.startTick}`,
    `startWave   ${record.run.startWave}`,
    `physics     ${record.run.physics}`,
    `ticks       ${record.run.ticks} (${seconds.toFixed(1)} с)`,
    `balance     hp×${record.run.balance.enemyHpMult.toFixed(2)} dmg×${record.run.balance.enemyDamageMult.toFixed(2)}`,
    `intents     ${record.intents.length}`,
    `samples     ${record.samples.length}`,
    `checkpoints ${record.checkpoints.length}`,
    `endReason   ${record.run.endReason ?? "missing"}`,
    `metrics     ${record.end?.metrics ? "present" : "missing"}`,
    `complete    ${record.end ? "true" : "false"}`,
  ];
}
