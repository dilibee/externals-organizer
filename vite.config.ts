import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// GitHub Pages serves the app from /externals-organizer/.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/externals-organizer/" : "/",
  plugins: [react()],
  test: { environment: "node" },
}));
