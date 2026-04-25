import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return;
          if (
            /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom)[\\/]/.test(
              id,
            )
          )
            return 'vendor';
          if (
            /[\\/]node_modules[\\/](@mui[\\/](material|icons-material)|@emotion[\\/](react|styled))[\\/]/.test(
              id,
            )
          )
            return 'ui';
          if (/[\\/]node_modules[\\/]@tanstack[\\/]react-query[\\/]/.test(id))
            return 'query';
        },
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/trigger': 'http://localhost:8787',
    },
  },
});
