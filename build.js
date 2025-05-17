import { build } from 'vite';
import { resolve } from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Ensure dist directory exists
if (!fs.existsSync('dist')) {
  fs.mkdirSync('dist');
}

// Copy static files
function copyStaticFiles() {
  // Copy manifest.json
  fs.copyFileSync(
    resolve(__dirname, 'src/extension/manifest.json'),
    resolve(__dirname, 'dist/manifest.json')
  );

  // Copy HTML files
  const htmlFiles = fs.readdirSync(resolve(__dirname, 'src/extension'))
    .filter(file => file.endsWith('.html'));
  
  htmlFiles.forEach(file => {
    fs.copyFileSync(
      resolve(__dirname, `src/extension/${file}`),
      resolve(__dirname, `dist/${file}`)
    );
  });

  // Copy icons directory
  const iconsDir = resolve(__dirname, 'dist/icons');
  if (!fs.existsSync(iconsDir)) {
    fs.mkdirSync(iconsDir);
  }

  fs.copyFileSync(
    resolve(__dirname, 'src/extension/icons/sherlock.svg'),
    resolve(__dirname, 'dist/icons/sherlock.svg')
  );
}

// Build a single entry point
async function buildEntry(entryPoint) {
  console.log(`Building ${entryPoint}...`);
  
  await build({
    configFile: false,
    build: {
      outDir: 'dist',
      emptyOutDir: false,
      lib: {
        entry: resolve(__dirname, `src/extension/${entryPoint}.ts`),
        formats: ['iife'],
        name: `KokoroTTS_${entryPoint}`,
        fileName: () => `${entryPoint}.js`
      },
      rollupOptions: {
        output: {
          manualChunks: undefined
        }
      }
    }
  });
}

// Main build function
async function main() {
  try {
    // Copy static files first
    copyStaticFiles();
    
    // Build each entry point
    await buildEntry('background');
    await buildEntry('popup');
    await buildEntry('offscreen');
    
    console.log('Build completed successfully!');
  } catch (error) {
    console.error('Build failed:', error);
    process.exit(1);
  }
}

main();
