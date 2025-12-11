// Trace: spec_id: SPEC-notes-002, task_id: TASK-025

/**
 * Determines whether to show the placeholder note state label on book cards.
 * Requirement: the placeholder should no longer be shown, even when there are zero notes.
 */
export function shouldShowPlannedLabel(_noteCount: number): boolean {
  return false;
}
