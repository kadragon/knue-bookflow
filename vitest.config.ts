import { defineConfig } from 'vitest/config';

// Trace: SPEC-deps-001 / TASK-067
export default defineConfig({
  test: {
    projects: [
      'packages/backend/vitest.config.ts',
      'packages/frontend/vitest.config.ts',
    ],
  },
});
