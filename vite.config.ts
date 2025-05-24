import { defineConfig, PluginOption } from "vite";
import removeConsole from "vite-plugin-remove-console";
import webExtension from "vite-plugin-web-extension";

const debug = true;

let plugins: PluginOption[] = []

// plugins.push(removeConsole());
plugins.push(webExtension({
    additionalInputs: ["src/offscreen.html", "src/kokoro-worker.ts"]
  }));

if (!debug) {
  plugins.push(removeConsole());
}

export default defineConfig({
  plugins,
  build: {
    minify: !debug,
    sourcemap: debug,
  }
});