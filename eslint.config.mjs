import js from "@eslint/js";
import globals from "globals";

export default [
  js.configs.recommended,
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.jest,
      },
    },
    rules: {
      "no-unused-vars": ["error", { "argsIgnorePattern": "^_", "varsIgnorePattern": "^_" }],
      "no-console": "off",
    },
  },
  {
    // The MCP server package is authored as ES modules.
    files: ["packages/**/*.js"],
    languageOptions: {
      sourceType: "module",
    },
  },
  {
    ignores: ["coverage/**", "node_modules/**", "packages/**/dist/**"],
  },
];
