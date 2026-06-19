import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": resolve(__dirname, "src"),
    },
    // Guard against a duplicate React when @gliderzone/auth-client is consumed via
    // a local link during development ("Invalid hook call") — see its README.
    dedupe: ["react", "react-dom"],
  },
});
