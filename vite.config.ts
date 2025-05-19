import { defineConfig, PluginOption } from "vite";
import removeConsole from "vite-plugin-remove-console";
import webExtension from "vite-plugin-web-extension";

let plugins: PluginOption[] = []

// plugins.push(removeConsole());
plugins.push(webExtension({
    additionalInputs: ["src/offscreen.html"]
  }));

plugins.push(removeConsole());

export default defineConfig({
  plugins,
  build: {
    minify: false,
    sourcemap: true,
  }
});