const tsPlugin = require("@typescript-eslint/eslint-plugin");
const tsParser = require("@typescript-eslint/parser");
const reactHooksPlugin = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: ["node_modules/**", "dist/**"],
  },
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
      "react-hooks": reactHooksPlugin,
    },
    rules: {
      // Code style
      "max-len": ["error", { code: 120, comments: 100 }],
      "prefer-const": "error",
      "no-var": "error",

      // TypeScript
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-empty-interface": "off",

      // React hooks
      "react-hooks/exhaustive-deps": "warn",
    },
  },
  {
    // Игровой мир DOM-free: никаких импортов рендера, презентации, аудио,
    // ввода и окружения браузера.
    files: ["src/game/core/GameWorld.ts", "src/game/core/WorldPorts.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "../render/*",
                "../presentation/*",
                "../audio",
                "../audio/*",
                "../input",
                "./env",
              ],
              message: "GameWorld/WorldPorts не зависят от DOM, рендера, аудио и ввода.",
            },
          ],
        },
      ],
    },
  },
  {
    // Геймплей не использует глобальную случайность: только seeded-потоки
    // из src/game/core/rng.ts. Визуальные слои (render/presentation/audio)
    // и рендереры систем остаются на Math.random.
    files: [
      "src/game/systems/**/*.ts",
      "src/game/weapons/**/*.ts",
      "src/game/ai/**/*.ts",
      "src/game/aiming/**/*.ts",
      "src/game/ecs/**/*.ts",
      "src/game/waves/**/*.ts",
      "src/game/asteroids.ts",
      "src/game/rifts.ts",
    ],
    ignores: ["src/game/systems/Renderers/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message:
            "Геймплейный код не использует Math.random: берите seeded-поток из core/rng.",
        },
      ],
    },
  },
];
