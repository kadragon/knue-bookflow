import { describe, expect, it } from 'vitest';
import { buildNoteSections } from './noteLayout';

// Trace: spec_id: SPEC-notes-002, task_id: TASK-024

describe('buildNoteSections', () => {
  it('places the entry section before the notes list when notes exist', () => {
    const sections = buildNoteSections(true);
    expect(sections[0]).toBe('entry');
    expect(sections[1]).toBe('list');
  });

  it('places the entry section before the empty state when there are no notes', () => {
    const sections = buildNoteSections(false);
    expect(sections[0]).toBe('entry');
    expect(sections[1]).toBe('empty');
  });
});
