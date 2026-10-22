#!/usr/bin/env node
/**
 * check-i18n-consistency.ts
 * Compares RU and EN dictionaries to ensure all keys match.
 * Usage: node scripts/check-i18n-consistency.ts
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const srcRoot = resolve(__dirname, "..", "src");

// Parse dictionaries from i18n.ts
function parseDict(content: string, lang: "ru" | "en"): Set<string> {
  // Match "key": "value" patterns within the appropriate dictionary block
  // We look for lines like:   "app.title": "РАЗЛОМ",
  const regex = /"([^"]+)":\s*"([^"]*)"/g;
  const keys = new Set<string>();
  let match;
  while ((match = regex.exec(content)) !== null) {
    keys.add(match[1]);
  }
  return keys;
}

function main() {
  const i18nPath = resolve(srcRoot, "i18n.ts");
  const content = readFileSync(i18nPath, "utf-8");

  // Split content into ru and en sections (literal objects)
  const ruMatch = content.match(/const ru = \{[\s\S]*?\};/);
  const enMatch = content.match(/const en: Dict = \{[\s\S]*?\};/);

  if (!ruMatch || !enMatch) {
    console.error("ERROR: Could not parse RU/EN dictionaries from i18n.ts");
    process.exit(1);
  }

  const ruKeys = parseDict(ruMatch[0], "ru");
  const enKeys = parseDict(enMatch[0], "en");

  const missingInEn = [...ruKeys].filter((k) => !enKeys.has(k));
  const missingInRu = [...enKeys].filter((k) => !ruKeys.has(k));

  let hasErrors = false;

  if (missingInEn.length > 0) {
    console.error(
      `\n❌ Keys missing in EN dictionary (${missingInEn.length}):`
    );
    for (const k of missingInEn) {
      console.error(`  - "${k}"`);
    }
    hasErrors = true;
  }

  if (missingInRu.length > 0) {
    console.error(
      `\n❌ Keys missing in RU dictionary (${missingInRu.length}):`
    );
    for (const k of missingInRu) {
      console.error(`  - "${k}"`);
    }
    hasErrors = true;
  }

  if (!hasErrors) {
    console.log(`✅ i18n dictionaries are consistent (${ruKeys.size} keys each).`);
    process.exit(0);
  }

  console.error("\n❌ i18n dictionaries are OUT OF SYNC.");
  process.exit(1);
}

main();
