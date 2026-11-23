import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

// The API base can be overridden with VITE_API_BASE_URL; in dev we proxy
// /api (REST + WebSocket) to the local FastAPI server.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    // The bundle is dominated by Recharts + Konva + react-konva. This is a
    // LAN classroom tool, not a public website, so one ~1.2 MB chunk is
    // acceptable; only raise the warning threshold to keep builds readable.
    chunkSizeWarningLimit: 1500,
  },
  server: {
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
