#!/usr/bin/env node
/**
 * check-i18n-consistency.ts
 *
 * Рекурсивно обходит доменные словари RU/EN и проверяет, что:
 *   • наборы ключей совпадают;
 *   • в английской локали нет кириллицы (забытый русский суффикс).
 *
 * Запуск: node scripts/check-i18n-consistency.ts
 */

import { enNested, ruNested } from "../src/i18n/dicts/index.ts";

type Nested = { [key: string]: unknown };

/** Собрать плоские ключи и значения из вложенного словаря. */
function collectLeaves(
  source: Nested,
  prefix = "",
  out = new Map<string, string>(),
): Map<string, string> {
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out.set(path, value);
    } else if (value !== null && typeof value === "object") {
      collectLeaves(value as Nested, path, out);
    }
  }
  return out;
}

function main() {
  const ru = collectLeaves(ruNested);
  const en = collectLeaves(enNested);

  const missingInEn = [...ru.keys()].filter((k) => !en.has(k));
  const missingInRu = [...en.keys()].filter((k) => !ru.has(k));
  const cyrillicInEn = [...en.entries()].filter(([, value]) => /[А-Яа-яЁё]/.test(value));

  let hasErrors = false;

  if (missingInEn.length > 0) {
    console.error(`\n❌ Ключи, отсутствующие в EN (${missingInEn.length}):`);
    for (const k of missingInEn) console.error(`  - "${k}"`);
    hasErrors = true;
  }

  if (missingInRu.length > 0) {
    console.error(`\n❌ Ключи, отсутствующие в RU (${missingInRu.length}):`);
    for (const k of missingInRu) console.error(`  - "${k}"`);
    hasErrors = true;
  }

  if (cyrillicInEn.length > 0) {
    console.error(`\n❌ Кириллица в EN-локали (${cyrillicInEn.length}):`);
    for (const [k, value] of cyrillicInEn) console.error(`  - "${k}": ${value}`);
    hasErrors = true;
  }

  if (hasErrors) {
    console.error("\n❌ Словари локализации рассинхронизированы.");
    process.exit(1);
  }

  console.log(`✅ Словари локализации согласованы (${ru.size} ключей в каждом).`);
}

main();
