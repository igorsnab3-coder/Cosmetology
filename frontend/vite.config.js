import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

const page = (name) => fileURLToPath(new URL(`./${name}`, import.meta.url));

export default defineConfig({
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: page("index.html"),
        procedures: page("procedures.html"),
        admin: page("admin.html")
      }
    }
  },
  server: {
    port: 5173,
    proxy: {
      "/api": process.env.API_URL || "http://127.0.0.1:5500"
    }
  }
});
