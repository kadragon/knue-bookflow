// Trace: spec_id: SPEC-notes-002, task_id: TASK-024

export type NoteSection = 'entry' | 'list' | 'empty';

export function buildNoteSections(hasNotes: boolean): NoteSection[] {
  return ['entry', hasNotes ? 'list' : 'empty'];
}
