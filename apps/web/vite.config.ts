import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { copyFile } from "node:fs/promises";
import { resolve } from "node:path";

export default defineConfig({
  // Render's static host can serve a generated 404 document for a direct
  // client-side route. Keeping it identical to index.html lets the React
  // shell handle /customers and /customers/:id after a browser refresh.
  plugins: [
    react(),
    {
      name: "copy-spa-fallback",
      async closeBundle() {
        const dist = resolve(process.cwd(), "dist");
        await copyFile(resolve(dist, "index.html"), resolve(dist, "404.html"));
      },
    },
  ],
});
