import js from "@eslint/js";
import tseslint from "typescript-eslint";
import vue from "eslint-plugin-vue";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "archived", "src/vendor", "public"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...vue.configs["flat/essential"],
  {
    files: ["**/*.vue"],
    languageOptions: { parserOptions: { parser: tseslint.parser } },
  },
  {
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Catch blocks that only guard a flaky third-party call may stay empty, but must say so.
      "no-empty": ["error", { allowEmptyCatch: false }],
      "@typescript-eslint/no-unused-vars": ["error", { caughtErrors: "none" }],
      "@typescript-eslint/no-explicit-any": "warn",
      "vue/multi-word-component-names": "off",
    },
  },
  { files: ["src/sw.js"], languageOptions: { globals: globals.serviceworker } },
  // Imports flow one way: shared code (lib, components, composables, stores, data) → features → app.
  // A feature never imports another feature; the app (routes, App.vue) wires them together.
  {
    files: ["src/{lib,components,composables,stores,data}/**"],
    rules: { "no-restricted-imports": ["error", { patterns: [
      { group: ["**/features/**", "**/app/**"], message: "Shared code can't depend on a feature or the app." },
    ] }] },
  },
  ...["practice", "library", "account"].map(feature => ({
    files: [`src/features/${feature}/**`],
    rules: { "no-restricted-imports": ["error", { patterns: [
      { group: ["**/app/**", ...["practice", "library", "account"].filter(f => f !== feature).map(f => `**/${f}/**`)],
        message: "A feature can't import another feature or the app: wire them together in src/app." },
    ] }] },
  })),
);
