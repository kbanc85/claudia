import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3849',
        changeOrigin: true,
      },
      '/health': {
        target: 'http://localhost:3849',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
    rollupOptions: {
      output: {
        manualChunks: {
          three: ['three'],
          'd3-force-3d': ['d3-force-3d'],
        },
      },
    },
  },
  optimizeDeps: {
    include: ['three', 'd3-force-3d'],
    exclude: ['better-sqlite3'],
  },
});
