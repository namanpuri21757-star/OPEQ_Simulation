import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

// The dev proxy lets the client run on Vite's port while every /api and
// /socket.io call still reaches the authoritative backend on port 3000.
export default defineConfig({
  root: here('./src/client'),
  plugins: [react()],
  resolve: {
    alias: { '@shared': here('./src/shared') },
  },
  build: {
    outDir: here('./dist/client'),
    emptyOutDir: true,
    sourcemap: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: 'http://localhost:3000', ws: true, changeOrigin: true },
    },
  },
});
