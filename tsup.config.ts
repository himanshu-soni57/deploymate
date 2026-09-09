import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    clean: true,
    // A CLI binary has no consumers that need .d.ts files.
    dts: false,
    sourcemap: true,
    outDir: "dist",
    splitting: false,
    minify: false,
  },
  {
    // Public entry so config files can `import { defineConfig } from "deploypilot"`.
    entry: { config: "src/config/public.ts" },
    format: ["esm"],
    target: "node20",
    platform: "node",
    dts: true,
    sourcemap: false,
    outDir: "dist",
  },
]);
