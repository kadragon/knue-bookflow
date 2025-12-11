import { describe, expect, it } from 'vitest';
import { shouldShowPlannedLabel } from './noteCta';

// Trace: spec_id: SPEC-notes-002, task_id: TASK-025

describe('shouldShowPlannedLabel', () => {
  it('returns false when note count is zero', () => {
    expect(shouldShowPlannedLabel(0)).toBe(false);
  });

  it('returns false when note count is positive', () => {
    expect(shouldShowPlannedLabel(3)).toBe(false);
  });
});
