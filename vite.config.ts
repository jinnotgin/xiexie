/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  // Relative base so the built app works from any folder or static host (GitHub Pages etc).
  base: "./",
  plugins: [vue()],
  assetsInclude: ["**/*.gz"],
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
