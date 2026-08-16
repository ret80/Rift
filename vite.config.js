import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Deploy to GitHub Pages via CI/CD
export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/Rift/",
  server: {
    host: "0.0.0.0",
    port: 3000,
    strictPort: true,
    hmr: {
      port: 3000,
    },
  },
});
