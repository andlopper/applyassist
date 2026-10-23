import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "vite";
import { createManifest } from "../manifest.config.ts";

const projectRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputDirectory = resolve(projectRoot, "dist");
const packageJson = JSON.parse(await readFile(resolve(projectRoot, "package.json"), "utf8"));

await build({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  build: {
    outDir: outputDirectory,
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(projectRoot, "src/background/main.ts"),
      output: {
        format: "es",
        entryFileNames: "background.js",
        postBanner: "export {};",
      },
    },
  },
});

await build({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  build: {
    outDir: outputDirectory,
    emptyOutDir: false,
    rollupOptions: {
      input: resolve(projectRoot, "src/content/main.ts"),
      output: {
        format: "iife",
        entryFileNames: "content.js",
        postBanner: "(() => {})();",
      },
    },
  },
});

await build({
  configFile: false,
  root: projectRoot,
  publicDir: false,
  base: "/",
  build: {
    outDir: outputDirectory,
    emptyOutDir: false,
    rollupOptions: {
      input: {
        options: resolve(projectRoot, "src/options/index.html"),
        sidepanel: resolve(projectRoot, "src/sidepanel/index.html"),
      },
      output: {
        entryFileNames: "assets/[name]-[hash].js",
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash][extname]",
      },
    },
  },
});

await rename(
  resolve(outputDirectory, "src/options/index.html"),
  resolve(outputDirectory, "options.html"),
);
await rename(
  resolve(outputDirectory, "src/sidepanel/index.html"),
  resolve(outputDirectory, "sidepanel.html"),
);

await mkdir(outputDirectory, { recursive: true });
await writeFile(
  resolve(outputDirectory, "manifest.json"),
  `${JSON.stringify(createManifest(packageJson.version), null, 2)}\n`,
);
