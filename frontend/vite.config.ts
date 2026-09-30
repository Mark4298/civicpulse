import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  envDir: ".",
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("/node_modules/")) return;
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "vendor-react";
          if (/\/node_modules\/(framer-motion|motion-dom|motion-utils)\//.test(id))
            return "vendor-motion";
          if (/\/node_modules\/(leaflet|react-leaflet)\//.test(id)) return "vendor-leaflet";
          if (/\/node_modules\/(recharts|d3-[^/]+|victory-vendor)\//.test(id))
            return "vendor-recharts";
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
