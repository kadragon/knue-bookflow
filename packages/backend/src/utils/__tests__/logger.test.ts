/**
 * Logger tests
 * Trace: spec_id: SPEC-backend-refactor-001, task_id: TASK-079
 */

import { describe, expect, it, vi } from 'vitest';
import { createDebugLogger, isDebugEnabled } from '../logger';

describe('isDebugEnabled', () => {
  it('returns true only when env.DEBUG is "true"', () => {
    expect(isDebugEnabled({ DEBUG: 'true' })).toBe(true);
    expect(isDebugEnabled({ DEBUG: 'false' })).toBe(false);
    expect(isDebugEnabled({ DEBUG: '1' })).toBe(false);
    expect(isDebugEnabled({ DEBUG: undefined })).toBe(false);
  });
});

describe('createDebugLogger', () => {
  it('logs when enabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logDebug = createDebugLogger(true);

    logDebug('hello', { ok: true });

    expect(spy).toHaveBeenCalledWith('hello', { ok: true });
    spy.mockRestore();
  });

  it('does not log when disabled', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const logDebug = createDebugLogger(false);

    logDebug('hello');

    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
