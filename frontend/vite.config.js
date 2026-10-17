import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import process from 'node:process';

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.LOCAL_API_URL || "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
});
