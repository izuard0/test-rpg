import { defineConfig } from "vite";

export default defineConfig({
  // Aset game (peta, sprite, materi) disalin ke public/game oleh scripts/sync-assets.mjs.
  base: "./",
  server: { port: 5173, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600, // Phaser sendiri ± 1,2 MB
  },
});
