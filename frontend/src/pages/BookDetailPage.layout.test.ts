import { describe, expect, it } from 'vitest';
import { NOTES_LIST_SX } from './bookDetailLayout';

// Trace: spec_id: SPEC-book-detail-001, task_id: TASK-031

describe('BookDetailPage layout', () => {
  it('does not constrain the notes list with an inner scrollbar', () => {
    expect(NOTES_LIST_SX).not.toHaveProperty('maxHeight');
    expect(NOTES_LIST_SX).not.toHaveProperty('overflow');
    expect(NOTES_LIST_SX).not.toHaveProperty('overflowY');
  });
});
