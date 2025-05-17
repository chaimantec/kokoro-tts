import { defineConfig } from "vite";
import webExtension from "vite-plugin-web-extension";

export default defineConfig({
  plugins: [webExtension({
    additionalInputs: ["src/offscreen.html"]
  })],
  build: {
    minify: false,
    sourcemap: true,
  }
});