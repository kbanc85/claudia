import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const apiProxy = process.env.VITE_API_PROXY || 'http://localhost:3849';

export default defineConfig({
  plugins: [react()],
  root: '.',
  publicDir: 'public',
  server: {
    port: 5173,
    proxy: {
      '/api': apiProxy,
      '/health': apiProxy
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true
  }
});
