/**
 * Logging utilities
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-079
 */

import type { Env } from '../types';

export function isDebugEnabled(env?: Pick<Env, 'DEBUG'>): boolean {
  return env?.DEBUG === 'true';
}

export function createDebugLogger(
  enabled: boolean,
): (...args: unknown[]) => void {
  return (...args: unknown[]): void => {
    if (enabled) {
      console.log(...args);
    }
  };
}
