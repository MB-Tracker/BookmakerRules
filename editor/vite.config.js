import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync, readdirSync, statSync } from "fs";
import { execSync } from "child_process";
import { resolve, relative, sep } from "path";

const DATA = resolve(__dirname, "../data");

/**
 * `virtual:data-snapshot`: every JSON file under data/, for the GitHub Pages
 * build, which has no server to read them from. Empty outside that mode so the
 * local build never carries a copy of the data.
 */
function dataSnapshot(mode) {
  const ID = "virtual:data-snapshot";
  const walk = (dir) => readdirSync(dir).flatMap((f) => {
    const p = resolve(dir, f);
    return statSync(p).isDirectory() ? walk(p) : f.endsWith(".json") ? [p] : [];
  });
  const commit = () => {
    if (process.env.GITHUB_SHA) return process.env.GITHUB_SHA;
    try { return execSync("git rev-parse HEAD", { cwd: DATA }).toString().trim(); } catch { return null; }
  };
  return {
    name: "data-snapshot",
    resolveId: (id) => (id === ID ? `\0${ID}` : null),
    load(id) {
      if (id !== `\0${ID}`) return null;
      const files = {};
      if (mode === "pages") {
        for (const p of walk(DATA)) {
          this.addWatchFile(p);
          files[relative(DATA, p).split(sep).join("/")] = JSON.parse(readFileSync(p, "utf8"));
        }
      }
      const snap = { commit: commit(), repo: process.env.GITHUB_REPOSITORY || "MB-Tracker/BookmakerRules", files };
      return `export default ${JSON.stringify(snap)};`;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), dataSnapshot(mode)],
  // Pages serves the site from /<repo>/, so every asset path is relative.
  base: mode === "pages" ? "./" : "/",
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: mode === "pages" ? "dist" : "../static/payout_rules/editor",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        entryFileNames: "assets/index.js",
        chunkFileNames: "assets/[name].js",
        assetFileNames: "assets/[name].[ext]",
      },
    },
  },
}));
