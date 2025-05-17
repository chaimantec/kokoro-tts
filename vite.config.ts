import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { resolve } from 'path';

// Create a function to generate a configuration for each entry point
function createConfig(entryPoint: string) {
  return defineConfig({
    build: {
      outDir: 'dist',
      emptyOutDir: false, // Don't empty the output directory for each build
      lib: {
        entry: resolve(__dirname, `src/extension/${entryPoint}.ts`),
        formats: ['iife'],
        name: `KokoroTTS_${entryPoint}`,
        fileName: () => `${entryPoint}.js`
      },
      rollupOptions: {
        output: {
          // Ensure no external dependencies
          manualChunks: undefined
        }
      }
    },
    plugins: entryPoint === 'background' ? [
      // Only include static copy plugin in the first build
      viteStaticCopy({
        targets: [
          {
            src: 'src/extension/manifest.json',
            dest: ''
          },
          {
            src: 'src/extension/*.html',
            dest: ''
          },
          {
            src: 'src/extension/icons',
            dest: ''
          }
        ]
      })
    ] : []
  });
}

// Export an array of configurations for each entry point
export default [
  createConfig('background'),
  createConfig('popup'),
  createConfig('offscreen')
];
