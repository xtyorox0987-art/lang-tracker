import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import pkg from "./package.json" with { type: "json" };

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // AnkiConnect proxy to avoid CORS issues in development
      "/anki-api": {
        target: "http://localhost:8765",
        changeOrigin: true,
        rewrite: () => "/",
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyReq) => {
            // AnkiConnect rejects Origin headers other than "http://localhost"
            proxyReq.removeHeader("origin");
          });
        },
      },
    },
  },
});
