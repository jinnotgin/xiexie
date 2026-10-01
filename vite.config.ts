/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";

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
  // Absolute base: with clean URLs a page like /library must still load /assets/..., not /library/assets/...
  base: "/",
  plugins: [
    vue(),
    {
      name: "build-commit-meta",
      transformIndexHtml: () => [
        { tag: "meta", attrs: { name: "build-commit", content: commit }, injectTo: "head" },
      ],
    },
    {
      // Emits dist/sw.js from src/sw.js with the list of built files to precache, so the app works offline.
      name: "service-worker",
      apply: "build",
      generateBundle(_, bundle) {
        const skip = /\.map$|^og-image\.png$/;
        const publicFiles = readdirSync("public").filter(f => !skip.test(f));
        const files = [...Object.keys(bundle), ...publicFiles].filter(f => !skip.test(f) && f !== "index.html");
        const precache = ["./", ...files.sort().map(f => "./" + f)];
        // VERSION changes whenever a bundle (content-hashed name) or a public file changes, so browsers pick up the new worker.
        const hash = createHash("sha256").update(precache.join("\n"));
        for (const f of publicFiles) hash.update(readFileSync("public/" + f));
        const version = hash.digest("hex").slice(0, 12);
        this.emitFile({
          type: "asset", fileName: "sw.js",
          source: `const VERSION = ${JSON.stringify(version)};\nconst PRECACHE = ${JSON.stringify(precache)};\n` + readFileSync("src/sw.js", "utf8"),
        });
      },
    },
  ],
  assetsInclude: ["**/*.gz"],
  test: {
    include: ["tests/unit/**/*.test.ts"],
  },
});
