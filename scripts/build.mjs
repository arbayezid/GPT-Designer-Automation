import { copyFile, readFile, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const root = process.cwd();
const dist = resolve(root, 'dist');

await rm(dist, { recursive: true, force: true });

const shared = {
  configFile: false,
  root,
  base: './',
  logLevel: 'info',
  plugins: [react()],
};

await build({
  ...shared,
  publicDir: 'public',
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    rollupOptions: {
      input: resolve(root, 'src/popup/popup.html'),
      output: {
        entryFileNames: 'assets/[name].js',
        chunkFileNames: 'assets/[name].js',
        assetFileNames: 'assets/[name][extname]',
      },
    },
  },
});

const nestedPopupHtml = resolve(dist, 'src/popup/popup.html');
const popupHtml = (await readFile(nestedPopupHtml, 'utf8'))
  .replaceAll('../../assets/', 'assets/')
  .replaceAll('../assets/', 'assets/');
await writeFile(resolve(dist, 'popup.html'), popupHtml);
await rm(resolve(dist, 'src'), { recursive: true, force: true });

await build({
  ...shared,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve(root, 'src/background/index.js'),
      name: 'GptDesignerBackground',
      formats: ['iife'],
      fileName: () => 'assets/background.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});

try {
  await copyFile(resolve(root, 'drive-service-account.json'), resolve(dist, 'drive-service-account.json'));
} catch (error) {
  if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT')) {
    throw error;
  }
}

await build({
  ...shared,
  publicDir: false,
  build: {
    outDir: 'dist',
    emptyOutDir: false,
    sourcemap: true,
    lib: {
      entry: resolve(root, 'src/content/index.js'),
      name: 'GptDesignerContent',
      formats: ['iife'],
      fileName: () => 'assets/content.js',
    },
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
