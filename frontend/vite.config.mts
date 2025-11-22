import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Trace: spec_id: SPEC-frontend-001, task_id: TASK-019
export default defineConfig({
  root: 'frontend',
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
});
