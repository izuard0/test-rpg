import { defineConfig } from "vite";

export default defineConfig({
  // Aset game (peta, sprite, materi) disalin ke public/game oleh scripts/sync-assets.mjs.
  base: "./",
  server: { port: 5173, host: true },
  build: {
    target: "es2022",
    chunkSizeWarningLimit: 1600, // Phaser sendiri ± 1,2 MB
    // Dua halaman: game (index.html) dan panel admin (panel.html, disajikan server di /panel).
    rollupOptions: { input: { main: "index.html", panel: "panel.html" } },
  },
});
