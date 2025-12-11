import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:8787',
      '/trigger': 'http://localhost:8787',
    },
  },
});