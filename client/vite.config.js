import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// In dev, forward API + websocket traffic to the Node server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": "http://localhost:4000",
      "/socket.io": { target: "http://localhost:4000", ws: true },
    },
  },
});
