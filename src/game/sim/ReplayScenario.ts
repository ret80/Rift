/**
 * ReplayScenario — превращение браузерной записи в сценарий симулятора.
 *
 * Сценарий собирается в том же формате, что лежит в `scenarios/*.json`:
 * его можно сразу прогнать через `npm run sim -- run <файл>`.
 *
 * Ограничения схемы: ангар дронов и положение камеры сценарий не описывает,
 * поэтому забег с дронами или активным поясом астероидов может расходиться
 * с записью. Всё, что схема умеет (seed, физика, волна, апгрейды, арсенал,
 * вьюпорт и намерения по тикам), переносится без потерь.
 */

import type { RunRecording } from "../core/IntentRecorder";
import { FIXED_DT } from "../core/SimulationClock";
import type { WeaponId } from "../weapons/Weapon";
import {
  SCENARIO_TICK_RATE,
  type Scenario,
  type ScenarioWeapon,
} from "./Scenario";

/** Имя файла/сценария записи: seed и волна делают его уникальным. */
export function replayScenarioName(recording: RunRecording): string {
  return `replay-${recording.meta.seed}-w${recording.meta.startWave}`;
}

/** Собрать сценарий симулятора из записи забега. */
export function buildReplayScenario(recording: RunRecording): Scenario {
  const { meta, intents } = recording;

  const weapons: Partial<Record<WeaponId, ScenarioWeapon>> = {};
  for (const [id, levels] of Object.entries(meta.weapons)) {
    if (levels) weapons[id as WeaponId] = { ...levels };
  }

  return {
    name: replayScenarioName(recording),
    seed: { master: meta.seed },
    tickRate: SCENARIO_TICK_RATE,
    duration: Math.max(FIXED_DT, intents.length * FIXED_DT),
    physics: meta.physics,
    startWave: meta.startWave,
    viewport: { ...meta.viewport },
    player: { agent: "replay", replay: intents },
    upgrades: { ...meta.upgrades },
    ...(Object.keys(weapons).length > 0 ? { weapons } : {}),
  };
}
