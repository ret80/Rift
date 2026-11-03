#!/usr/bin/env tsx
/**
 * CLI симулятора Rift.
 *
 * Точка входа для headless-прогонов: мир без DOM, фиксированный шаг,
 * seeded RNG и метрики. Команды добавляются по шагам плана
 * (`tasks/simulation-harness-variant-e-plan-2026-11-03.md`).
 */

import { main } from "./cli-main";

void main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
