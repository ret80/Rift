/** Временный зонд: сколько угрозы даёт каждый вид врага на волне 1. */

import { parseScenario, scenarioSeedSet } from "../game/sim/Scenario";
import { executeScenario } from "../game/sim/execute";

const COMPS: Array<[string, Record<string, number>]> = [
  ["drone×20", { drone: 20 }],
  ["hunter×20", { hunter: 20 }],
  ["fighter×8", { fighter: 8 }],
  ["cruiser×3", { cruiser: 3 }],
  ["carrier×2", { carrier: 2 }],
];

const SEEDS = [1, 2, 3, 4, 5];
const SECONDS = 30;

const rows: string[] = [["comp", "hpLost", "kills", "survTime", "dps", "shots", "hits"].join("\t")];

for (const [label, enemies] of COMPS) {
  const scenario = parseScenario({
    name: `probe-${label}`,
    seed: { master: 1001 },
    duration: SECONDS,
    physics: "planck",
    startWave: 1,
    viewport: { width: 1600, height: 900 },
    player: { agent: "orbit", radius: 260, direction: 1, reactionTime: 0.2, aimJitter: 0.05 },
    enemies: Object.entries(enemies).map(([kind, count]) => ({ kind, count })),
  });

  const collected = [] as Array<Record<string, number>>;
  for (const seed of SEEDS) {
    const result = executeScenario(scenario, {
      seedSet: scenarioSeedSet({ ...scenario, seed: { master: seed } }),
    });
    const m = result.metrics;
    collected.push({
      hpLost: m.damageTaken,
      kills: m.kills,
      survTime: m.survivalTime,
      dps: m.dps,
      shots: m.shots,
      hits: m.hits,
    });
    result.dispose();
  }
  const mean = (key: string) =>
    collected.reduce((sum, entry) => sum + entry[key], 0) / collected.length;
  rows.push(
    [
      label,
      mean("hpLost").toFixed(1),
      mean("kills").toFixed(1),
      mean("survTime").toFixed(1),
      mean("dps").toFixed(1),
      mean("shots").toFixed(0),
      mean("hits").toFixed(0),
    ].join("\t"),
  );
}

console.log(rows.join("\n"));
