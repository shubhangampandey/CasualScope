import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";
export default defineConfig({
  root: resolve("apps/web"),
  plugins: [react()],
  server: {
    host: "127.0.0.1",
    port: 5180,
    strictPort: true,
    proxy: { "/api": "http://127.0.0.1:4400" },
  },
  build: {
    outDir: resolve("dist/web"),
    emptyOutDir: true,
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              debugName: "runtime libraries",
              name(id) {
                if (!id.includes("node_modules")) return null;
                if (
                  /(?:framer-motion|motion-dom|motion-utils|motion)[/\\]/.test(
                    id,
                  )
                )
                  return "motion";
                if (id.includes("zod")) return "validation";
                return "vendor";
              },
            },
          ],
        },
      },
    },
  },
});
