/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { execSync } from "node:child_process";

function git(cmd: string): string {
  try {
    return execSync(`git ${cmd}`, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "";
  }
}

// Stamps the built commit into <meta name="build-commit"> so a deployed page can be traced to its source.
const commit = (git("rev-parse --short HEAD") || "unknown") + (git("status --porcelain") ? "-dirty" : "");

export default defineConfig({
  // Relative base so the built app works from any folder or static host (GitHub Pages etc).
  base: "./",
  plugins: [
    vue(),
    {
      name: "build-commit-meta",
      transformIndexHtml: () => [
        { tag: "meta", attrs: { name: "build-commit", content: commit }, injectTo: "head" },
      ],
    },
  ],
  assetsInclude: ["**/*.gz"],
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
