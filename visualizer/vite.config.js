import { defineConfig } from 'vite';

export default defineConfig({
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3849',
      '/health': 'http://localhost:3849'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
