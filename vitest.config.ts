import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    // Pin the `src/...` alias to an absolute path so alias imports (from tests)
    // and relative imports (`./store` inside src) resolve to the SAME module
    // instance. Without this, module-level singletons like the `paperbell` store
    // get duplicated and cross-module state doesn't line up in tests.
    alias: {
      src: fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
