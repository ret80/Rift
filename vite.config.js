import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Relative base path works on any hosting (GitHub Pages, custom domain, etc.)
  base: process.env.BASE_URL || "./",
  build: {
    rollupOptions: {
      output: {
        // Разделяем крупные вендоры: движок игры грузится отдельно от React,
        // физических бэкендов и рендера, основной чанк остаётся меньше 500 kB.
        manualChunks: {
          react: ["react", "react-dom"],
          physics: ["planck", "p2-es"],
          render: ["picogl"],
        },
      },
    },
  },
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
