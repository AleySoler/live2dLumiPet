import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, 'src', 'renderer'),
  base: './',
  publicDir: path.join(root, 'public'),
  plugins: [react()],
  resolve: {
    alias: {
      '@shared': path.join(root, 'src', 'shared'),
    },
  },
  build: {
    outDir: path.join(root, 'dist', 'renderer'),
    emptyOutDir: true,
    target: 'esnext',
    assetsInlineLimit: 0,
    sourcemap: false,
    chunkSizeWarningLimit: 6000,
    rollupOptions: {
      input: {
        pet: path.join(root, 'src', 'renderer', 'pet.html'),
        control: path.join(root, 'src', 'renderer', 'control.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
